import type { LineStop, RealtimePassageStatus, VehiclePosition } from "./types";

export type EstimatedArrival = {
  vehicleId: string;
  lineId: string;
  secondsAway: number;
  minutesAway: number;
  expectedAt: string;
  status: RealtimePassageStatus;
  sourceType?: "REALTIME" | "THEORETICAL";
};

const DEFAULT_SEGMENT_SECONDS = 90;
const DEFAULT_DWELL_SECONDS = 20;
const FALLBACK_PROGRESS = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getArrivalStatus(secondsAway: number): RealtimePassageStatus {
  if (secondsAway <= 45) {
    return "DUE";
  }

  if (secondsAway <= 180) {
    return "APPROACHING";
  }

  return "SCHEDULED";
}

function estimateVehicleArrivalSeconds(vehicle: VehiclePosition, lineStops: LineStop[]): number | null {
  if (lineStops.length === 0) {
    return null;
  }

  const targetIndex = lineStops.length - 1;
  const stopIndexById = new Map(lineStops.map((stop, index) => [stop.stopId, index]));
  const previousIndex = vehicle.stopIdPrevious ? stopIndexById.get(vehicle.stopIdPrevious) : undefined;
  const nextIndex = vehicle.stopIdNext ? stopIndexById.get(vehicle.stopIdNext) : undefined;

  if (previousIndex === targetIndex && vehicle.status === "STOPPED") {
    return 0;
  }

  if (previousIndex === undefined && nextIndex === undefined) {
    return null;
  }

  if (
    (previousIndex !== undefined && previousIndex > targetIndex) ||
    (nextIndex !== undefined && nextIndex > targetIndex)
  ) {
    return null;
  }

  if (previousIndex !== undefined && nextIndex !== undefined && nextIndex > previousIndex) {
    const progress = clamp(vehicle.progressBetweenStops ?? FALLBACK_PROGRESS, 0, 1);
    const remainingCurrentSegmentSeconds = DEFAULT_SEGMENT_SECONDS * (1 - progress);
    const remainingFullSegments = Math.max(0, targetIndex - nextIndex);

    return Math.round(remainingCurrentSegmentSeconds + remainingFullSegments * DEFAULT_SEGMENT_SECONDS);
  }

  if (nextIndex !== undefined) {
    const progress = clamp(vehicle.progressBetweenStops ?? FALLBACK_PROGRESS, 0, 1);
    const remainingCurrentSegmentSeconds = DEFAULT_SEGMENT_SECONDS * (1 - progress);
    const remainingFullSegments = Math.max(0, targetIndex - nextIndex);

    return Math.round(remainingCurrentSegmentSeconds + remainingFullSegments * DEFAULT_SEGMENT_SECONDS);
  }

  if (previousIndex !== undefined) {
    if (previousIndex === targetIndex) {
      return 0;
    }

    const remainingSegments = Math.max(0, targetIndex - previousIndex);
    return Math.round(DEFAULT_DWELL_SECONDS + remainingSegments * DEFAULT_SEGMENT_SECONDS);
  }

  return null;
}

export function estimateNextArrival(
  lineStops: LineStop[],
  vehicles: VehiclePosition[],
  nowMs = Date.now()
): EstimatedArrival | null {
  const arrivals = estimateArrivals(lineStops, vehicles, nowMs);

  return arrivals[0] ?? null;
}

export function estimateArrivals(
  lineStops: LineStop[],
  vehicles: VehiclePosition[],
  nowMs = Date.now()
): EstimatedArrival[] {
  return vehicles
    .map((vehicle): EstimatedArrival | null => {
      const secondsAway = estimateVehicleArrivalSeconds(vehicle, lineStops);

      if (secondsAway === null) {
        return null;
      }

      return {
        vehicleId: vehicle.vehicleId,
        lineId: vehicle.lineId,
        secondsAway,
        minutesAway: Math.max(0, Math.round(secondsAway / 60)),
        expectedAt: new Date(nowMs + secondsAway * 1000).toISOString(),
        status: getArrivalStatus(secondsAway),
        sourceType: "REALTIME"
      };
    })
    .filter((arrival): arrival is EstimatedArrival => arrival !== null)
    .sort((left, right) => left.secondsAway - right.secondsAway);
}
