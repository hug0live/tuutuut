import type { TransportAdapter } from "../tclClient";
import type {
  Line,
  LineDirection,
  LineStop,
  RealtimePassage,
  Stop,
  VehiclePosition
} from "../../../domain/types";

type CatalogStop = {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
};

type CatalogPattern = {
  id: string;
  directionId: string;
  directionName: string;
  headsign: string;
  tripCount: number;
  stopIds: string[];
};

type CatalogLine = {
  id: string;
  shortName: string;
  longName: string;
  color: string | null;
  textColor: string | null;
  directions: LineDirection[];
  patterns: CatalogPattern[];
};

type Catalog = {
  source: {
    type: string;
    label: string;
    generatedFrom: string;
  };
  stops: CatalogStop[];
  lines: CatalogLine[];
};

type CatalogRuntime = {
  stops: Stop[];
  lines: CatalogLine[];
  stopById: Map<string, Stop>;
  lineById: Map<string, CatalogLine>;
  logicalStopMemberIdsById: Map<string, string[]>;
};

type VehicleSeed = {
  vehicleId: string;
  startOffsetSeconds: number;
  dwellSeconds: number;
};

type PatternProfile = {
  seeds: VehicleSeed[];
  travelDurations: number[];
  cycleDuration: number;
};

const catalogUrl = new URL("../../../mocks/tclBusCatalog.json", import.meta.url).href;
let catalogPromise: Promise<CatalogRuntime> | null = null;
const profileCache = new Map<string, PatternProfile>();

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

async function withLatency<T>(value: T, min = 40, spread = 80): Promise<T> {
  const randomDelay = min + Math.round(Math.random() * spread);
  await sleep(randomDelay);
  return value;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function scoreStop(stop: Stop, query: string): number {
  const normalizedName = normalizeText(stop.name);

  if (!query) {
    return 1;
  }

  if (normalizedName === query) {
    return 120;
  }

  if (normalizedName.startsWith(query)) {
    return 90;
  }

  const includesIndex = normalizedName.indexOf(query);

  if (includesIndex >= 0) {
    return 70 - includesIndex;
  }

  return 0;
}

function naturalSort(left: string, right: string): number {
  return left.localeCompare(right, "fr", { numeric: true, sensitivity: "base" });
}

function getStopGroupKey(stop: CatalogStop): string {
  return normalizeText(stop.name) || stop.id;
}

function buildLogicalStopId(groupKey: string): string {
  return `stop-group:${groupKey}`;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function resolveStopIds(runtime: CatalogRuntime, stopId: string | undefined): string[] {
  if (!stopId) {
    return [];
  }

  return runtime.logicalStopMemberIdsById.get(stopId) ?? [stopId];
}

async function loadCatalog(): Promise<CatalogRuntime> {
  if (catalogPromise) {
    return catalogPromise;
  }

  catalogPromise = fetch(catalogUrl)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while loading local TCL catalog`);
      }

      return (await response.json()) as Catalog;
    })
    .then((catalog) => {
      const physicalStops = catalog.stops.map<Stop>((stop) => ({
        id: stop.id,
        name: stop.name,
        ...(stop.lat !== null ? { lat: stop.lat } : {}),
        ...(stop.lon !== null ? { lon: stop.lon } : {})
      }));
      const groupedStops = new Map<
        string,
        {
          name: string;
          latitudes: number[];
          longitudes: number[];
          memberIds: string[];
        }
      >();

      for (const stop of catalog.stops) {
        const groupKey = getStopGroupKey(stop);
        const existingGroup = groupedStops.get(groupKey);

        if (existingGroup) {
          existingGroup.memberIds.push(stop.id);
          if (stop.lat !== null) {
            existingGroup.latitudes.push(stop.lat);
          }
          if (stop.lon !== null) {
            existingGroup.longitudes.push(stop.lon);
          }
          continue;
        }

        groupedStops.set(groupKey, {
          name: stop.name,
          latitudes: stop.lat !== null ? [stop.lat] : [],
          longitudes: stop.lon !== null ? [stop.lon] : [],
          memberIds: [stop.id]
        });
      }

      const logicalStopMemberIdsById = new Map<string, string[]>();
      const stops = [...groupedStops.entries()]
        .map(([groupKey, group]) => {
          const logicalStopId = buildLogicalStopId(groupKey);
          logicalStopMemberIdsById.set(logicalStopId, group.memberIds);

          const averageLat = average(group.latitudes);
          const averageLon = average(group.longitudes);

          return {
            id: logicalStopId,
            name: group.name,
            ...(averageLat !== null ? { lat: averageLat } : {}),
            ...(averageLon !== null ? { lon: averageLon } : {})
          };
        })
        .sort((left, right) => naturalSort(left.name, right.name));

      return {
        stops,
        lines: catalog.lines,
        stopById: new Map(physicalStops.map((stop) => [stop.id, stop])),
        lineById: new Map(catalog.lines.map((line) => [line.id, line])),
        logicalStopMemberIdsById
      };
    });

  return catalogPromise;
}

function toLineSummary(line: CatalogLine, directions = line.directions): Line {
  return {
    id: line.id,
    shortName: line.shortName,
    ...(line.longName ? { longName: line.longName } : {}),
    ...(line.color ? { color: line.color } : {}),
    ...(line.textColor ? { textColor: line.textColor } : {}),
    ...(directions.length > 0 ? { directions } : {})
  };
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getBestPattern(
  line: CatalogLine,
  directionId?: string,
  anchorStopIds: string[] = []
): CatalogPattern | undefined {
  const matchingDirectionPatterns = directionId
    ? line.patterns.filter((pattern) => pattern.directionId === directionId)
    : [...line.patterns];

  const candidatePatterns =
    anchorStopIds.length > 0 &&
    matchingDirectionPatterns.some((pattern) =>
      anchorStopIds.some((anchorStopId) => pattern.stopIds.includes(anchorStopId))
    )
      ? matchingDirectionPatterns.filter((pattern) =>
          anchorStopIds.some((anchorStopId) => pattern.stopIds.includes(anchorStopId))
        )
      : matchingDirectionPatterns;

  return [...candidatePatterns].sort(
    (left, right) =>
      right.tripCount - left.tripCount ||
      right.stopIds.length - left.stopIds.length ||
      naturalSort(left.headsign, right.headsign)
  )[0];
}

function truncatePatternAtAnchor(pattern: CatalogPattern, anchorStopIds: string[] = []): CatalogPattern {
  if (anchorStopIds.length === 0) {
    return pattern;
  }

  const cutoffIndex = pattern.stopIds.findIndex((stopId) => anchorStopIds.includes(stopId));

  if (cutoffIndex < 0) {
    return pattern;
  }

  return {
    ...pattern,
    id: `${pattern.id}::cut:${cutoffIndex}`,
    stopIds: pattern.stopIds.slice(0, cutoffIndex + 1)
  };
}

function buildPatternProfile(line: CatalogLine, pattern: CatalogPattern): PatternProfile {
  const cachedValue = profileCache.get(pattern.id);

  if (cachedValue) {
    return cachedValue;
  }

  const segmentCount = Math.max(0, pattern.stopIds.length - 1);
  const travelDurations = Array.from({ length: segmentCount }, (_, index) => {
    const hash = hashString(`${line.id}:${pattern.directionId}:${index}`);
    return 24 + (hash % 18);
  });
  const vehicleCount = Math.min(
    4,
    Math.max(1, Math.max(Math.ceil(pattern.stopIds.length / 12), Math.ceil(pattern.tripCount / 140)))
  );
  const dwellSeconds = 8;
  const stopDwellCount = pattern.stopIds.length;
  const cycleDuration =
    travelDurations.reduce((total, duration) => total + duration, 0) + dwellSeconds * stopDwellCount;
  const seeds = Array.from({ length: vehicleCount }, (_, index) => {
    const offset = Math.round((cycleDuration / vehicleCount) * index);
    return {
      vehicleId: `${line.id}-${pattern.directionId}-${index + 1}`,
      startOffsetSeconds: offset,
      dwellSeconds
    };
  });
  const profile = {
    seeds,
    travelDurations,
    cycleDuration
  };

  profileCache.set(pattern.id, profile);
  return profile;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function simulateVehicle(
  line: CatalogLine,
  pattern: CatalogPattern,
  seed: VehicleSeed,
  profile: PatternProfile,
  nowMs: number
): VehiclePosition {
  const nowSeconds = nowMs / 1000;
  let phase = positiveModulo(nowSeconds + seed.startOffsetSeconds, profile.cycleDuration);

  for (let index = 0; index < pattern.stopIds.length; index += 1) {
    const currentStopId = pattern.stopIds[index];

    if (!currentStopId) {
      continue;
    }

    if (phase < seed.dwellSeconds) {
      return {
        vehicleId: seed.vehicleId,
        lineId: line.id,
        directionId: pattern.directionId,
        stopIdPrevious: currentStopId,
        ...(pattern.stopIds[index + 1] ? { stopIdNext: pattern.stopIds[index + 1] } : {}),
        progressBetweenStops: 0,
        timestamp: new Date(nowMs).toISOString(),
        status: "STOPPED"
      };
    }

    phase -= seed.dwellSeconds;

    const nextStopId = pattern.stopIds[index + 1];

    if (!nextStopId) {
      break;
    }

    const travelDuration = profile.travelDurations[index] ?? 30;

    if (phase < travelDuration) {
      return {
        vehicleId: seed.vehicleId,
        lineId: line.id,
        directionId: pattern.directionId,
        stopIdPrevious: currentStopId,
        stopIdNext: nextStopId,
        progressBetweenStops: phase / travelDuration,
        timestamp: new Date(nowMs).toISOString(),
        status: "IN_TRANSIT"
      };
    }

    phase -= travelDuration;
  }

  const finalStopId = pattern.stopIds[pattern.stopIds.length - 1];

  return {
    vehicleId: seed.vehicleId,
    lineId: line.id,
    directionId: pattern.directionId,
    ...(finalStopId ? { stopIdPrevious: finalStopId } : {}),
    timestamp: new Date(nowMs).toISOString(),
    status: "STOPPED"
  };
}

function computeImmediatePassage(
  vehicle: VehiclePosition,
  pattern: CatalogPattern,
  profile: PatternProfile,
  stopId: string,
  nowMs: number
): RealtimePassage | null {
  if (vehicle.stopIdPrevious === stopId && vehicle.status === "STOPPED") {
    return {
      vehicleId: vehicle.vehicleId,
      lineId: vehicle.lineId,
      stopId,
      expectedAt: new Date(nowMs).toISOString(),
      minutesAway: 0,
      status: "DUE",
      ...(vehicle.directionId ? { directionId: vehicle.directionId } : {})
    };
  }

  if (vehicle.stopIdNext !== stopId || vehicle.progressBetweenStops === undefined || !vehicle.stopIdPrevious) {
    return null;
  }

  const previousIndex = pattern.stopIds.indexOf(vehicle.stopIdPrevious);
  const travelDuration = previousIndex >= 0 ? profile.travelDurations[previousIndex] ?? 30 : 30;
  const remainingSeconds = Math.max(0, travelDuration * (1 - vehicle.progressBetweenStops));

  return {
    vehicleId: vehicle.vehicleId,
    lineId: vehicle.lineId,
    stopId,
    expectedAt: new Date(nowMs + remainingSeconds * 1000).toISOString(),
    minutesAway: Math.max(0, Math.round(remainingSeconds / 60)),
    status: remainingSeconds < 45 ? "DUE" : "APPROACHING",
    ...(vehicle.directionId ? { directionId: vehicle.directionId } : {})
  };
}

export const mockAdapter: TransportAdapter = {
  source: {
    mode: "mock",
    label: "GTFS TCL officiel + temps reel simule",
    detail: "Arrets, lignes et directions reels issus d'un snapshot GTFS officiel. Vehicules simules localement.",
    realtime: true
  },

  async searchStops(query: string): Promise<Stop[]> {
    const { stops } = await loadCatalog();
    const normalizedQuery = normalizeText(query);
    const rankedStops = stops
      .map((stop) => ({
        stop,
        score: scoreStop(stop, normalizedQuery)
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || naturalSort(left.stop.name, right.stop.name))
      .slice(0, normalizedQuery ? 40 : 60)
      .map(({ stop }) => stop);

    return withLatency(rankedStops, 40, 70);
  },

  async getLinesByStop(stopId: string): Promise<Line[]> {
    const runtime = await loadCatalog();
    const candidateStopIds = resolveStopIds(runtime, stopId);
    const { lines } = runtime;
    const matchingLines = lines
      .flatMap((line) => {
        const matchingDirections = line.directions.filter((direction) =>
          line.patterns.some(
            (pattern) =>
              pattern.directionId === direction.id &&
              candidateStopIds.some((candidateStopId) => pattern.stopIds.includes(candidateStopId))
          )
        );

        if (matchingDirections.length === 0) {
          return [];
        }

        return [toLineSummary(line, matchingDirections)];
      })
      .sort((left, right) => naturalSort(left.shortName, right.shortName));

    return withLatency(matchingLines, 50, 90);
  },

  async getLineStops(lineId: string, directionId?: string, anchorStopId?: string): Promise<LineStop[]> {
    const runtime = await loadCatalog();
    const { lineById, stopById } = runtime;
    const line = lineById.get(lineId);

    if (!line) {
      return withLatency([], 20, 40);
    }

    const anchorStopIds = resolveStopIds(runtime, anchorStopId);
    const pattern = getBestPattern(line, directionId, anchorStopIds);

    if (!pattern) {
      return withLatency([], 20, 40);
    }

    const displayPattern = truncatePatternAtAnchor(pattern, anchorStopIds);
    const lineStops = displayPattern.stopIds.map((stopId, index) => ({
      stopId,
      stopName: stopById.get(stopId)?.name ?? stopId,
      sequence: index + 1,
      distanceFromStart: index
    }));

    return withLatency(lineStops, 40, 70);
  },

  async getRealtimeVehicles(
    lineId: string,
    directionId?: string,
    anchorStopId?: string
  ): Promise<VehiclePosition[]> {
    const runtime = await loadCatalog();
    const { lineById } = runtime;
    const line = lineById.get(lineId);

    if (!line) {
      return withLatency([], 20, 40);
    }

    const anchorStopIds = resolveStopIds(runtime, anchorStopId);
    const pattern = getBestPattern(line, directionId, anchorStopIds);

    if (!pattern) {
      return withLatency([], 20, 40);
    }

    const displayPattern = truncatePatternAtAnchor(pattern, anchorStopIds);
    const profile = buildPatternProfile(line, displayPattern);
    const nowMs = Date.now();
    const vehicles = profile.seeds.map((seed) =>
      simulateVehicle(line, displayPattern, seed, profile, nowMs)
    );

    return withLatency(vehicles, 50, 90);
  },

  async getRealtimePassages(stopId: string, lineIds?: string[]): Promise<RealtimePassage[]> {
    const runtime = await loadCatalog();
    const { lines, lineById } = runtime;
    const candidateStopIds = resolveStopIds(runtime, stopId);
    const relevantLines = (lineIds && lineIds.length > 0
      ? lineIds.map((lineId) => lineById.get(lineId)).filter((line): line is CatalogLine => Boolean(line))
      : lines
    ).filter((line) =>
      line.patterns.some((pattern) =>
        candidateStopIds.some((candidateStopId) => pattern.stopIds.includes(candidateStopId))
      )
    );
    const nowMs = Date.now();
    const passages = relevantLines
      .flatMap((line) =>
        line.patterns
          .filter((pattern) =>
            candidateStopIds.some((candidateStopId) => pattern.stopIds.includes(candidateStopId))
          )
          .flatMap((pattern) => {
            const profile = buildPatternProfile(line, pattern);
            const matchedStopId =
              candidateStopIds.find((candidateStopId) => pattern.stopIds.includes(candidateStopId)) ?? stopId;

            return profile.seeds
              .map((seed) =>
                computeImmediatePassage(
                  simulateVehicle(line, pattern, seed, profile, nowMs),
                  pattern,
                  profile,
                  matchedStopId,
                  nowMs
                )
              )
              .filter((passage): passage is RealtimePassage => passage !== null);
          })
      )
      .sort((left, right) => left.expectedAt.localeCompare(right.expectedAt))
      .slice(0, 16);

    return withLatency(passages, 40, 70);
  }
};
