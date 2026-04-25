import type { LineStop, VehiclePosition } from "../../domain/types";
import { busTrackerProvider } from "./busTrackerProvider";
import type { RealtimeProvider, RealtimeProviderPassageRequest, RealtimeProviderRequest } from "./types";

const defaultRealtimeProvider = busTrackerProvider;

export type RealtimeService = {
  getVehicles(request: RealtimeProviderRequest): Promise<VehiclePosition[]>;
  getPassages(request: RealtimeProviderPassageRequest): ReturnType<RealtimeProvider["getPassages"]>;
};

export function createRealtimeService(provider: RealtimeProvider = defaultRealtimeProvider): RealtimeService {
  return {
    getVehicles(request: RealtimeProviderRequest): Promise<VehiclePosition[]> {
      return provider.getVehicles(request);
    },

    getPassages(request: RealtimeProviderPassageRequest): ReturnType<RealtimeProvider["getPassages"]> {
      return provider.getPassages(request);
    }
  };
}

export const realtimeService = createRealtimeService();

function findAnchorIndex(fullLineStops: LineStop[], displayedLineStops: LineStop[]): number | null {
  const anchorStop = displayedLineStops.at(-1);

  if (!anchorStop) {
    return null;
  }

  const exactIndex = fullLineStops.findIndex((stop) => stop.stopId === anchorStop.stopId);

  if (exactIndex >= 0) {
    return exactIndex;
  }

  const normalizedAnchorName = anchorStop.stopName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR");
  const nameMatches = fullLineStops
    .map((stop, index) => ({
      index,
      isMatch: stop.stopName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR") === normalizedAnchorName
    }))
    .filter((entry) => entry.isMatch)
    .map((entry) => entry.index);

  return nameMatches.at(-1) ?? null;
}

export function filterVehiclesAtOrBeforeAnchor(
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
