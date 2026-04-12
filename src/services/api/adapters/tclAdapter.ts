import type { TransportAdapter } from "../tclClient";
import type {
  Line,
  LineStop,
  RealtimePassage,
  Stop,
  VehiclePosition,
  VehicleStatus
} from "../../../domain/types";
import {
  type CatalogLine,
  getCatalogLineStops,
  getCatalogLinesByStop,
  loadCatalog,
  normalizeCatalogText,
  resolveStopIds,
  searchCatalogStops
} from "../catalogData";
import type { CatalogRuntime } from "../catalogData";

type ProjectedVehicleSegment = {
  stopIdPrevious?: string;
  stopIdNext?: string;
  progressBetweenStops?: number;
  scalar?: number;
};

type CoordinatePoint = {
  lat: number;
  lon: number;
};

type BusTrackerLine = {
  id: number;
  references?: string[];
  number: string;
  girouetteNumber?: string | null;
  color?: string | null;
  textColor?: string | null;
  onlineVehicleCount?: number;
};

type BusTrackerNetwork = {
  id: number;
  ref: string;
  name: string;
  lines?: BusTrackerLine[];
};

type BusTrackerVehicle = {
  id: number;
  number: string;
  designation?: string | null;
  lastSeenAt?: string | null;
  activity?: {
    status?: string;
    since?: string | null;
    lineId?: number;
    markerId?: string;
    position?: {
      latitude: number;
      longitude: number;
    };
  };
};

type VehicleDirectionEstimate = {
  inferredDirection: "forward" | "backward" | "unknown";
  status: VehicleStatus;
};

type VehicleDirectionSnapshot = {
  scalar: number;
  inferredDirection: "forward" | "backward" | "unknown";
  timestampMs: number;
};

const busTrackerApiBaseUrl = normalizeBusTrackerApiBaseUrl(import.meta.env.VITE_BUS_TRACKER_PROXY_PATH);
const busTrackerNetworkId = 91;
const orderedStopsCache = new Map<string, Promise<LineStop[]>>();
const busTrackerLineCache = new Map<string, Promise<BusTrackerLine | null>>();
const vehicleDirectionSnapshots = new Map<string, VehicleDirectionSnapshot>();
let busTrackerNetworkPromise: Promise<BusTrackerNetwork> | null = null;

function normalizeBusTrackerApiBaseUrl(value: string | undefined): string {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return "/api/bus-tracker";
  }

  return trimmedValue.startsWith("/") ? trimmedValue : `/${trimmedValue}`;
}

function normalizeBusTrackerLineRef(value: string): string {
  return normalizeIdentifier(value).replace(/^tclline/, "");
}

function normalizeText(value: string): string {
  return normalizeCatalogText(value);
}

function normalizeIdentifier(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

function getCoordinatePoint(stopById: Map<string, Stop>, stopId: string): CoordinatePoint | null {
  const stop = stopById.get(stopId);

  if (!stop || stop.lat === undefined || stop.lon === undefined) {
    return null;
  }

  return {
    lat: stop.lat,
    lon: stop.lon
  };
}

function toCartesian(point: CoordinatePoint, referenceLat: number): { x: number; y: number } {
  const radians = Math.PI / 180;
  const metersPerLatDegree = 111_132;
  const metersPerLonDegree = 111_320 * Math.cos(referenceLat * radians);

  return {
    x: point.lon * metersPerLonDegree,
    y: point.lat * metersPerLatDegree
  };
}

function projectGpsToLine(
  location: CoordinatePoint,
  lineStops: LineStop[],
  stopById: Map<string, Stop>
): ProjectedVehicleSegment | null {
  const referenceLat = location.lat;
  const projectedLocation = toCartesian(location, referenceLat);
  let bestProjection:
    | {
        distanceMeters: number;
        stopIdPrevious: string;
        stopIdNext: string;
        progressBetweenStops: number;
      }
    | undefined;

  for (let index = 0; index < lineStops.length - 1; index += 1) {
    const currentStop = lineStops[index];
    const nextStop = lineStops[index + 1];

    if (!currentStop || !nextStop) {
      continue;
    }

    const currentPoint = getCoordinatePoint(stopById, currentStop.stopId);
    const nextPoint = getCoordinatePoint(stopById, nextStop.stopId);

    if (!currentPoint || !nextPoint) {
      continue;
    }

    const a = toCartesian(currentPoint, referenceLat);
    const b = toCartesian(nextPoint, referenceLat);
    const segmentX = b.x - a.x;
    const segmentY = b.y - a.y;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

    if (segmentLengthSquared <= 0) {
      continue;
    }

    const rawProgress =
      ((projectedLocation.x - a.x) * segmentX + (projectedLocation.y - a.y) * segmentY) / segmentLengthSquared;
    const progressBetweenStops = clamp(rawProgress, 0, 1);
    const projectionX = a.x + segmentX * progressBetweenStops;
    const projectionY = a.y + segmentY * progressBetweenStops;
    const deltaX = projectedLocation.x - projectionX;
    const deltaY = projectedLocation.y - projectionY;
    const distanceMeters = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (!bestProjection || distanceMeters < bestProjection.distanceMeters) {
      bestProjection = {
        distanceMeters,
        stopIdPrevious: currentStop.stopId,
        stopIdNext: nextStop.stopId,
        progressBetweenStops
      };
    }
  }

  if (!bestProjection || bestProjection.distanceMeters > 450) {
    return null;
  }

  return {
    stopIdPrevious: bestProjection.stopIdPrevious,
    stopIdNext: bestProjection.stopIdNext,
    progressBetweenStops: bestProjection.progressBetweenStops,
    scalar: lineStops.findIndex((stop) => stop.stopId === bestProjection.stopIdPrevious) + bestProjection.progressBetweenStops
  };
}

function pruneVehicleDirectionSnapshots(nowMs: number): void {
  for (const [snapshotKey, snapshot] of vehicleDirectionSnapshots.entries()) {
    if (nowMs - snapshot.timestampMs > 20 * 60 * 1000) {
      vehicleDirectionSnapshots.delete(snapshotKey);
    }
  }
}

function estimateVehicleDirection(snapshotKey: string, scalar: number, timestamp: string): VehicleDirectionEstimate {
  const nowMs = Number.isFinite(Date.parse(timestamp)) ? Date.parse(timestamp) : Date.now();
  const previousSnapshot = vehicleDirectionSnapshots.get(snapshotKey);
  let inferredDirection: VehicleDirectionSnapshot["inferredDirection"] = previousSnapshot?.inferredDirection ?? "unknown";
  let status: VehicleStatus = previousSnapshot ? "STOPPED" : "UNKNOWN";

  if (previousSnapshot) {
    const delta = scalar - previousSnapshot.scalar;

    if (Math.abs(delta) >= 0.04) {
      inferredDirection = delta > 0 ? "forward" : "backward";
      status = "IN_TRANSIT";
    } else if (previousSnapshot.inferredDirection !== "unknown") {
      inferredDirection = previousSnapshot.inferredDirection;
    }
  }

  vehicleDirectionSnapshots.set(snapshotKey, {
    scalar,
    inferredDirection,
    timestampMs: nowMs
  });
  pruneVehicleDirectionSnapshots(nowMs);

  return {
    inferredDirection,
    status
  };
}

async function fetchBusTrackerJson<T>(path: string): Promise<T> {
  const response = await fetch(`${busTrackerApiBaseUrl}/${path}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`API Bus Tracker indisponible (${response.status}) sur ${path}.`);
  }

  return (await response.json()) as T;
}

async function loadBusTrackerNetwork(): Promise<BusTrackerNetwork> {
  if (busTrackerNetworkPromise) {
    return busTrackerNetworkPromise;
  }

  busTrackerNetworkPromise = fetchBusTrackerJson<BusTrackerNetwork>(`networks/${busTrackerNetworkId}?withDetails=true`);
  return busTrackerNetworkPromise;
}

function busTrackerLineMatchesCatalogLine(candidate: BusTrackerLine, line: CatalogLine): boolean {
  const normalizedShortName = normalizeIdentifier(line.shortName);
  const normalizedLineId = normalizeIdentifier(line.id);
  const candidateNumbers = [candidate.number, candidate.girouetteNumber]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizeIdentifier(value));
  const candidateRefs = (candidate.references ?? []).map(normalizeBusTrackerLineRef);

  return (
    candidateNumbers.includes(normalizedShortName) ||
    candidateNumbers.includes(normalizedLineId) ||
    candidateRefs.includes(normalizedShortName) ||
    candidateRefs.includes(normalizedLineId)
  );
}

async function resolveBusTrackerLine(line: CatalogLine): Promise<BusTrackerLine | null> {
  const cachedValue = busTrackerLineCache.get(line.id);

  if (cachedValue) {
    return cachedValue;
  }

  const pendingValue = loadBusTrackerNetwork().then((network) => {
    const matchedLine = network.lines?.find((candidateLine) => busTrackerLineMatchesCatalogLine(candidateLine, line));
    return matchedLine ?? null;
  });

  busTrackerLineCache.set(line.id, pendingValue);
  return pendingValue;
}

function buildVehicleFromBusTrackerVehicle(
  vehicle: BusTrackerVehicle,
  lineId: string,
  lineStops: LineStop[],
  stopById: Map<string, Stop>
): VehiclePosition | null {
  const position = vehicle.activity?.position;

  if (!position) {
    return null;
  }

  const projectedSegment = projectGpsToLine(
    {
      lat: position.latitude,
      lon: position.longitude
    },
    lineStops,
    stopById
  );

  if (!projectedSegment || projectedSegment.scalar === undefined) {
    return null;
  }

  const timestamp = vehicle.lastSeenAt ?? vehicle.activity?.since ?? new Date().toISOString();
  const estimate = estimateVehicleDirection(
    `${lineId}:${vehicle.id}`,
    projectedSegment.scalar,
    timestamp
  );

  if (estimate.inferredDirection === "backward") {
    return null;
  }

  return {
    vehicleId: String(vehicle.id),
    lineId,
    ...(projectedSegment.stopIdPrevious ? { stopIdPrevious: projectedSegment.stopIdPrevious } : {}),
    ...(projectedSegment.stopIdNext ? { stopIdNext: projectedSegment.stopIdNext } : {}),
    ...(projectedSegment.progressBetweenStops !== undefined
      ? { progressBetweenStops: clamp(projectedSegment.progressBetweenStops, 0, 1) }
      : {}),
    timestamp,
    status: estimate.status
  };
}

async function fetchBusTrackerRealtimeVehicles(
  line: CatalogRuntime["lines"][number],
  lineStops: LineStop[],
  stopById: CatalogRuntime["stopById"]
): Promise<VehiclePosition[]> {
  const busTrackerLine = await resolveBusTrackerLine(line);

  if (!busTrackerLine) {
    return [];
  }

  const vehicles = await fetchBusTrackerJson<BusTrackerVehicle[]>(`lines/${busTrackerLine.id}/online-vehicles`);

  return vehicles
    .map((vehicle) => buildVehicleFromBusTrackerVehicle(vehicle, line.id, lineStops, stopById))
    .filter((vehicle): vehicle is VehiclePosition => vehicle !== null);
}

function findAnchorIndex(fullLineStops: LineStop[], displayedLineStops: LineStop[]): number | null {
  const anchorStop = displayedLineStops.at(-1);

  if (!anchorStop) {
    return null;
  }

  const exactIndex = fullLineStops.findIndex((stop) => stop.stopId === anchorStop.stopId);

  if (exactIndex >= 0) {
    return exactIndex;
  }

  const normalizedAnchorName = normalizeText(anchorStop.stopName);
  const nameMatches = fullLineStops
    .map((stop, index) => ({
      index,
      isMatch: normalizeText(stop.stopName) === normalizedAnchorName
    }))
    .filter((entry) => entry.isMatch)
    .map((entry) => entry.index);

  return nameMatches.at(-1) ?? null;
}

function filterVehiclesAtOrBeforeAnchor(
  vehicles: VehiclePosition[],
  fullLineStops: LineStop[],
  displayedLineStops: LineStop[]
): VehiclePosition[] {
  const anchorIndex = findAnchorIndex(fullLineStops, displayedLineStops);

  if (anchorIndex === null) {
    return vehicles;
  }

  const stopIndexById = new Map(fullLineStops.map((stop, index) => [stop.stopId, index]));

  return vehicles.filter((vehicle) => {
    const previousIndex = vehicle.stopIdPrevious ? stopIndexById.get(vehicle.stopIdPrevious) : undefined;
    const nextIndex = vehicle.stopIdNext ? stopIndexById.get(vehicle.stopIdNext) : undefined;

    if ((previousIndex ?? -1) > anchorIndex || (nextIndex ?? -1) > anchorIndex) {
      return false;
    }

    if (previousIndex === anchorIndex && nextIndex === undefined && vehicle.status !== "STOPPED") {
      return false;
    }

    return true;
  });
}

function buildRealtimePassageFromVehicle(
  vehicle: VehiclePosition,
  lineStops: LineStop[],
  targetStopIds: Set<string>,
  nowMs: number
): RealtimePassage | null {
  const relevantStopIds = lineStops.map((stop) => stop.stopId);
  const currentIndex = vehicle.stopIdPrevious ? relevantStopIds.indexOf(vehicle.stopIdPrevious) : -1;
  const nextIndex = vehicle.stopIdNext ? relevantStopIds.indexOf(vehicle.stopIdNext) : -1;

  if (vehicle.stopIdPrevious && targetStopIds.has(vehicle.stopIdPrevious) && vehicle.status === "STOPPED") {
    return {
      vehicleId: vehicle.vehicleId,
      lineId: vehicle.lineId,
      stopId: vehicle.stopIdPrevious,
      expectedAt: new Date(nowMs).toISOString(),
      minutesAway: 0,
      status: "DUE",
      ...(vehicle.directionId ? { directionId: vehicle.directionId } : {})
    };
  }

  if (currentIndex < 0 || nextIndex <= currentIndex) {
    return null;
  }

  let estimatedSeconds = 0;

  for (let index = currentIndex + 1; index <= nextIndex; index += 1) {
    const traversedSegmentSeconds = index === nextIndex && vehicle.progressBetweenStops !== undefined
      ? Math.max(0, Math.round((1 - clamp(vehicle.progressBetweenStops, 0, 1)) * 45))
      : 45;
    estimatedSeconds += traversedSegmentSeconds;

    const stopId = relevantStopIds[index];

    if (!stopId || !targetStopIds.has(stopId)) {
      continue;
    }

    return {
      vehicleId: vehicle.vehicleId,
      lineId: vehicle.lineId,
      stopId,
      expectedAt: new Date(nowMs + estimatedSeconds * 1000).toISOString(),
      minutesAway: Math.max(0, Math.round(estimatedSeconds / 60)),
      status: estimatedSeconds < 45 ? "DUE" : "APPROACHING",
      ...(vehicle.directionId ? { directionId: vehicle.directionId } : {})
    };
  }

  for (let index = nextIndex + 1; index < relevantStopIds.length; index += 1) {
    estimatedSeconds += 45;
    const stopId = relevantStopIds[index];

    if (!stopId || !targetStopIds.has(stopId)) {
      continue;
    }

    return {
      vehicleId: vehicle.vehicleId,
      lineId: vehicle.lineId,
      stopId,
      expectedAt: new Date(nowMs + estimatedSeconds * 1000).toISOString(),
      minutesAway: Math.max(0, Math.round(estimatedSeconds / 60)),
      status: "SCHEDULED",
      ...(vehicle.directionId ? { directionId: vehicle.directionId } : {})
    };
  }

  return null;
}

export const tclAdapter: TransportAdapter = {
  source: {
    mode: "tcl",
    label: "GPS temps réel via Bus Tracker",
    detail:
      "Topologie GTFS locale + positions véhicules réelles via l'API publique Bus Tracker. Sens affiné au fil des rafraîchissements.",
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

    const vehicles = await fetchBusTrackerRealtimeVehicles(line, fullLineStops, stopById);
    return filterVehiclesAtOrBeforeAnchor(vehicles, fullLineStops, displayedLineStops);
  },

  async getRealtimePassages(stopId: string, lineIds?: string[]): Promise<RealtimePassage[]> {
    const runtime = await loadCatalog();
    const targetStopIds = new Set(resolveStopIds(runtime, stopId));
    const candidateLines = (lineIds ?? [])
      .map((lineId) => runtime.lineById.get(lineId))
      .filter((line): line is CatalogRuntime["lines"][number] => Boolean(line));
    const relevantLines =
      candidateLines.length > 0
        ? candidateLines
        : runtime.lines.filter((line) =>
            line.patterns.some((pattern) => pattern.stopIds.some((patternStopId) => targetStopIds.has(patternStopId)))
          );
    const nowMs = Date.now();
    const passages = await Promise.all(
      relevantLines.map(async (line) => {
        const directionIds = [...new Set(line.patterns.map((pattern) => pattern.directionId))];
        const linePassages = await Promise.all(
          directionIds.map(async (directionId) => {
            const lineStops = await loadOrderedLineStops(line.id, directionId);
            const vehicles = await tclAdapter.getRealtimeVehicles(line.id, directionId);

            return vehicles
              .map((vehicle) => buildRealtimePassageFromVehicle(vehicle, lineStops, targetStopIds, nowMs))
              .filter((passage): passage is RealtimePassage => passage !== null);
          })
        );

        return linePassages.flat();
      })
    );

    return passages
      .flat()
      .sort((left, right) => left.expectedAt.localeCompare(right.expectedAt))
      .slice(0, 16);
  }
};
