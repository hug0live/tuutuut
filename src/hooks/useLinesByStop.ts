import { useEffect, useState } from "react";
import type { Line } from "../domain/types";
import { useAppStore } from "../store/useAppStore";

type LinesByStopState = {
  lines: Line[];
  loading: boolean;
  error: string | null;
};

const initialState: LinesByStopState = {
  lines: [],
  loading: false,
  error: null
};

export function useLinesByStop(stopId: string | null): LinesByStopState {
  const [state, setState] = useState<LinesByStopState>(initialState);
  const { transportAdapter } = useAppStore();

  useEffect(() => {
    if (!stopId || !transportAdapter) {
      setState(initialState);
      return;
    }

    let cancelled = false;

    setState((currentState) => ({
      ...currentState,
      loading: true,
      error: null
    }));

    void transportAdapter
      .getLinesByStop(stopId)
      .then((lines) => {
        if (cancelled) {
          return;
        }

        setState({
          lines,
          loading: false,
          error: null
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setState({
          lines: [],
          loading: false,
          error: error instanceof Error ? error.message : "Impossible de charger les lignes."
        });
      });

    return () => {
      cancelled = true;
    };
  }, [stopId, transportAdapter]);

  return state;
}
