import { createElement, createContext, useContext, useMemo, useState, type ReactElement, type ReactNode } from "react";

type AppStoreValue = {
  nonBlockingError: string | null;
  setNonBlockingError: (message: string | null) => void;
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }): ReactElement {
  const [nonBlockingError, setNonBlockingError] = useState<string | null>(null);

  const value = useMemo<AppStoreValue>(
    () => ({
      nonBlockingError,
      setNonBlockingError
    }),
    [nonBlockingError]
  );

  return createElement(AppStoreContext.Provider, { value }, children);
}

export function useAppStore(): AppStoreValue {
  const context = useContext(AppStoreContext);

  if (!context) {
    throw new Error("useAppStore must be used within an AppStoreProvider");
  }

  return context;
}
