import { useEffect, useMemo, useState } from "react";
import type { LineStop } from "../domain/types";
import { tclClient } from "../services/api/tclClient";

type LineStopsState = {
  lineStops: LineStop[];
  loading: boolean;
  error: string | null;
};

const cache = new Map<string, LineStop[]>();

function getCacheKey(lineId: string, directionId?: string, anchorStopId?: string): string {
  return `${lineId}::${directionId ?? "default"}::${anchorStopId ?? "default-stop"}`;
}

export function useLineStops(lineId: string, directionId?: string, anchorStopId?: string): LineStopsState {
  const cacheKey = useMemo(
    () => getCacheKey(lineId, directionId, anchorStopId),
    [anchorStopId, directionId, lineId]
  );
  const [state, setState] = useState<LineStopsState>(() => {
    const cachedValue = cache.get(cacheKey);
    return {
      lineStops: cachedValue ?? [],
      loading: !cachedValue,
      error: null
    };
  });

  useEffect(() => {
    const cachedValue = cache.get(cacheKey);

    if (cachedValue) {
      setState({
        lineStops: cachedValue,
        loading: false,
        error: null
      });
      return;
    }

    let cancelled = false;

    setState({
      lineStops: [],
      loading: true,
      error: null
    });

    void tclClient
      .getLineStops(lineId, directionId, anchorStopId)
      .then((lineStops) => {
        if (cancelled) {
          return;
        }

        cache.set(cacheKey, lineStops);
        setState({
          lineStops,
          loading: false,
          error: null
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setState({
          lineStops: [],
          loading: false,
          error: error instanceof Error ? error.message : "Impossible de charger le schema de ligne."
        });
      });

    return () => {
      cancelled = true;
    };
  }, [anchorStopId, cacheKey, directionId, lineId]);

  return state;
}
