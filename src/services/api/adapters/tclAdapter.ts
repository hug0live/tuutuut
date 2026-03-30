import type { TransportAdapter } from "../tclClient";
import type {
  Line,
  LineDirection,
  LineStop,
  RealtimePassage,
  Stop,
  VehiclePosition,
  VehicleStatus
} from "../../../domain/types";
import { mockAdapter } from "./mockAdapter";

type JsonRecord = Record<string, unknown>;

type CatalogStop = {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
};

type CatalogLine = {
  id: string;
  shortName: string;
  longName: string;
  directions: LineDirection[];
};

type Catalog = {
  stops: CatalogStop[];
  lines: CatalogLine[];
};

type CatalogRuntime = {
  stopById: Map<string, CatalogStop>;
  lineById: Map<string, CatalogLine>;
};

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

type RealtimeProvider = "bus-tracker" | "official";

type BusTrackerLine = {
  id: number;
  references?: string[];
  number: string;
  girouetteNumber?: string | null;
  color?: string | null;
  textColor?: string | null;
  onlineVehicleCount?: number;
};

type BusTrackerNetwork = {
  id: number;
  ref: string;
  name: string;
  lines?: BusTrackerLine[];
};

type BusTrackerVehicle = {
  id: number;
  number: string;
  designation?: string | null;
  lastSeenAt?: string | null;
  activity?: {
    status?: string;
    since?: string | null;
    lineId?: number;
    markerId?: string;
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

const catalogUrl = new URL("../../../mocks/tclBusCatalog.json", import.meta.url).href;
const realtimeProxyPath = normalizeProxyPath(import.meta.env.VITE_TCL_REALTIME_PROXY_PATH);
const realtimeProvider = resolveRealtimeProvider(import.meta.env.VITE_TCL_REALTIME_PROVIDER);
const busTrackerApiBaseUrl = "https://bus-tracker.fr/api";
const busTrackerNetworkId = 91;
const orderedStopsCache = new Map<string, Promise<LineStop[]>>();
const busTrackerLineCache = new Map<string, Promise<BusTrackerLine | null>>();
const vehicleDirectionSnapshots = new Map<string, VehicleDirectionSnapshot>();
let catalogPromise: Promise<CatalogRuntime> | null = null;
let busTrackerNetworkPromise: Promise<BusTrackerNetwork> | null = null;

function resolveRealtimeProvider(value: string | undefined): RealtimeProvider {
  return value === "official" ? "official" : "bus-tracker";
}

function normalizeProxyPath(value: string | undefined): string {
  if (!value) {
    return "/api/tcl/realtime";
  }

  return value.startsWith("/") ? value : `/${value}`;
}

function normalizeBusTrackerLineRef(value: string): string {
  return normalizeIdentifier(value).replace(/^tclline/, "");
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function normalizeIdentifier(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getValueAtPath(root: unknown, path: string[]): unknown {
  let current: unknown = root;

  for (const key of path) {
    if (!isRecord(current) || !(key in current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function getRecordAtPaths(root: unknown, paths: string[][]): JsonRecord | undefined {
  for (const path of paths) {
    const candidate = getValueAtPath(root, path);

    if (isRecord(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function getArrayAtPaths(root: unknown, paths: string[][]): unknown[] {
  for (const path of paths) {
    const candidate = getValueAtPath(root, path);

    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function collectTextValues(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (typeof value === "number") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectTextValues(entry));
  }

  if (!isRecord(value)) {
    return [];
  }

  return [
    ...collectTextValues(value.value),
    ...collectTextValues(value.Value),
    ...collectTextValues(value.text),
    ...collectTextValues(value.Text),
    ...collectTextValues(value.name),
    ...collectTextValues(value.Name),
    ...collectTextValues(value.FrontText),
    ...collectTextValues(value.ref),
    ...collectTextValues(value.Ref)
  ];
}

function getTextCandidates(root: unknown, paths: string[][]): string[] {
  return [...new Set(paths.flatMap((path) => collectTextValues(getValueAtPath(root, path))))];
}

function getNumberCandidate(root: unknown, paths: string[][]): number | undefined {
  for (const path of paths) {
    const value = getValueAtPath(root, path);

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsedValue = Number.parseFloat(value);

      if (Number.isFinite(parsedValue)) {
        return parsedValue;
      }
    }
  }

  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeProgress(value: number | undefined): number | undefined {
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }

  if (value > 1 && value <= 100) {
    return clamp(value / 100, 0, 1);
  }

  return clamp(value, 0, 1);
}

function toVehicleStatus(rawStatus: string | undefined, progress: number | undefined): VehicleStatus {
  if (rawStatus) {
    const normalizedStatus = normalizeText(rawStatus);

    if (
      normalizedStatus.includes("stop") ||
      normalizedStatus.includes("quai") ||
      normalizedStatus.includes("layover")
    ) {
      return "STOPPED";
    }

    if (
      normalizedStatus.includes("transit") ||
      normalizedStatus.includes("move") ||
      normalizedStatus.includes("course")
    ) {
      return "IN_TRANSIT";
    }
  }

  if (progress !== undefined && progress === 0) {
    return "STOPPED";
  }

  if (progress !== undefined) {
    return "IN_TRANSIT";
  }

  return "UNKNOWN";
}

function getLineStopCacheKey(lineId: string, directionId?: string, anchorStopId?: string): string {
  return `${lineId}::${directionId ?? "all"}::${anchorStopId ?? "all"}`;
}

async function loadOrderedLineStops(
  lineId: string,
  directionId?: string,
  anchorStopId?: string
): Promise<LineStop[]> {
  const cacheKey = getLineStopCacheKey(lineId, directionId, anchorStopId);
  const cachedValue = orderedStopsCache.get(cacheKey);

  if (cachedValue) {
    return cachedValue;
  }

  const pendingValue = mockAdapter.getLineStops(lineId, directionId, anchorStopId);
  orderedStopsCache.set(cacheKey, pendingValue);
  return pendingValue;
}

async function loadCatalogRuntime(): Promise<CatalogRuntime> {
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
    .then((catalog) => ({
      stopById: new Map(catalog.stops.map((stop) => [stop.id, stop])),
      lineById: new Map(catalog.lines.map((line) => [line.id, line]))
    }));

  return catalogPromise;
}

function collectVehicleActivities(root: unknown): JsonRecord[] {
  const matches: JsonRecord[] = [];
  const seenObjects = new Set<object>();

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        visit(entry);
      });
      return;
    }

    if (!isRecord(value) || seenObjects.has(value)) {
      return;
    }

    seenObjects.add(value);

    const vehicleActivity = value.VehicleActivity;

    if (Array.isArray(vehicleActivity)) {
      vehicleActivity.forEach((entry) => {
        if (isRecord(entry)) {
          matches.push(entry);
        }
      });
    }

    Object.values(value).forEach((entry) => {
      visit(entry);
    });
  }

  visit(root);
  return matches;
}

function createStopNameIndex(lineStops: LineStop[]): Map<string, string> {
  return new Map(lineStops.map((stop) => [normalizeText(stop.stopName), stop.stopId]));
}

function matchStopId(candidateValues: string[], lineStops: LineStop[], stopNameIndex: Map<string, string>): string | undefined {
  const stopIds = new Set(lineStops.map((stop) => stop.stopId));

  for (const candidateValue of candidateValues) {
    if (stopIds.has(candidateValue)) {
      return candidateValue;
    }

    const matchedStopId = stopNameIndex.get(normalizeText(candidateValue));

    if (matchedStopId) {
      return matchedStopId;
    }
  }

  return undefined;
}

function getCoordinatePoint(stopById: Map<string, CatalogStop>, stopId: string): CoordinatePoint | null {
  const stop = stopById.get(stopId);

  if (!stop || stop.lat === null || stop.lon === null) {
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
  stopById: Map<string, CatalogStop>
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
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`API Bus Tracker indisponible (${response.status}) sur ${path}.`);
  }

  return (await response.json()) as T;
}

async function loadBusTrackerNetwork(): Promise<BusTrackerNetwork> {
  if (busTrackerNetworkPromise) {
    return busTrackerNetworkPromise;
  }

  busTrackerNetworkPromise = fetchBusTrackerJson<BusTrackerNetwork>(`networks/${busTrackerNetworkId}?withDetails=true`);
  return busTrackerNetworkPromise;
}

function busTrackerLineMatchesCatalogLine(candidate: BusTrackerLine, line: CatalogLine): boolean {
  const normalizedShortName = normalizeIdentifier(line.shortName);
  const normalizedLineId = normalizeIdentifier(line.id);
  const candidateNumbers = [candidate.number, candidate.girouetteNumber]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizeIdentifier(value));
  const candidateRefs = (candidate.references ?? []).map(normalizeBusTrackerLineRef);

  return (
    candidateNumbers.includes(normalizedShortName) ||
    candidateNumbers.includes(normalizedLineId) ||
    candidateRefs.includes(normalizedShortName) ||
    candidateRefs.includes(normalizedLineId)
  );
}

async function resolveBusTrackerLine(line: CatalogLine): Promise<BusTrackerLine | null> {
  const cachedValue = busTrackerLineCache.get(line.id);

  if (cachedValue) {
    return cachedValue;
  }

  const pendingValue = loadBusTrackerNetwork().then((network) => {
    const matchedLine = network.lines?.find((candidateLine) => busTrackerLineMatchesCatalogLine(candidateLine, line));
    return matchedLine ?? null;
  });

  busTrackerLineCache.set(line.id, pendingValue);
  return pendingValue;
}

function matchesLine(activity: JsonRecord, line: CatalogLine): boolean {
  const candidateValues = getTextCandidates(activity, [
    ["MonitoredVehicleJourney", "LineRef"],
    ["MonitoredVehicleJourney", "PublishedLineName"],
    ["LineRef"],
    ["PublishedLineName"]
  ]);

  if (candidateValues.length === 0) {
    return true;
  }

  const acceptedIdentifiers = new Set(
    [line.id, line.shortName, line.longName].map((value) => normalizeIdentifier(value))
  );

  return candidateValues.some((candidateValue) => {
    const normalizedCandidate = normalizeIdentifier(candidateValue);

    if (acceptedIdentifiers.has(normalizedCandidate)) {
      return true;
    }

    const parts = candidateValue
      .split(/[^a-zA-Z0-9]+/g)
      .map((part) => normalizeIdentifier(part))
      .filter(Boolean);

    return parts.some((part) => acceptedIdentifiers.has(part));
  });
}

function matchesDirection(activity: JsonRecord, directionId: string | undefined, directionName: string | undefined): boolean {
  const candidateValues = getTextCandidates(activity, [
    ["MonitoredVehicleJourney", "DirectionRef"],
    ["MonitoredVehicleJourney", "DirectionName"],
    ["MonitoredVehicleJourney", "DestinationRef"],
    ["MonitoredVehicleJourney", "DestinationName"],
    ["MonitoredVehicleJourney", "DestinationDisplay"]
  ]);

  if (!directionId && !directionName) {
    return true;
  }

  if (candidateValues.length === 0) {
    return true;
  }

  const normalizedDirectionId = directionId ? normalizeIdentifier(directionId) : undefined;
  const normalizedDirectionName = directionName ? normalizeIdentifier(directionName) : undefined;

  return candidateValues.some((candidateValue) => {
    const normalizedCandidate = normalizeIdentifier(candidateValue);

    if (normalizedDirectionId && normalizedCandidate === normalizedDirectionId) {
      return true;
    }

    if (normalizedDirectionName && normalizedCandidate === normalizedDirectionName) {
      return true;
    }

    const parts = candidateValue
      .split(/[^a-zA-Z0-9]+/g)
      .map((part) => normalizeIdentifier(part))
      .filter(Boolean);

    return parts.some((part) => part === normalizedDirectionId || part === normalizedDirectionName);
  });
}

function buildVehicleFromActivity(
  activity: JsonRecord,
  lineId: string,
  directionId: string | undefined,
  lineStops: LineStop[],
  stopById: Map<string, CatalogStop>
): VehiclePosition | null {
  const journey = getRecordAtPaths(activity, [["MonitoredVehicleJourney"]]) ?? activity;
  const vehicleId =
    getTextCandidates(activity, [["VehicleMonitoringRef"], ["ItemIdentifier"], ["VehicleRef"]])[0] ??
    getTextCandidates(journey, [["VehicleRef"]])[0];

  if (!vehicleId) {
    return null;
  }

  const stopNameIndex = createStopNameIndex(lineStops);
  const monitoredCall = getRecordAtPaths(journey, [["MonitoredCall"]]);
  const onwardCalls = getArrayAtPaths(journey, [["OnwardCalls", "OnwardCall"], ["OnwardCall"]]);
  const previousCalls = getArrayAtPaths(journey, [["PreviousCalls", "PreviousCall"], ["PreviousCall"]]);
  const nextStopId = matchStopId(
    [
      ...getTextCandidates(monitoredCall, [["StopPointRef"], ["StopPointName"]]),
      ...getTextCandidates(onwardCalls[0], [["StopPointRef"], ["StopPointName"]])
    ],
    lineStops,
    stopNameIndex
  );
  const previousStopId = matchStopId(
    [
      ...getTextCandidates(previousCalls[previousCalls.length - 1], [["StopPointRef"], ["StopPointName"]]),
      ...getTextCandidates(journey, [["OriginRef"], ["OriginName"]])
    ],
    lineStops,
    stopNameIndex
  );
  const directProgress = normalizeProgress(
    getNumberCandidate(activity, [
      ["ProgressBetweenStops"],
      ["ProgressBetweenStops", "Percentage"],
      ["MonitoredVehicleJourney", "ProgressBetweenStops"],
      ["MonitoredVehicleJourney", "ProgressBetweenStops", "Percentage"]
    ])
  );
  const lat = getNumberCandidate(journey, [
    ["VehicleLocation", "Latitude"],
    ["VehicleLocation", "lat"],
    ["Latitude"]
  ]);
  const lon = getNumberCandidate(journey, [
    ["VehicleLocation", "Longitude"],
    ["VehicleLocation", "lon"],
    ["Longitude"]
  ]);
  const projectedSegment =
    lat !== undefined && lon !== undefined
      ? projectGpsToLine(
          {
            lat,
            lon
          },
          lineStops,
          stopById
        )
      : null;
  const statusValue =
    getTextCandidates(activity, [["ProgressStatus"], ["VehicleStatus"], ["MonitoredVehicleJourney", "ProgressStatus"]])[
      0
    ] ?? getTextCandidates(journey, [["ProgressStatus"], ["VehicleStatus"]])[0];
  const segment = {
    stopIdPrevious: previousStopId ?? projectedSegment?.stopIdPrevious,
    stopIdNext: nextStopId ?? projectedSegment?.stopIdNext,
    progressBetweenStops: directProgress ?? projectedSegment?.progressBetweenStops
  };

  if (!segment.stopIdPrevious && !segment.stopIdNext) {
    return null;
  }

  const timestamp =
    getTextCandidates(activity, [["RecordedAtTime"], ["ValidUntilTime"], ["ResponseTimestamp"]])[0] ??
    new Date().toISOString();

  return {
    vehicleId,
    lineId,
    ...(directionId ? { directionId } : {}),
    ...(segment.stopIdPrevious ? { stopIdPrevious: segment.stopIdPrevious } : {}),
    ...(segment.stopIdNext ? { stopIdNext: segment.stopIdNext } : {}),
    ...(segment.progressBetweenStops !== undefined
      ? { progressBetweenStops: clamp(segment.progressBetweenStops, 0, 1) }
      : {}),
    timestamp,
    status: toVehicleStatus(statusValue, segment.progressBetweenStops)
  };
}

async function fetchRealtimePayload(): Promise<unknown> {
  const response = await fetch(realtimeProxyPath, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Flux TCL temps reel indisponible (${response.status}). Configure ${realtimeProxyPath} via Vite ou un proxy serveur.`
    );
  }

  return response.json();
}

function buildVehicleFromBusTrackerVehicle(
  vehicle: BusTrackerVehicle,
  lineId: string,
  lineStops: LineStop[],
  stopById: Map<string, CatalogStop>
): VehiclePosition | null {
  const position = vehicle.activity?.position;

  if (!position) {
    return null;
  }

  const projectedSegment = projectGpsToLine(
    {
      lat: position.latitude,
      lon: position.longitude
    },
    lineStops,
    stopById
  );

  if (!projectedSegment || projectedSegment.scalar === undefined) {
    return null;
  }

  const timestamp = vehicle.lastSeenAt ?? vehicle.activity?.since ?? new Date().toISOString();
  const estimate = estimateVehicleDirection(
    `${lineId}:${vehicle.id}`,
    projectedSegment.scalar,
    timestamp
  );

  if (estimate.inferredDirection === "backward") {
    return null;
  }

  return {
    vehicleId: String(vehicle.id),
    lineId,
    ...(projectedSegment.stopIdPrevious ? { stopIdPrevious: projectedSegment.stopIdPrevious } : {}),
    ...(projectedSegment.stopIdNext ? { stopIdNext: projectedSegment.stopIdNext } : {}),
    ...(projectedSegment.progressBetweenStops !== undefined
      ? { progressBetweenStops: clamp(projectedSegment.progressBetweenStops, 0, 1) }
      : {}),
    timestamp,
    status: estimate.status
  };
}

async function fetchBusTrackerRealtimeVehicles(
  line: CatalogLine,
  lineStops: LineStop[],
  stopById: Map<string, CatalogStop>
): Promise<VehiclePosition[]> {
  const busTrackerLine = await resolveBusTrackerLine(line);

  if (!busTrackerLine) {
    return [];
  }

  const vehicles = await fetchBusTrackerJson<BusTrackerVehicle[]>(`lines/${busTrackerLine.id}/online-vehicles`);

  return vehicles
    .map((vehicle) => buildVehicleFromBusTrackerVehicle(vehicle, line.id, lineStops, stopById))
    .filter((vehicle): vehicle is VehiclePosition => vehicle !== null);
}

async function fetchOfficialRealtimeVehicles(
  line: CatalogLine,
  lineStops: LineStop[],
  stopById: Map<string, CatalogStop>,
  directionId: string | undefined
): Promise<VehiclePosition[]> {
  const payload = await fetchRealtimePayload();
  const directionName =
    directionId !== undefined
      ? line.directions.find((direction) => direction.id === directionId)?.name
      : undefined;
  const vehicles = collectVehicleActivities(payload)
    .filter((activity) => matchesLine(activity, line))
    .filter((activity) => matchesDirection(activity, directionId, directionName))
    .map((activity) => buildVehicleFromActivity(activity, line.id, directionId, lineStops, stopById))
    .filter((vehicle): vehicle is VehiclePosition => vehicle !== null);

  return [...new Map(vehicles.map((vehicle) => [vehicle.vehicleId, vehicle])).values()].sort((left, right) =>
    left.vehicleId.localeCompare(right.vehicleId, "fr", { numeric: true, sensitivity: "base" })
  );
}

export const tclAdapter: TransportAdapter = {
  source:
    realtimeProvider === "official"
      ? {
          mode: "tcl",
          label: "TCL temps reel via SIRI Lite",
          detail:
            "Topologie GTFS locale + positions vehicules reelles via proxy /api/tcl/realtime. Credentials officiels requis cote serveur.",
          realtime: true
        }
      : {
          mode: "tcl",
          label: "GPS temps reel via Bus Tracker",
          detail:
            "Topologie GTFS TCL locale + positions vehicules reelles via l'API publique Bus Tracker. Sens affine au fil des refresh.",
          realtime: true
        },

  async searchStops(query: string): Promise<Stop[]> {
    return mockAdapter.searchStops(query);
  },

  async getLinesByStop(stopId: string): Promise<Line[]> {
    return mockAdapter.getLinesByStop(stopId);
  },

  async getLineStops(lineId: string, directionId?: string, anchorStopId?: string): Promise<LineStop[]> {
    return loadOrderedLineStops(lineId, directionId, anchorStopId);
  },

  async getRealtimeVehicles(
    lineId: string,
    directionId?: string,
    anchorStopId?: string
  ): Promise<VehiclePosition[]> {
    const [{ lineById, stopById }, lineStops] = await Promise.all([
      loadCatalogRuntime(),
      loadOrderedLineStops(lineId, directionId, anchorStopId)
    ]);
    const line = lineById.get(lineId);

    if (!line || lineStops.length === 0) {
      return [];
    }

    if (realtimeProvider === "official") {
      return fetchOfficialRealtimeVehicles(line, lineStops, stopById, directionId);
    }

    return fetchBusTrackerRealtimeVehicles(line, lineStops, stopById);
  },

  async getRealtimePassages(stopId: string, lineIds?: string[]): Promise<RealtimePassage[]> {
    // Le dashboard principal s'appuie sur VehicleMonitoring. Le stop-monitoring reel reste a raccorder.
    return mockAdapter.getRealtimePassages(stopId, lineIds);
  }
};
