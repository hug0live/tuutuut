import type { LineStop, RealtimePassage, Stop, VehiclePosition } from "../../domain/types";

export type RealtimeProviderId = "bus-tracker";

export type BusTrackerRealtimeConfig = {
  provider: "bus-tracker";
  networkId: number;
  normalizeLineReference?: (value: string) => string;
};

export type CityRealtimeConfig = BusTrackerRealtimeConfig;

export type RealtimeProviderLine = {
  id: string;
  shortName: string;
};

export type RealtimeProviderRequest = {
  networkId: number;
  line: RealtimeProviderLine;
  directionId?: string;
  lineStops: LineStop[];
  stopById: Map<string, Stop>;
  normalizeLineReference?: (value: string) => string;
};

export type RealtimeProviderPassageRequest = RealtimeProviderRequest & {
  targetStopIds: Set<string>;
  nowMs?: number;
};

export interface RealtimeProvider {
  readonly id: RealtimeProviderId;
  getVehicles(request: RealtimeProviderRequest): Promise<VehiclePosition[]>;
  getPassages(request: RealtimeProviderPassageRequest): Promise<RealtimePassage[]>;
}
