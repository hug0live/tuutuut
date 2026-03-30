import { useEffect, useState } from "react";
import type { Stop } from "../domain/types";
import { tclClient } from "../services/api/tclClient";

type StopsSearchState = {
  stops: Stop[];
  loading: boolean;
  error: string | null;
};

const initialState: StopsSearchState = {
  stops: [],
  loading: false,
  error: null
};

export function useStopsSearch(query: string): StopsSearchState {
  const [state, setState] = useState<StopsSearchState>(initialState);

  useEffect(() => {
    let cancelled = false;

    setState((currentState) => ({
      ...currentState,
      loading: true,
      error: null
    }));

    void tclClient
      .searchStops(query)
      .then((stops) => {
        if (cancelled) {
          return;
        }

        setState({
          stops,
          loading: false,
          error: null
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setState({
          stops: [],
          loading: false,
          error: error instanceof Error ? error.message : "Impossible de charger les arrets."
        });
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  return state;
}
