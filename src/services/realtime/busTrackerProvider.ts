import type { LineStop, RealtimePassage, Stop, VehiclePosition, VehicleStatus } from "../../domain/types";
import type {
  RealtimeProvider,
  RealtimeProviderLine,
  RealtimeProviderPassageRequest,
  RealtimeProviderRequest
} from "./types";

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
};

type BusTrackerNetwork = {
  id: number;
  ref: string;
  name: string;
  lines?: BusTrackerLine[];
};

type BusTrackerVehicle = {
  id: number;
  lastSeenAt?: string | null;
  activity?: {
    since?: string | null;
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
const networkCache = new Map<number, Promise<BusTrackerNetwork>>();
const lineCache = new Map<string, Promise<BusTrackerLine | null>>();
const vehicleDirectionSnapshots = new Map<string, VehicleDirectionSnapshot>();
const maxVehicleAgeMs = 5 * 60 * 1000;
const maxVehicleClockSkewMs = 2 * 60 * 1000;

function normalizeBusTrackerApiBaseUrl(value: string | undefined): string {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return "/api/bus-tracker";
  }

  return trimmedValue.startsWith("/") ? trimmedValue : `/${trimmedValue}`;
}

function normalizeIdentifier(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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
    cache: "no-store",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`API Bus Tracker indisponible (${response.status}) sur ${path}.`);
  }

  return (await response.json()) as T;
}

function loadBusTrackerNetwork(networkId: number): Promise<BusTrackerNetwork> {
  const cachedValue = networkCache.get(networkId);

  if (cachedValue) {
    return cachedValue;
  }

  const pendingValue = fetchBusTrackerJson<BusTrackerNetwork>(`networks/${networkId}?withDetails=true`);
  networkCache.set(networkId, pendingValue);
  return pendingValue;
}

function busTrackerLineMatchesCatalogLine(
  candidate: BusTrackerLine,
  line: RealtimeProviderLine,
  normalizeLineReference: (value: string) => string
): boolean {
  const normalizedShortName = normalizeIdentifier(line.shortName);
  const normalizedLineId = normalizeIdentifier(line.id);
  const candidateNumbers = [candidate.number, candidate.girouetteNumber]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizeIdentifier(value));
  const candidateRefs = (candidate.references ?? []).map(normalizeLineReference);

  return (
    candidateNumbers.includes(normalizedShortName) ||
    candidateNumbers.includes(normalizedLineId) ||
    candidateRefs.includes(normalizedShortName) ||
    candidateRefs.includes(normalizedLineId)
  );
}

async function resolveBusTrackerLine(request: RealtimeProviderRequest): Promise<BusTrackerLine | null> {
  const cacheKey = `${request.networkId}:${request.line.id}`;
  const cachedValue = lineCache.get(cacheKey);

  if (cachedValue) {
    return cachedValue;
  }

  const normalizeLineReference = request.normalizeLineReference ?? normalizeIdentifier;
  const pendingValue = loadBusTrackerNetwork(request.networkId).then((network) => {
    const matchedLine = network.lines?.find((candidateLine) =>
      busTrackerLineMatchesCatalogLine(candidateLine, request.line, normalizeLineReference)
    );
    return matchedLine ?? null;
  });

  lineCache.set(cacheKey, pendingValue);
  return pendingValue;
}

function buildVehicleFromBusTrackerVehicle(vehicle: BusTrackerVehicle, request: RealtimeProviderRequest): VehiclePosition | null {
  const position = vehicle.activity?.position;

  if (!position) {
    return null;
  }

  const projectedSegment = projectGpsToLine(
    {
      lat: position.latitude,
      lon: position.longitude
    },
    request.lineStops,
    request.stopById
  );

  if (!projectedSegment || projectedSegment.scalar === undefined) {
    return null;
  }

  const timestamp = vehicle.lastSeenAt ?? vehicle.activity?.since;
  const timestampMs = timestamp ? Date.parse(timestamp) : Number.NaN;

  if (!timestamp || !Number.isFinite(timestampMs)) {
    return null;
  }

  const nowMs = Date.now();

  if (nowMs - timestampMs > maxVehicleAgeMs || timestampMs - nowMs > maxVehicleClockSkewMs) {
    return null;
  }

  const estimate = estimateVehicleDirection(`${request.networkId}:${request.line.id}:${vehicle.id}`, projectedSegment.scalar, timestamp);

  if (estimate.inferredDirection === "backward") {
    return null;
  }

  return {
    vehicleId: String(vehicle.id),
    lineId: request.line.id,
    ...(request.directionId ? { directionId: request.directionId } : {}),
    ...(projectedSegment.stopIdPrevious ? { stopIdPrevious: projectedSegment.stopIdPrevious } : {}),
    ...(projectedSegment.stopIdNext ? { stopIdNext: projectedSegment.stopIdNext } : {}),
    ...(projectedSegment.progressBetweenStops !== undefined
      ? { progressBetweenStops: clamp(projectedSegment.progressBetweenStops, 0, 1) }
      : {}),
    timestamp,
    status: estimate.status
  };
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
      sourceType: "REALTIME",
      ...(vehicle.directionId ? { directionId: vehicle.directionId } : {})
    };
  }

  if (currentIndex < 0 || nextIndex <= currentIndex) {
    return null;
  }

  let estimatedSeconds = 0;

  for (let index = currentIndex + 1; index <= nextIndex; index += 1) {
    const traversedSegmentSeconds =
      index === nextIndex && vehicle.progressBetweenStops !== undefined
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
      sourceType: "REALTIME",
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
      sourceType: "REALTIME",
      ...(vehicle.directionId ? { directionId: vehicle.directionId } : {})
    };
  }

  return null;
}

export const busTrackerProvider: RealtimeProvider = {
  id: "bus-tracker",

  async getVehicles(request: RealtimeProviderRequest): Promise<VehiclePosition[]> {
    try {
      const busTrackerLine = await resolveBusTrackerLine(request);

      if (!busTrackerLine) {
        return [];
      }

      const vehicles = await fetchBusTrackerJson<BusTrackerVehicle[]>(`lines/${busTrackerLine.id}/online-vehicles`);

      return vehicles
        .map((vehicle) => buildVehicleFromBusTrackerVehicle(vehicle, request))
        .filter((vehicle): vehicle is VehiclePosition => vehicle !== null);
    } catch (error) {
      console.warn("Bus Tracker realtime vehicles are unavailable.", error);
      return [];
    }
  },

  async getPassages(request: RealtimeProviderPassageRequest): Promise<RealtimePassage[]> {
    const nowMs = request.nowMs ?? Date.now();
    const vehicles = await this.getVehicles(request);

    return vehicles
      .map((vehicle) => buildRealtimePassageFromVehicle(vehicle, request.lineStops, request.targetStopIds, nowMs))
      .filter((passage): passage is RealtimePassage => passage !== null);
  }
};
