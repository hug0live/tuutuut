import {
  createElement,
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode
} from "react";
import { CITY_STORAGE_KEY, availableCities, defaultCity, getCityById, type CityDefinition } from "../config/cities";
import type { TransportAdapter } from "../services/api/tclClient";

type AppStoreValue = {
  nonBlockingError: string | null;
  selectedCity: CityDefinition | null;
  availableCities: CityDefinition[];
  citySelectionRequired: boolean;
  transportAdapter: TransportAdapter | null;
  setNonBlockingError: (message: string | null) => void;
  setSelectedCityId: (cityId: string) => void;
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

function loadInitialCity(): {
  selectedCity: CityDefinition | null;
  citySelectionRequired: boolean;
} {
  if (typeof window === "undefined") {
    return {
      selectedCity: defaultCity,
      citySelectionRequired: false
    };
  }

  const storedCityId = window.localStorage.getItem(CITY_STORAGE_KEY);
  const storedCity = getCityById(storedCityId);

  if (storedCity) {
    return {
      selectedCity: storedCity,
      citySelectionRequired: false
    };
  }

  return {
    selectedCity: null,
    citySelectionRequired: true
  };
}

export function AppStoreProvider({ children }: { children: ReactNode }): ReactElement {
  const [nonBlockingError, setNonBlockingError] = useState<string | null>(null);
  const [{ selectedCity, citySelectionRequired }, setCityState] = useState(loadInitialCity);

  const setSelectedCityId = (cityId: string): void => {
    const nextCity = getCityById(cityId);

    if (!nextCity) {
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(CITY_STORAGE_KEY, nextCity.id);
    }

    setCityState({
      selectedCity: nextCity,
      citySelectionRequired: false
    });
  };

  const value = useMemo<AppStoreValue>(
    () => ({
      nonBlockingError,
      selectedCity,
      availableCities,
      citySelectionRequired,
      transportAdapter: selectedCity?.adapter ?? null,
      setNonBlockingError,
      setSelectedCityId
    }),
    [citySelectionRequired, nonBlockingError, selectedCity]
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
