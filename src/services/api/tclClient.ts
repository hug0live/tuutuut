import type {
  AdapterSourceInfo,
  Line,
  LineStop,
  RealtimePassage,
  Stop,
  VehiclePosition
} from "../../domain/types";
import { defaultCity } from "../../config/cities";

export type RealtimePassageRequest = {
  lineId: string;
  directionId?: string;
  directionName?: string;
  anchorStopId?: string;
};

export interface TransportAdapter {
  readonly source: AdapterSourceInfo;
  searchStops(query: string): Promise<Stop[]>;
  getLinesByStop(stopId: string): Promise<Line[]>;
  getLineStops(lineId: string, directionId?: string, anchorStopId?: string): Promise<LineStop[]>;
  getRealtimeVehicles(lineId: string, directionId?: string, anchorStopId?: string): Promise<VehiclePosition[]>;
  getRealtimePassages(stopId: string, requests?: RealtimePassageRequest[]): Promise<RealtimePassage[]>;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while loading ${url}`);
  }

  return (await response.json()) as T;
}

export function getTransportAdapter(): TransportAdapter {
  if (!defaultCity) {
    throw new Error("No transport adapter is configured.");
  }

  return defaultCity.adapter;
}

export const tclClient = getTransportAdapter();
export const dataSourceInfo = tclClient.source;
