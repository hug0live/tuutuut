import type { LineStop } from "./types";

export type ProjectedStop = LineStop & {
  ratio: number;
  x: number;
  labelSide: "top" | "bottom";
};

export type LineProjection = {
  width: number;
  height: number;
  padding: number;
  lineY: number;
  projectedStops: ProjectedStop[];
};

const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 220;
const DEFAULT_PADDING = 72;
const DEFAULT_LINE_Y = 110;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeDistances(lineStops: LineStop[]): number[] {
  const candidateDistances = lineStops.map((lineStop) => lineStop.distanceFromStart ?? lineStop.sequence);
  const minDistance = Math.min(...candidateDistances);
  const maxDistance = Math.max(...candidateDistances);

  if (lineStops.length === 1) {
    return [0.5];
  }

  if (maxDistance === minDistance) {
    return lineStops.map((_, index) => index / Math.max(1, lineStops.length - 1));
  }

  return candidateDistances.map((distance) => clamp((distance - minDistance) / (maxDistance - minDistance), 0, 1));
}

export function projectLineStops(
  lineStops: LineStop[],
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  padding = DEFAULT_PADDING
): LineProjection {
  const ratios = normalizeDistances(lineStops);
  const usableWidth = width - padding * 2;

  return {
    width,
    height,
    padding,
    lineY: DEFAULT_LINE_Y,
    projectedStops: lineStops.map((lineStop, index) => ({
      ...lineStop,
      ratio: ratios[index] ?? 0,
      x: padding + usableWidth * (ratios[index] ?? 0),
      labelSide: index % 2 === 0 ? "bottom" : "top"
    }))
  };
}

export function getProjectedStopById(stops: ProjectedStop[], stopId?: string): ProjectedStop | undefined {
  if (!stopId) {
    return undefined;
  }

  return stops.find((stop) => stop.stopId === stopId);
}
