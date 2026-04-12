import type {
  AdapterSourceInfo,
  Line,
  LineStop,
  RealtimePassage,
  Stop,
  VehiclePosition
} from "../../domain/types";
import { tclAdapter } from "./adapters/tclAdapter";

export interface TransportAdapter {
  readonly source: AdapterSourceInfo;
  searchStops(query: string): Promise<Stop[]>;
  getLinesByStop(stopId: string): Promise<Line[]>;
  getLineStops(lineId: string, directionId?: string, anchorStopId?: string): Promise<LineStop[]>;
  getRealtimeVehicles(lineId: string, directionId?: string, anchorStopId?: string): Promise<VehiclePosition[]>;
  getRealtimePassages(stopId: string, lineIds?: string[]): Promise<RealtimePassage[]>;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while loading ${url}`);
  }

  return (await response.json()) as T;
}

export function getTransportAdapter(): TransportAdapter {
  return tclAdapter;
}

export const tclClient = getTransportAdapter();
export const dataSourceInfo = tclClient.source;
