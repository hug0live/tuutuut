import type { RealtimePassageRequest, TransportAdapter } from "../tclClient";
import type {
  Line,
  LineStop,
  RealtimePassage,
  Stop,
  VehiclePosition
} from "../../../domain/types";
import {
  type TheoreticalService,
  type TheoreticalTimetables,
  getCatalogLineStops,
  getCatalogLinesByStop,
  loadCatalog,
  normalizeCatalogText,
  resolveStopIds,
  searchCatalogStops
} from "../t2cCatalogData";
import { filterVehiclesAtOrBeforeAnchor, realtimeService } from "../../realtime/realtimeService";
import type { CityRealtimeConfig } from "../../realtime/types";

type RealtimePassageContext = {
  request: RealtimePassageRequest;
  fullLineStops: LineStop[];
  visibleVehicles: VehiclePosition[];
  realtimePassages: RealtimePassage[];
};

const orderedStopsCache = new Map<string, Promise<LineStop[]>>();

function normalizeText(value: string): string {
  return normalizeCatalogText(value);
}

function normalizeIdentifier(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

export function normalizeT2cRealtimeLineReference(value: string): string {
  return normalizeIdentifier(value).replace(/^[a-z0-9]*line/, "");
}

function getLineStopCacheKey(lineId: string, directionId?: string, anchorStopId?: string): string {
  return `${lineId}::${directionId ?? "all"}::${anchorStopId ?? "all"}`;
}

async function loadOrderedLineStops(
  lineId: string,
  directionId?: string,
  anchorStopId?: string
): Promise<LineStop[]> {
  const cacheKey = getLineStopCacheKey(lineId, directionId, anchorStopId);
  const cachedValue = orderedStopsCache.get(cacheKey);

  if (cachedValue) {
    return cachedValue;
  }

  const pendingValue = getCatalogLineStops(lineId, directionId, anchorStopId);
  orderedStopsCache.set(cacheKey, pendingValue);
  return pendingValue;
}

function mapPassageTypeToStatus(sourceType: "REALTIME" | "THEORETICAL", expectedAt: string, nowMs: number): RealtimePassage["status"] {
  const secondsAway = Math.max(0, Math.round((Date.parse(expectedAt) - nowMs) / 1000));

  if (secondsAway <= 45) {
    return "DUE";
  }

  if (sourceType === "REALTIME" || secondsAway <= 180) {
    return "APPROACHING";
  }

  return "SCHEDULED";
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function getWeekdayIndex(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

function isServiceActive(
  service: TheoreticalService,
  dateKey: string,
  weekdayIndex: number,
  timetables: TheoreticalTimetables
): boolean {
  const dayExceptions = timetables.exceptions[dateKey];
  const serviceIndex = timetables.services.findIndex((candidate) => candidate.id === service.id);

  if (serviceIndex >= 0) {
    if (dayExceptions?.remove.includes(serviceIndex)) {
      return false;
    }

    if (dayExceptions?.add.includes(serviceIndex)) {
      return true;
    }
  }

  if (dateKey < service.startDate || dateKey > service.endDate) {
    return false;
  }

  return service.days.charAt(weekdayIndex) === "1";
}

function buildDateFromSeconds(baseDate: Date, totalSeconds: number): Date {
  const nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0, 0);
  nextDate.setSeconds(totalSeconds);
  return nextDate;
}

function lowerBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const middleValue = values[middle] ?? 0;

    if (middleValue < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function getScheduleKey(lineId: string, directionId: string | undefined, stopId: string): string {
  return `${lineId}|${directionId ?? "0"}|${stopId}`;
}

function computeMinimumScheduledTravelSeconds(
  timetables: TheoreticalTimetables,
  lineId: string,
  directionId: string | undefined,
  originStopId: string,
  targetStopId: string,
  serviceIndex: number
): number | null {
  if (originStopId === targetStopId) {
    return 0;
  }

  const originSchedules = timetables.stopSchedules[getScheduleKey(lineId, directionId, originStopId)] ?? [];
  const targetSchedules = timetables.stopSchedules[getScheduleKey(lineId, directionId, targetStopId)] ?? [];
  const originDepartures = originSchedules.find(([candidateServiceIndex]) => candidateServiceIndex === serviceIndex)?.[1];
  const targetDepartures = targetSchedules.find(([candidateServiceIndex]) => candidateServiceIndex === serviceIndex)?.[1];

  if (!originDepartures || !targetDepartures || originDepartures.length === 0 || targetDepartures.length === 0) {
    return null;
  }

  let originIndex = 0;
  let minimumTravelSeconds: number | null = null;

  for (const targetDeparture of targetDepartures) {
    while (
      originIndex + 1 < originDepartures.length &&
      (originDepartures[originIndex + 1] ?? Number.POSITIVE_INFINITY) <= targetDeparture
    ) {
      originIndex += 1;
    }

    const originDeparture = originDepartures[originIndex];

    if (originDeparture === undefined || originDeparture > targetDeparture) {
      continue;
    }

    const travelSeconds = targetDeparture - originDeparture;

    if (travelSeconds < 0) {
      continue;
    }

    minimumTravelSeconds =
      minimumTravelSeconds === null ? travelSeconds : Math.min(minimumTravelSeconds, travelSeconds);
  }

  return minimumTravelSeconds;
}

function isImpossibleTheoreticalPassage(
  context: RealtimePassageContext,
  timetables: TheoreticalTimetables,
  physicalStopId: string,
  serviceIndex: number,
  secondsAway: number
): boolean {
  if (context.visibleVehicles.length > 0) {
    return false;
  }

  const originStopId = context.fullLineStops[0]?.stopId;

  if (!originStopId) {
    return false;
  }

  const minimumTravelSeconds = computeMinimumScheduledTravelSeconds(
    timetables,
    context.request.lineId,
    context.request.directionId,
    originStopId,
    physicalStopId,
    serviceIndex
  );

  if (minimumTravelSeconds === null) {
    return false;
  }

  return secondsAway + 60 < minimumTravelSeconds;
}

function getImminentVisiblePassageCount(
  context: RealtimePassageContext,
  physicalStopId: string,
  minimumTravelSeconds: number,
  nowMs: number
): number {
  return context.realtimePassages.filter((passage) => {
    if (passage.stopId !== physicalStopId) {
      return false;
    }

    const secondsAway = Math.max(0, Math.round((Date.parse(passage.expectedAt) - nowMs) / 1000));
    return secondsAway + 60 < minimumTravelSeconds;
  }).length;
}

async function buildTheoreticalPassages(
  stopId: string,
  contexts: RealtimePassageContext[]
): Promise<RealtimePassage[]> {
  if (contexts.length === 0) {
    return [];
  }

  const runtime = await loadCatalog();
  const timetables = runtime.theoreticalTimetables;

  if (!timetables) {
    return [];
  }

  const targetStopIds = resolveStopIds(runtime, stopId);
  const nowMs = Date.now();
  const nowDate = new Date(nowMs);
  const results: RealtimePassage[] = [];
  const seenKeys = new Set<string>();

  for (let offsetDays = 0; offsetDays <= 1; offsetDays += 1) {
    const serviceDate = new Date();
    serviceDate.setHours(0, 0, 0, 0);
    serviceDate.setDate(serviceDate.getDate() + offsetDays);
    const dateKey = formatLocalDateKey(serviceDate);
    const weekdayIndex = getWeekdayIndex(serviceDate);
    const thresholdSeconds =
      offsetDays === 0
        ? nowDate.getHours() * 3600 + nowDate.getMinutes() * 60 + nowDate.getSeconds()
        : 0;

    contexts.forEach((context) => {
      targetStopIds.forEach((physicalStopId) => {
        const scheduleKey = getScheduleKey(context.request.lineId, context.request.directionId, physicalStopId);
        const scheduleEntries = timetables.stopSchedules[scheduleKey] ?? [];
        let imminentAcceptedCount = 0;

        scheduleEntries.forEach(([serviceIndex, departures]) => {
          const service = timetables.services[serviceIndex];

          if (!service || !isServiceActive(service, dateKey, weekdayIndex, timetables)) {
            return;
          }

          const departureIndex = lowerBound(departures, thresholdSeconds);

          for (let index = departureIndex; index < Math.min(departureIndex + 3, departures.length); index += 1) {
            const departureSeconds = departures[index];

            if (departureSeconds === undefined) {
              continue;
            }

            const departureDate = buildDateFromSeconds(serviceDate, departureSeconds);
            const expectedAt = departureDate.toISOString();
            const seenKey = `${context.request.lineId}:${context.request.directionId ?? ""}:${physicalStopId}:${expectedAt}`;

            if (seenKeys.has(seenKey)) {
              continue;
            }

            seenKeys.add(seenKey);
            const secondsAway = Math.max(0, Math.round((departureDate.getTime() - nowMs) / 1000));

            const originStopId = context.fullLineStops[0]?.stopId;
            const minimumTravelSeconds =
              originStopId
                ? computeMinimumScheduledTravelSeconds(
                    timetables,
                    context.request.lineId,
                    context.request.directionId,
                    originStopId,
                    physicalStopId,
                    serviceIndex
                  )
                : null;

            if (isImpossibleTheoreticalPassage(context, timetables, physicalStopId, serviceIndex, secondsAway)) {
              continue;
            }

            if (minimumTravelSeconds !== null && secondsAway + 60 < minimumTravelSeconds) {
              const occupiedImminentSlots =
                getImminentVisiblePassageCount(context, physicalStopId, minimumTravelSeconds, nowMs) +
                imminentAcceptedCount;

              if (occupiedImminentSlots >= context.visibleVehicles.length) {
                continue;
              }

              imminentAcceptedCount += 1;
            }

            results.push({
              vehicleId: `${context.request.lineId}:${service.id}:${departureSeconds}`,
              lineId: context.request.lineId,
              stopId,
              ...(context.request.directionId ? { directionId: context.request.directionId } : {}),
              expectedAt,
              minutesAway: Math.max(0, Math.round(secondsAway / 60)),
              status: mapPassageTypeToStatus("THEORETICAL", expectedAt, nowMs),
              sourceType: "THEORETICAL"
            });
          }
        });
      });
    });

    if (results.length >= 16) {
      break;
    }
  }

  return results.sort((left, right) => left.expectedAt.localeCompare(right.expectedAt)).slice(0, 16);
}

export function createT2cAdapter(realtimeConfig: CityRealtimeConfig): TransportAdapter {
  const adapter: TransportAdapter = {
  source: {
    mode: "t2c",
    label: "GPS temps reel via Bus Tracker",
    detail:
      "Topologie GTFS locale + positions vehicules reelles via Bus Tracker pour le reseau T2C. Repli theorique si necessaire.",
    realtime: true
  },

  async searchStops(query: string): Promise<Stop[]> {
    return searchCatalogStops(query);
  },

  async getLinesByStop(stopId: string): Promise<Line[]> {
    return getCatalogLinesByStop(stopId);
  },

  async getLineStops(lineId: string, directionId?: string, anchorStopId?: string): Promise<LineStop[]> {
    return loadOrderedLineStops(lineId, directionId, anchorStopId);
  },

  async getRealtimeVehicles(
    lineId: string,
    directionId?: string,
    anchorStopId?: string
  ): Promise<VehiclePosition[]> {
    const [{ lineById, stopById }, fullLineStops, displayedLineStops] = await Promise.all([
      loadCatalog(),
      loadOrderedLineStops(lineId, directionId),
      loadOrderedLineStops(lineId, directionId, anchorStopId)
    ]);
    const line = lineById.get(lineId);

    if (!line || fullLineStops.length === 0) {
      return [];
    }

    const vehicles = await realtimeService.getVehicles({
      networkId: realtimeConfig.networkId,
      line,
      ...(directionId ? { directionId } : {}),
      lineStops: fullLineStops,
      stopById,
      ...(realtimeConfig.normalizeLineReference
        ? { normalizeLineReference: realtimeConfig.normalizeLineReference }
        : {})
    });
    return filterVehiclesAtOrBeforeAnchor(vehicles, fullLineStops, displayedLineStops);
  },

  async getRealtimePassages(stopId: string, requests: RealtimePassageRequest[] = []): Promise<RealtimePassage[]> {
    const runtime = await loadCatalog();
    const targetStopIds = new Set(resolveStopIds(runtime, stopId));
    const candidateRequests: RealtimePassageRequest[] =
      requests.length > 0
        ? requests
        : runtime.lines.flatMap((line) =>
            line.directions.map<RealtimePassageRequest>((direction) => ({
              lineId: line.id,
              directionId: direction.id,
              directionName: direction.name
            }))
          );
    const requestResults = await Promise.all(
      candidateRequests.map(async (request) => {
        const [fullLineStops, lineStops, vehicles] = await Promise.all([
          loadOrderedLineStops(request.lineId, request.directionId),
          loadOrderedLineStops(request.lineId, request.directionId, request.anchorStopId),
          adapter.getRealtimeVehicles(request.lineId, request.directionId, request.anchorStopId)
        ]);
        const line = runtime.lineById.get(request.lineId);
        const realtimePassages = line
          ? await realtimeService.getPassages({
              networkId: realtimeConfig.networkId,
              line,
              ...(request.directionId ? { directionId: request.directionId } : {}),
              lineStops,
              stopById: runtime.stopById,
              ...(realtimeConfig.normalizeLineReference
                ? { normalizeLineReference: realtimeConfig.normalizeLineReference }
                : {}),
              targetStopIds
            })
          : [];

        return {
          context: {
            request,
            fullLineStops,
            visibleVehicles: vehicles,
            realtimePassages
          },
          realtimePassages
        };
      })
    );
    const theoreticalPassages = await buildTheoreticalPassages(
      stopId,
      requestResults.map((result) => result.context)
    );

    return requestResults
      .flatMap((result) => result.realtimePassages)
      .concat(theoreticalPassages)
      .sort((left, right) => left.expectedAt.localeCompare(right.expectedAt))
      .slice(0, 16);
  }
  };

  return adapter;
}
