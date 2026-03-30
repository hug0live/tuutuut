import { useEffect, useRef } from "react";

type UsePollingOptions = {
  enabled?: boolean;
  immediate?: boolean;
};

export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  options: UsePollingOptions = {}
): void {
  const { enabled = true, immediate = true } = options;
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    if (immediate) {
      void savedCallback.current();
    }

    const intervalId = window.setInterval(() => {
      void savedCallback.current();
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, immediate, intervalMs]);
}
