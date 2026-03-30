import { getProjectedStopById, type LineProjection } from "./lineProjection";
import type { VehiclePosition } from "./types";

export type PositionedVehicle = VehiclePosition & {
  x: number;
  y: number;
  stackIndex: number;
};

type ClusterSlot = {
  dx: number;
  dy: number;
};

const BASE_OFFSET_Y = -26;
const CLUSTER_THRESHOLD = 28;
const CLUSTER_SLOTS: ClusterSlot[] = [
  { dx: 0, dy: 0 },
  { dx: -22, dy: -28 },
  { dx: 22, dy: -28 },
  { dx: -44, dy: -56 },
  { dx: 0, dy: -56 },
  { dx: 44, dy: -56 }
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getClusterSlot(index: number): ClusterSlot {
  return CLUSTER_SLOTS[index] ?? CLUSTER_SLOTS[CLUSTER_SLOTS.length - 1] ?? { dx: 0, dy: 0 };
}

export function getVehiclePositionX(vehicle: VehiclePosition, projection: LineProjection): number | null {
  const previousStop = getProjectedStopById(projection.projectedStops, vehicle.stopIdPrevious);
  const nextStop = getProjectedStopById(projection.projectedStops, vehicle.stopIdNext);

  if (previousStop && nextStop) {
    const progress = clamp(vehicle.progressBetweenStops ?? 0, 0, 1);
    return previousStop.x + (nextStop.x - previousStop.x) * progress;
  }

  if (previousStop) {
    return previousStop.x;
  }

  if (nextStop) {
    return nextStop.x;
  }

  return null;
}

export function positionVehicles(vehicles: VehiclePosition[], projection: LineProjection): PositionedVehicle[] {
  const rawVehicles = vehicles
    .map((vehicle) => {
      const x = getVehiclePositionX(vehicle, projection);

      if (x === null) {
        return null;
      }

      return {
        ...vehicle,
        x,
        y: projection.lineY + BASE_OFFSET_Y,
        stackIndex: 0
      };
    })
    .filter((vehicle): vehicle is PositionedVehicle => vehicle !== null)
    .sort((left, right) => left.x - right.x);

  const positionedVehicles: PositionedVehicle[] = [];
  const clusters: PositionedVehicle[][] = [];

  rawVehicles.forEach((vehicle) => {
    const currentCluster = clusters[clusters.length - 1];
    const previousVehicle = currentCluster?.[currentCluster.length - 1];

    if (!currentCluster || !previousVehicle || vehicle.x - previousVehicle.x > CLUSTER_THRESHOLD) {
      clusters.push([vehicle]);
      return;
    }

    currentCluster.push(vehicle);
  });

  clusters.forEach((cluster) => {
    const anchorX = cluster.reduce((sum, vehicle) => sum + vehicle.x, 0) / cluster.length;

    cluster.forEach((vehicle, index) => {
      const slot = getClusterSlot(index);

      positionedVehicles.push({
        ...vehicle,
        stackIndex: index,
        x: clamp(anchorX + slot.dx, projection.padding + 16, projection.width - projection.padding - 16),
        y: projection.lineY + BASE_OFFSET_Y + slot.dy
      });
    });
  });

  return positionedVehicles;
}
