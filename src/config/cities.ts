import type { TransportAdapter } from "../services/api/tclClient";
import { tclAdapter } from "../services/api/adapters/tclAdapter";
import { t2cAdapter } from "../services/api/adapters/t2cAdapter";

export type CityDefinition = {
  id: string;
  name: string;
  region: string;
  networkLabel: string;
  provider: string;
  adapter: TransportAdapter;
};

export const CITY_STORAGE_KEY = "tuutuut::selected-city-id";

export const availableCities: CityDefinition[] = [
  {
    id: "lyon",
    name: "Lyon",
    region: "Auvergne-Rhone-Alpes",
    networkLabel: "TCL",
    provider: "TCL",
    adapter: tclAdapter
  },
  {
    id: "clermont-ferrand",
    name: "Clermont-Ferrand",
    region: "Auvergne-Rhone-Alpes",
    networkLabel: "T2C",
    provider: "T2C",
    adapter: t2cAdapter
  }
];

export const defaultCity = availableCities[0] ?? null;

export function getCityById(cityId: string | null | undefined): CityDefinition | null {
  if (!cityId) {
    return null;
  }

  return availableCities.find((city) => city.id === cityId) ?? null;
}
