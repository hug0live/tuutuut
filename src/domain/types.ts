export type Stop = {
  id: string;
  name: string;
  lat?: number;
  lon?: number;
};

export type LineDirection = {
  id: string;
  name: string;
};

export type DirectionOption = {
  key: string;
  name: string;
  lineCount: number;
};

export type Line = {
  id: string;
  shortName: string;
  longName?: string;
  color?: string;
  textColor?: string;
  directions?: LineDirection[];
};

export type WatchSelectionLine = {
  line: Line;
  direction: LineDirection;
};

export type WatchSelection = {
  id: string;
  stop: Stop;
  directionKey: string;
  directionName: string;
  lines: WatchSelectionLine[];
};

export type LineStop = {
  stopId: string;
  stopName: string;
  sequence: number;
  distanceFromStart?: number;
};

export type VehicleStatus = "IN_TRANSIT" | "STOPPED" | "UNKNOWN";

export type VehiclePosition = {
  vehicleId: string;
  lineId: string;
  directionId?: string;
  stopIdPrevious?: string;
  stopIdNext?: string;
  progressBetweenStops?: number;
  timestamp: string;
  status?: VehicleStatus;
};

export type RealtimePassageStatus = "DUE" | "APPROACHING" | "SCHEDULED";

export type RealtimePassage = {
  vehicleId: string;
  lineId: string;
  stopId: string;
  directionId?: string;
  expectedAt: string;
  minutesAway: number;
  status: RealtimePassageStatus;
  sourceType?: "REALTIME" | "THEORETICAL";
};

export type DataSourceMode = "tcl";

export type AdapterSourceInfo = {
  mode: DataSourceMode;
  label: string;
  detail: string;
  realtime: boolean;
};
