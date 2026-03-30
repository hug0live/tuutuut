import { useEffect, useState } from "react";
import type { Line } from "../domain/types";
import { tclClient } from "../services/api/tclClient";

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

  useEffect(() => {
    if (!stopId) {
      setState(initialState);
      return;
    }

    let cancelled = false;

    setState((currentState) => ({
      ...currentState,
      loading: true,
      error: null
    }));

    void tclClient
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
  }, [stopId]);

  return state;
}
