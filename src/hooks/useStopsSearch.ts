import { useEffect, useState } from "react";
import type { Stop } from "../domain/types";
import { useAppStore } from "../store/useAppStore";

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
  const { transportAdapter } = useAppStore();

  useEffect(() => {
    if (!transportAdapter) {
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
          error: error instanceof Error ? error.message : "Impossible de charger les arrêts."
        });
      });

    return () => {
      cancelled = true;
    };
  }, [query, transportAdapter]);

  return state;
}
