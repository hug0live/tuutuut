import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactElement,
  type ReactNode
} from "react";

type AppState = {
  lastUpdated: string | null;
  nonBlockingError: string | null;
};

type AppStoreValue = AppState & {
  setLastUpdated: (timestamp: string | null) => void;
  setNonBlockingError: (message: string | null) => void;
};

type Action =
  | { type: "SET_LAST_UPDATED"; payload: string | null }
  | { type: "SET_NON_BLOCKING_ERROR"; payload: string | null };

const initialState: AppState = {
  lastUpdated: null,
  nonBlockingError: null
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_LAST_UPDATED":
      if (state.lastUpdated === action.payload) {
        return state;
      }

      return {
        ...state,
        lastUpdated: action.payload
      };
    case "SET_NON_BLOCKING_ERROR":
      if (state.nonBlockingError === action.payload) {
        return state;
      }

      return {
        ...state,
        nonBlockingError: action.payload
      };
    default:
      return state;
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setLastUpdated = useCallback((timestamp: string | null) => {
    dispatch({ type: "SET_LAST_UPDATED", payload: timestamp });
  }, []);

  const setNonBlockingError = useCallback((message: string | null) => {
    dispatch({ type: "SET_NON_BLOCKING_ERROR", payload: message });
  }, []);

  const value = useMemo<AppStoreValue>(
    () => ({
      ...state,
      setLastUpdated,
      setNonBlockingError
    }),
    [setLastUpdated, setNonBlockingError, state]
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
