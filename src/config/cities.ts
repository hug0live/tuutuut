import type { TransportAdapter } from "../services/api/tclClient";
import { createTclAdapter, normalizeTclRealtimeLineReference } from "../services/api/adapters/tclAdapter";
import { createT2cAdapter, normalizeT2cRealtimeLineReference } from "../services/api/adapters/t2cAdapter";
import type { CityRealtimeConfig, RealtimeProviderId } from "../services/realtime/types";

export type CityDefinition = {
  id: string;
  name: string;
  region: string;
  networkLabel: string;
  provider: string;
  realtimeProvider: RealtimeProviderId;
  realtimeConfig: CityRealtimeConfig;
  adapter: TransportAdapter;
};

export const CITY_STORAGE_KEY = "tuutuut::selected-city-id";

const lyonRealtimeConfig = {
  provider: "bus-tracker",
  networkId: 91,
  normalizeLineReference: normalizeTclRealtimeLineReference
} satisfies CityRealtimeConfig;

const clermontFerrandRealtimeConfig = {
  provider: "bus-tracker",
  networkId: 101,
  normalizeLineReference: normalizeT2cRealtimeLineReference
} satisfies CityRealtimeConfig;

export const availableCities: CityDefinition[] = [
  {
    id: "lyon",
    name: "Lyon",
    region: "Auvergne-Rhone-Alpes",
    networkLabel: "TCL",
    provider: "TCL",
    realtimeProvider: lyonRealtimeConfig.provider,
    realtimeConfig: lyonRealtimeConfig,
    adapter: createTclAdapter(lyonRealtimeConfig)
  },
  {
    id: "clermont-ferrand",
    name: "Clermont-Ferrand",
    region: "Auvergne-Rhone-Alpes",
    networkLabel: "T2C",
    provider: "T2C",
    realtimeProvider: clermontFerrandRealtimeConfig.provider,
    realtimeConfig: clermontFerrandRealtimeConfig,
    adapter: createT2cAdapter(clermontFerrandRealtimeConfig)
  }
];

export const defaultCity = availableCities[0] ?? null;

export function getCityById(cityId: string | null | undefined): CityDefinition | null {
  if (!cityId) {
    return null;
  }

  return availableCities.find((city) => city.id === cityId) ?? null;
}
