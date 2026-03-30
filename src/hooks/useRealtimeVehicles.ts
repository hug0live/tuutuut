import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VehiclePosition } from "../domain/types";
import { dataSourceInfo, tclClient } from "../services/api/tclClient";
import {
  buildRealtimeVehiclesCacheKey,
  readPersistedRealtimeVehicles,
  writePersistedRealtimeVehicles
} from "../services/storage/realtimeCache";
import { useAppStore } from "../store/useAppStore";
import { usePolling } from "./usePolling";

type RealtimeVehiclesState = {
  vehicles: VehiclePosition[];
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
};

const initialState: RealtimeVehiclesState = {
  vehicles: [],
  loading: false,
  error: null,
  updatedAt: null
};

export function useRealtimeVehicles(
  lineId: string | null,
  directionId?: string,
  anchorStopId?: string,
  enabled = true
): RealtimeVehiclesState {
  const { setLastUpdated } = useAppStore();
  const [state, setState] = useState<RealtimeVehiclesState>(initialState);
  const hasFetchedOnce = useRef(false);
  const cacheKey = useMemo(
    () =>
      lineId
        ? buildRealtimeVehiclesCacheKey(dataSourceInfo.mode, lineId, directionId, anchorStopId)
        : null,
    [anchorStopId, directionId, lineId]
  );

  const fetchVehicles = useCallback(async () => {
    if (!lineId || !enabled || !cacheKey) {
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

    try {
      const vehicles = await tclClient.getRealtimeVehicles(lineId, directionId, anchorStopId);
      const updatedAt = new Date().toISOString();

      hasFetchedOnce.current = true;
      setState({
        vehicles,
        loading: false,
        error: null,
        updatedAt
      });
      setLastUpdated(updatedAt);
      void writePersistedRealtimeVehicles({
        cacheKey,
        mode: dataSourceInfo.mode,
        lineId,
        directionId,
        anchorStopId,
        vehicles,
        updatedAt
      });
    } catch (error: unknown) {
      setState((currentState) => ({
        ...currentState,
        loading: false,
        error: error instanceof Error ? error.message : "Temps reel indisponible."
      }));
    }
  }, [anchorStopId, cacheKey, directionId, enabled, lineId, setLastUpdated]);

  useEffect(() => {
    let cancelled = false;

    hasFetchedOnce.current = false;
    setState(initialState);

    if (!lineId || !enabled || !cacheKey) {
      return () => {
        cancelled = true;
      };
    }

    void readPersistedRealtimeVehicles(cacheKey).then((cachedValue) => {
      if (cancelled || hasFetchedOnce.current || !cachedValue) {
        return;
      }

      hasFetchedOnce.current = true;
      setState({
        vehicles: cachedValue.vehicles,
        loading: false,
        error: null,
        updatedAt: cachedValue.updatedAt
      });
      setLastUpdated(cachedValue.updatedAt);
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, enabled, lineId, setLastUpdated]);

  usePolling(fetchVehicles, 10_000, {
    enabled: Boolean(lineId) && enabled,
    immediate: true
  });

  return state;
}
