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

    const runCallback = () => {
      void savedCallback.current();
    };

    if (immediate) {
      runCallback();
    }

    const intervalId = window.setInterval(() => {
      runCallback();
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runCallback();
      }
    };

    window.addEventListener("focus", runCallback);
    window.addEventListener("online", runCallback);
    window.addEventListener("pageshow", runCallback);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", runCallback);
      window.removeEventListener("online", runCallback);
      window.removeEventListener("pageshow", runCallback);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, immediate, intervalMs]);
}
