import {
  createCatalogApi,
  getBestPattern,
  normalizeCatalogText,
  resolveStopIds,
  scoreStop,
  sortNaturally,
  toLineSummary,
  truncatePatternAtAnchor,
  type CatalogLine,
  type CatalogPattern,
  type CatalogRuntime,
  type CatalogStop,
  type TheoreticalService,
  type TheoreticalTimetables
} from "./catalogRuntime";

const catalogApi = createCatalogApi(new URL("../../t2cBusCatalog.json", import.meta.url).href, "local T2C catalog");

export {
  getBestPattern,
  normalizeCatalogText,
  resolveStopIds,
  scoreStop,
  sortNaturally,
  toLineSummary,
  truncatePatternAtAnchor
};

export type {
  CatalogLine,
  CatalogPattern,
  CatalogRuntime,
  CatalogStop,
  TheoreticalService,
  TheoreticalTimetables
};

export const {
  getCatalogLineStops,
  getCatalogLinesByStop,
  loadCatalog,
  searchCatalogStops
} = catalogApi;
