import type { Line, LineDirection, LineStop, Stop } from "../../domain/types";

export type CatalogStop = {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
};

export type CatalogPattern = {
  id: string;
  directionId: string;
  directionName: string;
  headsign: string;
  tripCount: number;
  stopIds: string[];
};

export type CatalogLine = {
  id: string;
  shortName: string;
  longName: string;
  color: string | null;
  textColor: string | null;
  directions: LineDirection[];
  patterns: CatalogPattern[];
};

type Catalog = {
  source: {
    type: string;
    label: string;
    generatedFrom: string;
  };
  stops: CatalogStop[];
  lines: CatalogLine[];
};

export type CatalogRuntime = {
  stops: Stop[];
  lines: CatalogLine[];
  stopById: Map<string, Stop>;
  lineById: Map<string, CatalogLine>;
  logicalStopMemberIdsById: Map<string, string[]>;
};

const catalogUrl = new URL("../../tclBusCatalog.json", import.meta.url).href;
let catalogPromise: Promise<CatalogRuntime> | null = null;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function naturalSort(left: string, right: string): number {
  return left.localeCompare(right, "fr", { numeric: true, sensitivity: "base" });
}

function getStopGroupKey(stop: CatalogStop): string {
  return normalizeText(stop.name) || stop.id;
}

function buildLogicalStopId(groupKey: string): string {
  return `stop-group:${groupKey}`;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function scoreStop(stop: Stop, query: string): number {
  const normalizedName = normalizeText(stop.name);

  if (!query) {
    return 1;
  }

  if (normalizedName === query) {
    return 120;
  }

  if (normalizedName.startsWith(query)) {
    return 90;
  }

  const includesIndex = normalizedName.indexOf(query);

  if (includesIndex >= 0) {
    return 70 - includesIndex;
  }

  return 0;
}

export async function loadCatalog(): Promise<CatalogRuntime> {
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
    .then((catalog) => {
      const physicalStops = catalog.stops.map<Stop>((stop) => ({
        id: stop.id,
        name: stop.name,
        ...(stop.lat !== null ? { lat: stop.lat } : {}),
        ...(stop.lon !== null ? { lon: stop.lon } : {})
      }));
      const groupedStops = new Map<
        string,
        {
          name: string;
          latitudes: number[];
          longitudes: number[];
          memberIds: string[];
        }
      >();

      for (const stop of catalog.stops) {
        const groupKey = getStopGroupKey(stop);
        const existingGroup = groupedStops.get(groupKey);

        if (existingGroup) {
          existingGroup.memberIds.push(stop.id);
          if (stop.lat !== null) {
            existingGroup.latitudes.push(stop.lat);
          }
          if (stop.lon !== null) {
            existingGroup.longitudes.push(stop.lon);
          }
          continue;
        }

        groupedStops.set(groupKey, {
          name: stop.name,
          latitudes: stop.lat !== null ? [stop.lat] : [],
          longitudes: stop.lon !== null ? [stop.lon] : [],
          memberIds: [stop.id]
        });
      }

      const logicalStopMemberIdsById = new Map<string, string[]>();
      const stops = [...groupedStops.entries()]
        .map(([groupKey, group]) => {
          const logicalStopId = buildLogicalStopId(groupKey);
          logicalStopMemberIdsById.set(logicalStopId, group.memberIds);

          const averageLat = average(group.latitudes);
          const averageLon = average(group.longitudes);

          return {
            id: logicalStopId,
            name: group.name,
            ...(averageLat !== null ? { lat: averageLat } : {}),
            ...(averageLon !== null ? { lon: averageLon } : {})
          };
        })
        .sort((left, right) => naturalSort(left.name, right.name));

      return {
        stops,
        lines: catalog.lines,
        stopById: new Map(physicalStops.map((stop) => [stop.id, stop])),
        lineById: new Map(catalog.lines.map((line) => [line.id, line])),
        logicalStopMemberIdsById
      };
    });

  return catalogPromise;
}

export function normalizeCatalogText(value: string): string {
  return normalizeText(value);
}

export function sortNaturally(left: string, right: string): number {
  return naturalSort(left, right);
}

export function resolveStopIds(runtime: CatalogRuntime, stopId: string | undefined): string[] {
  if (!stopId) {
    return [];
  }

  return runtime.logicalStopMemberIdsById.get(stopId) ?? [stopId];
}

export function toLineSummary(line: CatalogLine, directions = line.directions): Line {
  return {
    id: line.id,
    shortName: line.shortName,
    ...(line.longName ? { longName: line.longName } : {}),
    ...(line.color ? { color: line.color } : {}),
    ...(line.textColor ? { textColor: line.textColor } : {}),
    ...(directions.length > 0 ? { directions } : {})
  };
}

export function getBestPattern(
  line: CatalogLine,
  directionId?: string,
  anchorStopIds: string[] = []
): CatalogPattern | undefined {
  const matchingDirectionPatterns = directionId
    ? line.patterns.filter((pattern) => pattern.directionId === directionId)
    : [...line.patterns];

  const candidatePatterns =
    anchorStopIds.length > 0 &&
    matchingDirectionPatterns.some((pattern) =>
      anchorStopIds.some((anchorStopId) => pattern.stopIds.includes(anchorStopId))
    )
      ? matchingDirectionPatterns.filter((pattern) =>
          anchorStopIds.some((anchorStopId) => pattern.stopIds.includes(anchorStopId))
        )
      : matchingDirectionPatterns;

  return [...candidatePatterns].sort(
    (left, right) =>
      right.tripCount - left.tripCount ||
      right.stopIds.length - left.stopIds.length ||
      naturalSort(left.headsign, right.headsign)
  )[0];
}

export function truncatePatternAtAnchor(pattern: CatalogPattern, anchorStopIds: string[] = []): CatalogPattern {
  if (anchorStopIds.length === 0) {
    return pattern;
  }

  const cutoffIndex = pattern.stopIds.findIndex((stopId) => anchorStopIds.includes(stopId));

  if (cutoffIndex < 0) {
    return pattern;
  }

  return {
    ...pattern,
    id: `${pattern.id}::cut:${cutoffIndex}`,
    stopIds: pattern.stopIds.slice(0, cutoffIndex + 1)
  };
}

export async function searchCatalogStops(query: string): Promise<Stop[]> {
  const { stops } = await loadCatalog();
  const normalizedQuery = normalizeText(query);

  return stops
    .map((stop) => ({
      stop,
      score: scoreStop(stop, normalizedQuery)
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || naturalSort(left.stop.name, right.stop.name))
    .slice(0, normalizedQuery ? 40 : 60)
    .map(({ stop }) => stop);
}

export async function getCatalogLinesByStop(stopId: string): Promise<Line[]> {
  const runtime = await loadCatalog();
  const candidateStopIds = resolveStopIds(runtime, stopId);

  return runtime.lines
    .flatMap((line) => {
      const matchingDirections = line.directions.filter((direction) =>
        line.patterns.some(
          (pattern) =>
            pattern.directionId === direction.id &&
            candidateStopIds.some((candidateStopId) => pattern.stopIds.includes(candidateStopId))
        )
      );

      if (matchingDirections.length === 0) {
        return [];
      }

      return [toLineSummary(line, matchingDirections)];
    })
    .sort((left, right) => naturalSort(left.shortName, right.shortName));
}

export async function getCatalogLineStops(
  lineId: string,
  directionId?: string,
  anchorStopId?: string
): Promise<LineStop[]> {
  const runtime = await loadCatalog();
  const line = runtime.lineById.get(lineId);

  if (!line) {
    return [];
  }

  const anchorStopIds = resolveStopIds(runtime, anchorStopId);
  const pattern = getBestPattern(line, directionId, anchorStopIds);

  if (!pattern) {
    return [];
  }

  const displayPattern = truncatePatternAtAnchor(pattern, anchorStopIds);

  return displayPattern.stopIds.map((stopId, index) => ({
    stopId,
    stopName: runtime.stopById.get(stopId)?.name ?? stopId,
    sequence: index + 1,
    distanceFromStart: index
  }));
}
