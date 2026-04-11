import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { estimateNextArrival, type EstimatedArrival } from "../domain/arrivalEstimation";
import { projectLineStops } from "../domain/lineProjection";
import { positionVehicles } from "../domain/vehiclePositioning";
import type { LineStop, VehiclePosition, WatchSelection } from "../domain/types";
import { usePolling } from "../hooks/usePolling";
import { dataSourceInfo, tclClient } from "../services/api/tclClient";
import {
  buildRealtimeVehiclesCacheKey,
  readPersistedRealtimeVehicles,
  writePersistedRealtimeVehicles
} from "../services/storage/realtimeCache";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { NextArrivalCard } from "./NextArrivalCard";
import { StopMarker } from "./StopMarker";
import { VehicleMarker } from "./VehicleMarker";

type CombinedStopDiagramProps = {
  selection: WatchSelection;
};

type LoadedSelectionLine = WatchSelection["lines"][number] & {
  lineStops: LineStop[];
  vehicles: VehiclePosition[];
  updatedAt: string | null;
};

type CombinedVehicleStyle = {
  lineColor: string;
  textColor: string;
};

type CombinedNextArrival = EstimatedArrival & {
  lineShortName: string;
  lineColor: string;
  textColor: string;
};

type CombinedStopDiagramState = {
  lines: LoadedSelectionLine[];
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
};

type CanonicalStopNode = {
  key: string;
  stopName: string;
  sortHintTotal: number;
  occurrences: number;
  insertionIndex: number;
};

const initialState: CombinedStopDiagramState = {
  lines: [],
  loading: false,
  error: null,
  updatedAt: null
};
const TERMINAL_STOPPED_VISIBILITY_MS = 6_000;

function normalizeStopKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatTime(timestamp: string | null): string {
  if (!timestamp) {
    return "En attente";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp));
}

function buildCanonicalStops(lines: LoadedSelectionLine[]): {
  lineStops: LineStop[];
  stopIdToCanonicalKey: Map<string, string>;
} {
  const nodeMap = new Map<string, CanonicalStopNode>();
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  const stopIdToCanonicalKey = new Map<string, string>();
  let insertionIndex = 0;

  lines.forEach((selectionLine) => {
    selectionLine.lineStops.forEach((stop, index) => {
      const canonicalKey = normalizeStopKey(stop.stopName) || stop.stopId;
      stopIdToCanonicalKey.set(stop.stopId, canonicalKey);

      if (!nodeMap.has(canonicalKey)) {
        nodeMap.set(canonicalKey, {
          key: canonicalKey,
          stopName: stop.stopName,
          sortHintTotal: 0,
          occurrences: 0,
          insertionIndex
        });
        indegree.set(canonicalKey, 0);
        adjacency.set(canonicalKey, new Set());
        insertionIndex += 1;
      }

      const node = nodeMap.get(canonicalKey);

      if (node) {
        node.sortHintTotal += index / Math.max(1, selectionLine.lineStops.length - 1);
        node.occurrences += 1;
      }
    });

    selectionLine.lineStops.forEach((stop, index) => {
      const nextStop = selectionLine.lineStops[index + 1];

      if (!nextStop) {
        return;
      }

      const currentKey = stopIdToCanonicalKey.get(stop.stopId);
      const nextKey = stopIdToCanonicalKey.get(nextStop.stopId);

      if (!currentKey || !nextKey || currentKey === nextKey) {
        return;
      }

      const neighbors = adjacency.get(currentKey);

      if (!neighbors || neighbors.has(nextKey)) {
        return;
      }

      neighbors.add(nextKey);
      indegree.set(nextKey, (indegree.get(nextKey) ?? 0) + 1);
    });
  });

  const getSortScore = (key: string): number => {
    const node = nodeMap.get(key);

    if (!node || node.occurrences === 0) {
      return Number.POSITIVE_INFINITY;
    }

    return node.sortHintTotal / node.occurrences;
  };

  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([key]) => key)
    .sort((left, right) => {
      const scoreDelta = getSortScore(left) - getSortScore(right);

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return (nodeMap.get(left)?.insertionIndex ?? 0) - (nodeMap.get(right)?.insertionIndex ?? 0);
    });

  const orderedKeys: string[] = [];

  while (queue.length > 0) {
    const currentKey = queue.shift();

    if (!currentKey) {
      continue;
    }

    orderedKeys.push(currentKey);

    const neighbors = adjacency.get(currentKey) ?? new Set<string>();

    neighbors.forEach((neighborKey) => {
      const nextDegree = (indegree.get(neighborKey) ?? 0) - 1;
      indegree.set(neighborKey, nextDegree);

      if (nextDegree === 0) {
        queue.push(neighborKey);
        queue.sort((left, right) => {
          const scoreDelta = getSortScore(left) - getSortScore(right);

          if (scoreDelta !== 0) {
            return scoreDelta;
          }

          return (nodeMap.get(left)?.insertionIndex ?? 0) - (nodeMap.get(right)?.insertionIndex ?? 0);
        });
      }
    });
  }

  if (orderedKeys.length !== nodeMap.size) {
    return {
      lineStops: [...nodeMap.values()]
        .sort((left, right) => {
          const leftScore = left.sortHintTotal / Math.max(1, left.occurrences);
          const rightScore = right.sortHintTotal / Math.max(1, right.occurrences);

          if (leftScore !== rightScore) {
            return leftScore - rightScore;
          }

          return left.insertionIndex - right.insertionIndex;
        })
        .map((node, index) => ({
          stopId: node.key,
          stopName: node.stopName,
          sequence: index + 1,
          distanceFromStart: index
        })),
      stopIdToCanonicalKey
    };
  }

  return {
    lineStops: orderedKeys.map((key, index) => ({
      stopId: key,
      stopName: nodeMap.get(key)?.stopName ?? key,
      sequence: index + 1,
      distanceFromStart: index
    })),
    stopIdToCanonicalKey
  };
}

function getTerminalCanonicalKey(
  lines: LoadedSelectionLine[],
  stopIdToCanonicalKey: Map<string, string>,
  selectedStopName: string
): string | null {
  const terminalKeys = lines
    .map((selectionLine) => selectionLine.lineStops.at(-1)?.stopId)
    .filter((stopId): stopId is string => Boolean(stopId))
    .map((stopId) => stopIdToCanonicalKey.get(stopId) ?? stopId);

  if (terminalKeys.length === 0) {
    return null;
  }

  const exactNameKey = terminalKeys.find((key) => key === normalizeStopKey(selectedStopName));

  if (exactNameKey) {
    return exactNameKey;
  }

  const occurrenceByKey = new Map<string, number>();

  terminalKeys.forEach((key) => {
    occurrenceByKey.set(key, (occurrenceByKey.get(key) ?? 0) + 1);
  });

  return [...occurrenceByKey.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function trimCanonicalStopsAtTerminal(lineStops: LineStop[], terminalCanonicalKey: string | null): LineStop[] {
  if (!terminalCanonicalKey) {
    return lineStops;
  }

  const terminalIndex = lineStops.findIndex((stop) => stop.stopId === terminalCanonicalKey);

  if (terminalIndex < 0) {
    return lineStops;
  }

  return lineStops.slice(0, terminalIndex + 1);
}

function isRecentlyStoppedAtTerminal(
  vehicle: VehiclePosition,
  mappedPreviousStopId: string | undefined,
  terminalCanonicalKey: string | null,
  nowMs: number
): boolean {
  if (mappedPreviousStopId !== terminalCanonicalKey || vehicle.status !== "STOPPED") {
    return false;
  }

  const vehicleTimestampMs = Date.parse(vehicle.timestamp);

  if (!Number.isFinite(vehicleTimestampMs)) {
    return true;
  }

  return nowMs - vehicleTimestampMs <= TERMINAL_STOPPED_VISIBILITY_MS;
}

function getLatestUpdatedAt(timestamps: Array<string | null | undefined>): string | null {
  const normalizedTimestamps = timestamps.filter((timestamp): timestamp is string => Boolean(timestamp));

  if (normalizedTimestamps.length === 0) {
    return null;
  }

  return normalizedTimestamps.sort((left, right) => left.localeCompare(right)).at(-1) ?? null;
}

export function CombinedStopDiagram({ selection }: CombinedStopDiagramProps): JSX.Element {
  const [state, setState] = useState<CombinedStopDiagramState>(initialState);
  const [expiredTerminalVehicleIds, setExpiredTerminalVehicleIds] = useState<Set<string>>(() => new Set());
  const hasFetchedOnce = useRef(false);

  const fetchSelection = useCallback(async () => {
    if (!selection.lines.length) {
      setState(initialState);
      return;
    }

    if (!hasFetchedOnce.current) {
      setState((currentState) => ({
        ...currentState,
        loading: true,
        error: null
      }));
    }

    const settledResults = await Promise.allSettled(
      selection.lines.map(async (selectionLine) => {
        const cacheKey = buildRealtimeVehiclesCacheKey(
          dataSourceInfo.mode,
          selectionLine.line.id,
          selectionLine.direction.id,
          selection.stop.id
        );
        const lineStops = await tclClient.getLineStops(selectionLine.line.id, selectionLine.direction.id, selection.stop.id);

        try {
          const vehicles = await tclClient.getRealtimeVehicles(
            selectionLine.line.id,
            selectionLine.direction.id,
            selection.stop.id
          );
          const updatedAt = new Date().toISOString();

          void writePersistedRealtimeVehicles({
            cacheKey,
            mode: dataSourceInfo.mode,
            lineId: selectionLine.line.id,
            directionId: selectionLine.direction.id,
            anchorStopId: selection.stop.id,
            vehicles,
            updatedAt
          });

          return {
            ...selectionLine,
            lineStops,
            vehicles,
            updatedAt,
            errorMessage: null as string | null
          };
        } catch (error: unknown) {
          const cachedValue = await readPersistedRealtimeVehicles(cacheKey);

          return {
            ...selectionLine,
            lineStops,
            vehicles: cachedValue?.vehicles ?? [],
            updatedAt: cachedValue?.updatedAt ?? null,
            errorMessage: error instanceof Error ? error.message : "Temps reel indisponible."
          };
        }
      })
    );

    const successfulLines = settledResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    const rejectedResult = settledResults.find((result) => result.status === "rejected");
    const lineLevelErrorMessage =
      successfulLines.find((selectionLine) => selectionLine.errorMessage)?.errorMessage ?? null;

    hasFetchedOnce.current = true;
    setState({
      lines: successfulLines.map(({ errorMessage, ...selectionLine }) => selectionLine),
      loading: false,
      error:
        lineLevelErrorMessage ??
        (rejectedResult && rejectedResult.status === "rejected"
          ? rejectedResult.reason instanceof Error
            ? rejectedResult.reason.message
            : "Temps reel indisponible."
          : null),
      updatedAt: getLatestUpdatedAt(successfulLines.map((selectionLine) => selectionLine.updatedAt))
    });
  }, [selection]);

  useEffect(() => {
    let cancelled = false;

    hasFetchedOnce.current = false;
    setState(initialState);

    if (!selection.lines.length) {
      return () => {
        cancelled = true;
      };
    }

    void Promise.all(
      selection.lines.map(async (selectionLine) => {
        const cacheKey = buildRealtimeVehiclesCacheKey(
          dataSourceInfo.mode,
          selectionLine.line.id,
          selectionLine.direction.id,
          selection.stop.id
        );
        const [lineStops, cachedValue] = await Promise.all([
          tclClient.getLineStops(selectionLine.line.id, selectionLine.direction.id, selection.stop.id),
          readPersistedRealtimeVehicles(cacheKey)
        ]);

        return {
          ...selectionLine,
          lineStops,
          vehicles: cachedValue?.vehicles ?? [],
          updatedAt: cachedValue?.updatedAt ?? null
        };
      })
    )
      .then((cachedLines) => {
        if (cancelled || hasFetchedOnce.current) {
          return;
        }

        const hydratedUpdatedAt = getLatestUpdatedAt(cachedLines.map((selectionLine) => selectionLine.updatedAt));

        if (!hydratedUpdatedAt) {
          return;
        }

        hasFetchedOnce.current = true;
        setState({
          lines: cachedLines,
          loading: false,
          error: null,
          updatedAt: hydratedUpdatedAt
        });
      })
      .catch(() => {
        // On laissera ensuite le polling reseau faire le travail normal.
      });

    return () => {
      cancelled = true;
    };
  }, [selection]);

  usePolling(fetchSelection, 10_000, {
    enabled: selection.lines.length > 0,
    immediate: true
  });

  const canonical = useMemo(() => buildCanonicalStops(state.lines), [state.lines]);
  const terminalCanonicalKey = useMemo(
    () => getTerminalCanonicalKey(state.lines, canonical.stopIdToCanonicalKey, selection.stop.name),
    [canonical.stopIdToCanonicalKey, selection.stop.name, state.lines]
  );
  const displayedCanonicalStops = useMemo(
    () => trimCanonicalStopsAtTerminal(canonical.lineStops, terminalCanonicalKey),
    [canonical.lineStops, terminalCanonicalKey]
  );
  const projection = useMemo(() => projectLineStops(displayedCanonicalStops), [displayedCanonicalStops]);

  useEffect(() => {
    const activeVehicleIds = new Set<string>();
    const timeoutIds: number[] = [];

    state.lines.forEach((selectionLine) => {
      selectionLine.vehicles.forEach((vehicle) => {
        const renderVehicleId = `${selectionLine.line.id}:${vehicle.vehicleId}`;
        const mappedPreviousStopId = vehicle.stopIdPrevious
          ? canonical.stopIdToCanonicalKey.get(vehicle.stopIdPrevious) ?? vehicle.stopIdPrevious
          : undefined;

        if (mappedPreviousStopId !== terminalCanonicalKey || vehicle.status !== "STOPPED") {
          return;
        }

        activeVehicleIds.add(renderVehicleId);

        const vehicleTimestampMs = Date.parse(vehicle.timestamp);

        if (!Number.isFinite(vehicleTimestampMs)) {
          return;
        }

        const remainingMs = TERMINAL_STOPPED_VISIBILITY_MS - (Date.now() - vehicleTimestampMs);

        if (remainingMs <= 0) {
          setExpiredTerminalVehicleIds((currentIds) => {
            if (currentIds.has(renderVehicleId)) {
              return currentIds;
            }

            const nextIds = new Set(currentIds);
            nextIds.add(renderVehicleId);
            return nextIds;
          });
          return;
        }

        const timeoutId = window.setTimeout(() => {
          setExpiredTerminalVehicleIds((currentIds) => {
            if (currentIds.has(renderVehicleId)) {
              return currentIds;
            }

            const nextIds = new Set(currentIds);
            nextIds.add(renderVehicleId);
            return nextIds;
          });
        }, remainingMs);

        timeoutIds.push(timeoutId);
      });
    });

    setExpiredTerminalVehicleIds((currentIds) => {
      const nextIds = new Set(
        [...currentIds].filter((vehicleId) => {
          if (!activeVehicleIds.has(vehicleId)) {
            return false;
          }

          return true;
        })
      );

      return nextIds.size === currentIds.size && [...nextIds].every((vehicleId) => currentIds.has(vehicleId))
        ? currentIds
        : nextIds;
    });

    return () => {
      timeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  }, [canonical.stopIdToCanonicalKey, state.lines, terminalCanonicalKey]);

  const lineBadges = useMemo(
    () =>
      selection.lines.map((selectionLine) => ({
        key: selectionLine.line.id,
        shortName: selectionLine.line.shortName,
        color: selectionLine.line.color ?? "#0b7a75",
        textColor: selectionLine.line.textColor ?? "#ffffff"
      })),
    [selection.lines]
  );

  const positionedVehicles = useMemo(() => {
    const vehicleStyleById = new Map<string, CombinedVehicleStyle>();
    const displayedStopIds = new Set(displayedCanonicalStops.map((stop) => stop.stopId));
    const mergedVehicles = state.lines.flatMap((selectionLine) => {
      const lineColor = selectionLine.line.color ?? "#0b7a75";
      const textColor = selectionLine.line.textColor ?? "#ffffff";

      return selectionLine.vehicles.map((vehicle) => {
        const renderVehicleId = `${selectionLine.line.id}:${vehicle.vehicleId}`;
        vehicleStyleById.set(renderVehicleId, {
          lineColor,
          textColor
        });

        const mappedPreviousStopId = vehicle.stopIdPrevious
          ? canonical.stopIdToCanonicalKey.get(vehicle.stopIdPrevious) ?? vehicle.stopIdPrevious
          : undefined;
        const mappedNextStopId = vehicle.stopIdNext
          ? canonical.stopIdToCanonicalKey.get(vehicle.stopIdNext) ?? vehicle.stopIdNext
          : undefined;

        const isApproachingDisplayedStop = Boolean(mappedNextStopId && displayedStopIds.has(mappedNextStopId));
        const isStoppedAtTerminal =
          isRecentlyStoppedAtTerminal(vehicle, mappedPreviousStopId, terminalCanonicalKey, Date.now()) &&
          !expiredTerminalVehicleIds.has(renderVehicleId);
        const isWithinDisplayedSegment = Boolean(
          (mappedPreviousStopId && displayedStopIds.has(mappedPreviousStopId)) ||
            (mappedNextStopId && displayedStopIds.has(mappedNextStopId))
        );

        if (!isStoppedAtTerminal && !isApproachingDisplayedStop && !isWithinDisplayedSegment) {
          return null;
        }

        if (mappedPreviousStopId === terminalCanonicalKey && mappedNextStopId === undefined && vehicle.status !== "STOPPED") {
          return null;
        }

        return {
          ...vehicle,
          vehicleId: renderVehicleId,
          ...(mappedPreviousStopId ? { stopIdPrevious: mappedPreviousStopId } : {}),
          ...(mappedNextStopId ? { stopIdNext: mappedNextStopId } : {})
        };
      }).filter((vehicle): vehicle is VehiclePosition => vehicle !== null);
    });

    return positionVehicles(mergedVehicles, projection).map((vehicle) => ({
      ...vehicle,
      lineColor: vehicleStyleById.get(vehicle.vehicleId)?.lineColor ?? "#0b7a75",
      textColor: vehicleStyleById.get(vehicle.vehicleId)?.textColor ?? "#ffffff"
    }));
  }, [canonical.stopIdToCanonicalKey, displayedCanonicalStops, expiredTerminalVehicleIds, projection, state.lines, terminalCanonicalKey]);

  const nextArrival = useMemo<CombinedNextArrival | null>(() => {
    const nowMs = Date.now();
    const arrivals = state.lines
      .map((selectionLine) => {
        const arrival = estimateNextArrival(selectionLine.lineStops, selectionLine.vehicles, nowMs);

        if (!arrival) {
          return null;
        }

        return {
          ...arrival,
          lineShortName: selectionLine.line.shortName,
          lineColor: selectionLine.line.color ?? "#0b7a75",
          textColor: selectionLine.line.textColor ?? "#ffffff"
        };
      })
      .filter((arrival): arrival is CombinedNextArrival => arrival !== null)
      .sort((left, right) => left.secondsAway - right.secondsAway);

    return arrivals[0] ?? null;
  }, [state.lines]);

  if (state.loading && state.lines.length === 0) {
    return (
      <article className="card combined-diagram combined-diagram--loading">
        <LoadingState
          title={selection.stop.name}
          message="Construction du schema fusionne..."
        />
      </article>
    );
  }

  if (state.error && state.lines.length === 0) {
    return (
      <article className="card combined-diagram">
        <ErrorState title={selection.stop.name} message={state.error} />
      </article>
    );
  }

  return (
    <section className="line-diagram-layout">
      <article className="card combined-diagram">
        <header className="line-diagram__header">
          <div className="line-diagram__title-group">
            <div className="combined-diagram__badge-list">
              {lineBadges.map((badge) => (
                <span
                  key={badge.key}
                  className="line-badge"
                  style={{
                    background: badge.color,
                    color: badge.textColor
                  }}
                >
                  {badge.shortName}
                </span>
              ))}
            </div>

            <div>
              <h3>{selection.stop.name}</h3>
            </div>
          </div>

          <div className="line-diagram__meta">
            <span>Mise a jour {formatTime(state.updatedAt)}</span>
          </div>
        </header>

        {state.error ? (
          <div className="inline-warning">Temps reel partiellement indisponible, certaines donnees peuvent manquer.</div>
        ) : null}

        <div className="line-diagram__svg-frame">
          <svg className="line-diagram__svg" viewBox={`0 0 ${projection.width} ${projection.height}`} role="img">
            <title>{`Schema fusionne pour ${selection.stop.name} vers ${selection.directionName}`}</title>
            <desc>{`Plusieurs lignes TCL sont projetees sur un seul axe horizontal.`}</desc>

            <line
              className="diagram-rail"
              x1={projection.padding}
              y1={projection.lineY}
              x2={projection.width - projection.padding}
              y2={projection.lineY}
              stroke="rgba(16, 32, 39, 0.64)"
              strokeWidth="8"
            />

            <line
              className="diagram-rail diagram-rail--ghost"
              x1={projection.padding}
              y1={projection.lineY}
              x2={projection.width - projection.padding}
              y2={projection.lineY}
              stroke="rgba(255,255,255,0.72)"
              strokeWidth="2"
            />

            {projection.projectedStops.map((stop) => (
              <StopMarker
                key={stop.stopId}
                stop={stop}
                lineY={projection.lineY}
                isSelected={stop.stopName === selection.stop.name}
              />
            ))}

            {positionedVehicles.map((vehicle) => (
              <VehicleMarker
                key={vehicle.vehicleId}
                vehicle={vehicle}
                lineColor={vehicle.lineColor}
                textColor={vehicle.textColor}
              />
            ))}

            {!state.loading && positionedVehicles.length === 0 ? (
              <text className="diagram-empty" x={projection.width / 2} y="48">
                Aucun vehicule visible en ce moment
              </text>
            ) : null}
          </svg>
        </div>
      </article>

      <NextArrivalCard
        stopName={selection.stop.name}
        arrival={nextArrival}
        loading={state.loading}
        error={state.error}
        standalone
        badge={
          nextArrival
            ? {
                label: nextArrival.lineShortName,
                color: nextArrival.lineColor,
                textColor: nextArrival.textColor
              }
            : null
        }
      />
    </section>
  );
}
