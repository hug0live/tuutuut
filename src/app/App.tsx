import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { findLineDirection, getDirectionOptions } from "../domain/lineDirections";
import type { Line, LineDirection, Stop, WatchSelection, WatchSelectionLine } from "../domain/types";
import { Dashboard } from "../components/Dashboard";
import { ErrorState } from "../components/ErrorState";
import { LineMultiSelectDropdown } from "../components/LineMultiSelectDropdown";
import { LoadingState } from "../components/LoadingState";
import { StopSelector } from "../components/StopSelector";
import { useLinesByStop } from "../hooks/useLinesByStop";
import { useStopsSearch } from "../hooks/useStopsSearch";
import { useAppStore } from "../store/useAppStore";

const MAX_WATCH_SELECTIONS = 2;
const APP_UPDATE_EVENT = "tuutuut:update-status";
const appLastUpdatedAt = __APP_LAST_UPDATED_AT__;
const SELECTED_LINES_STORAGE_KEY = "tuutuut::selected-lines-by-city";

function getWatchSelectionsStorageKey(cityId: string): string {
  return `tuutuut::watch-selections::${cityId}`;
}

type StoredSelectedLinesByCity = {
  cities: Record<
    string,
    {
      selectedLineIds: string[];
    }
  >;
};

function formatLastUpdatedAt(timestamp: string): string | null {
  const parsedTimestamp = Date.parse(timestamp);

  if (!Number.isFinite(parsedTimestamp)) {
    return null;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(parsedTimestamp));
}

function isStop(value: unknown): value is Stop {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Stop>;
  return typeof candidate.id === "string" && typeof candidate.name === "string";
}

function isLineDirection(value: unknown): value is LineDirection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LineDirection>;
  return typeof candidate.id === "string" && typeof candidate.name === "string";
}

function isLine(value: unknown): value is Line {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Line>;
  return typeof candidate.id === "string" && typeof candidate.shortName === "string";
}

function isWatchSelectionLine(value: unknown): value is WatchSelectionLine {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WatchSelectionLine>;
  return isLine(candidate.line) && isLineDirection(candidate.direction);
}

function isWatchSelection(value: unknown): value is WatchSelection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WatchSelection>;
  return (
    typeof candidate.id === "string" &&
    isStop(candidate.stop) &&
    typeof candidate.directionKey === "string" &&
    typeof candidate.directionName === "string" &&
    Array.isArray(candidate.lines) &&
    candidate.lines.every((line) => isWatchSelectionLine(line))
  );
}

function isStoredSelectedLinesByCity(value: unknown): value is StoredSelectedLinesByCity {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoredSelectedLinesByCity>;

  if (!candidate.cities || typeof candidate.cities !== "object") {
    return false;
  }

  return Object.values(candidate.cities).every((cityState) => {
    if (!cityState || typeof cityState !== "object") {
      return false;
    }

    const maybeSelectedLineIds = (cityState as { selectedLineIds?: unknown }).selectedLineIds;
    return Array.isArray(maybeSelectedLineIds) && maybeSelectedLineIds.every((lineId) => typeof lineId === "string");
  });
}

function loadWatchSelections(cityId: string | null): WatchSelection[] {
  if (typeof window === "undefined" || !cityId) {
    return [];
  }

  const storedValue = window.localStorage.getItem(getWatchSelectionsStorageKey(cityId));

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter((selection): selection is WatchSelection => isWatchSelection(selection)).slice(0, 2);
  } catch {
    return [];
  }
}

function loadSelectedLineIdsByCity(): StoredSelectedLinesByCity {
  if (typeof window === "undefined") {
    return { cities: {} };
  }

  const storedValue = window.localStorage.getItem(SELECTED_LINES_STORAGE_KEY);

  if (!storedValue) {
    return { cities: {} };
  }

  try {
    const parsedValue = JSON.parse(storedValue);

    if (!isStoredSelectedLinesByCity(parsedValue)) {
      return { cities: {} };
    }

    return parsedValue;
  } catch {
    return { cities: {} };
  }
}

function getStoredSelectedLineIds(cityId: string | null): string[] {
  if (!cityId) {
    return [];
  }

  return loadSelectedLineIdsByCity().cities[cityId]?.selectedLineIds ?? [];
}

function saveSelectedLineIds(cityId: string, selectedLineIds: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  const storedValue = loadSelectedLineIdsByCity();
  storedValue.cities[cityId] = {
    selectedLineIds
  };
  window.localStorage.setItem(SELECTED_LINES_STORAGE_KEY, JSON.stringify(storedValue));
}

function getLinesCountLabel(lineCount: number): string {
  return lineCount <= 0 ? "Aucune" : `${lineCount} ligne(s)`;
}

export function App(): JSX.Element {
  const {
    nonBlockingError,
    selectedCity,
    availableCities,
    citySelectionRequired,
    setNonBlockingError,
    setSelectedCityId
  } = useAppStore();
  const [watchSelections, setWatchSelections] = useState<WatchSelection[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [updateStatusMessage, setUpdateStatusMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [draftStop, setDraftStop] = useState<Stop | null>(null);
  const [draftDirectionKey, setDraftDirectionKey] = useState<string>("");
  const [draftLineIds, setDraftLineIds] = useState<string[]>([]);
  const [selectedLineIdsByCity, setSelectedLineIdsByCity] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(searchQuery);
  const selectedCityId = selectedCity?.id ?? null;
  const selectedCityLabel = selectedCity ? `${selectedCity.name} · ${selectedCity.networkLabel}` : "Aucune ville";
  const isCityReady = Boolean(selectedCityId);
  const { stops, loading: stopsLoading, error: stopsError } = useStopsSearch(isCityReady ? deferredQuery : "");
  const { lines, error: linesError } = useLinesByStop(isCityReady ? (draftStop?.id ?? null) : null);
  const lastUpdatedLabel = useMemo(() => formatLastUpdatedAt(appLastUpdatedAt), []);

  const directionOptions = useMemo(() => getDirectionOptions(lines), [lines]);

  const draftDirectionOption = useMemo(() => {
    return directionOptions.find((direction) => direction.key === draftDirectionKey) ?? null;
  }, [directionOptions, draftDirectionKey]);

  const linesForDirection = useMemo(() => {
    if (!draftDirectionKey) {
      return [];
    }

    return lines
      .filter((line) => findLineDirection(line, draftDirectionKey) !== null)
      .sort((left, right) =>
        left.shortName.localeCompare(right.shortName, "fr", {
          numeric: true,
          sensitivity: "base"
        })
      );
  }, [draftDirectionKey, lines]);

  const canUpdateExistingSelection = useMemo(() => {
    return draftStop ? watchSelections.some((selection) => selection.stop.id === draftStop.id) : false;
  }, [draftStop, watchSelections]);

  const canConfirmDraft = Boolean(
    draftStop &&
      draftDirectionOption &&
      draftLineIds.length > 0 &&
      (watchSelections.length < MAX_WATCH_SELECTIONS || canUpdateExistingSelection)
  );

  useEffect(() => {
    setNonBlockingError(stopsError ?? linesError ?? null);
  }, [linesError, setNonBlockingError, stopsError]);

  useEffect(() => {
    if (!draftDirectionKey) {
      return;
    }

    const directionStillAvailable = directionOptions.some((direction) => direction.key === draftDirectionKey);

    if (!directionStillAvailable) {
      setDraftDirectionKey("");
      setDraftLineIds([]);
    }
  }, [directionOptions, draftDirectionKey]);

  useEffect(() => {
    if (draftLineIds.length === 0) {
      return;
    }

    const availableLineIds = new Set(linesForDirection.map((line) => line.id));
    const nextLineIds = draftLineIds.filter((lineId) => availableLineIds.has(lineId));

    if (nextLineIds.length !== draftLineIds.length) {
      setDraftLineIds(nextLineIds);
    }
  }, [draftLineIds, linesForDirection]);

  useEffect(() => {
    setWatchSelections(loadWatchSelections(selectedCityId));
    setSelectedLineIdsByCity(getStoredSelectedLineIds(selectedCityId));
    setSearchQuery("");
    setDraftStop(null);
    setDraftDirectionKey("");
    setDraftLineIds([]);
  }, [selectedCityId]);

  useEffect(() => {
    if (!selectedCityId) {
      return;
    }

    window.localStorage.setItem(getWatchSelectionsStorageKey(selectedCityId), JSON.stringify(watchSelections));
  }, [selectedCityId, watchSelections]);

  useEffect(() => {
    if (!selectedCityId) {
      return;
    }

    saveSelectedLineIds(selectedCityId, selectedLineIdsByCity);
  }, [selectedCityId, selectedLineIdsByCity]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [watchSelections]);

  useEffect(() => {
    if (!draftDirectionKey) {
      return;
    }

    if (linesForDirection.length === 0) {
      setDraftLineIds([]);
      return;
    }

    const availableLineIds = new Set(linesForDirection.map((line) => line.id));
    const restoredLineIds = selectedLineIdsByCity.filter((lineId) => availableLineIds.has(lineId));

    setDraftLineIds((currentLineIds) => {
      const currentMatchesStored =
        currentLineIds.length === restoredLineIds.length &&
        currentLineIds.every((lineId, index) => lineId === restoredLineIds[index]);

      return currentMatchesStored ? currentLineIds : restoredLineIds;
    });
  }, [draftDirectionKey, linesForDirection, selectedLineIdsByCity]);

  useEffect(() => {
    function handleUpdateStatus(event: Event): void {
      const customEvent = event as CustomEvent<string>;
      setUpdateStatusMessage(typeof customEvent.detail === "string" ? customEvent.detail : null);
    }

    window.addEventListener(APP_UPDATE_EVENT, handleUpdateStatus);

    return () => {
      window.removeEventListener(APP_UPDATE_EVENT, handleUpdateStatus);
    };
  }, []);

  const handleStopSelect = (stop: Stop): void => {
    setSearchQuery(stop.name);
    setDraftStop(stop);
    setDraftDirectionKey("");
    setDraftLineIds([]);
  };

  const handleStopClear = (): void => {
    setSearchQuery("");
    setDraftStop(null);
    setDraftDirectionKey("");
    setDraftLineIds([]);
  };

  const handleDirectionChange = (directionKey: string): void => {
    setDraftDirectionKey(directionKey);
  };

  const handleCityChange = (cityId: string): void => {
    setSelectedCityId(cityId);
  };

  const handleToggleDraftLine = (lineId: string): void => {
    setDraftLineIds((currentLineIds) => {
      const nextLineIds = currentLineIds.includes(lineId)
        ? currentLineIds.filter((currentLineId) => currentLineId !== lineId)
        : [...currentLineIds, lineId];

      setSelectedLineIdsByCity(nextLineIds);
      return nextLineIds;
    });
  };

  const handleSelectAllDraftLines = (): void => {
    const nextLineIds = linesForDirection.map((line) => line.id);
    setDraftLineIds(nextLineIds);
    setSelectedLineIdsByCity(nextLineIds);
  };

  const handleClearDraftLines = (): void => {
    setDraftLineIds([]);
    setSelectedLineIdsByCity([]);
  };

  const handleConfirmDraft = (): void => {
    if (!draftStop || !draftDirectionOption || draftLineIds.length === 0) {
      return;
    }

    const resolvedLines = linesForDirection.flatMap<WatchSelectionLine>((line) => {
      if (!draftLineIds.includes(line.id)) {
        return [];
      }

      const direction = findLineDirection(line, draftDirectionKey);

      if (!direction) {
        return [];
      }

      return [
        {
          line,
          direction
        }
      ];
    });

    if (resolvedLines.length === 0) {
      return;
    }

    const nextSelection: WatchSelection = {
      id: draftStop.id,
      stop: draftStop,
      directionKey: draftDirectionKey,
      directionName: draftDirectionOption.name,
      lines: resolvedLines
    };

    setWatchSelections((currentSelections) => {
      const existingIndex = currentSelections.findIndex((selection) => selection.stop.id === draftStop.id);

      if (existingIndex >= 0) {
        return currentSelections.map((selection, index) =>
          index === existingIndex ? nextSelection : selection
        );
      }

      if (currentSelections.length >= MAX_WATCH_SELECTIONS) {
        return currentSelections;
      }

      return [...currentSelections, nextSelection];
    });

    handleStopClear();
  };

  const handleRemoveWatchSelection = (selectionId: string): void => {
    setWatchSelections((currentSelections) =>
      currentSelections.filter((selection) => selection.id !== selectionId)
    );
  };

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <nav className="app-navbar" aria-label="Navigation principale">
          <div className="app-navbar__main app-navbar__main--inline">
            <div className="app-brand">
              <img
                className="app-brand__logo"
                src={`${import.meta.env.BASE_URL}app-icon.svg`}
                alt=""
                aria-hidden="true"
              />
              <span>TuuTuut</span>
            </div>
            <button
              type="button"
              className="app-navbar__burger"
              aria-label={isMobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-navbar-panel"
              onClick={() => {
                setIsMobileMenuOpen((currentValue) => !currentValue);
              }}
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          <div
            id="mobile-navbar-panel"
            className={`app-navbar__panel${isMobileMenuOpen ? " app-navbar__panel--open" : ""}`}
          >
            <div className="app-navbar__controls">
              <label className="nav-field nav-field--city">
                <span className="nav-field__label">Ville</span>
                <select
                  className="nav-select"
                  value={selectedCityId ?? ""}
                  onChange={(event) => {
                    handleCityChange(event.target.value);
                  }}
                >
                  <option value="" disabled>
                    Choisir une ville
                  </option>
                  {availableCities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name} · {city.networkLabel}
                    </option>
                  ))}
                </select>
              </label>

              <div className="city-indicator" aria-live="polite">
                <span className="city-indicator__label">Ville active</span>
                <strong>{selectedCityLabel}</strong>
              </div>

              <div className="app-navbar__search">
                <StopSelector
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  results={stops}
                  loading={stopsLoading}
                  error={isCityReady ? stopsError : null}
                  selectedStop={isCityReady ? draftStop : null}
                  disabled={!isCityReady}
                  networkLabel={selectedCity?.networkLabel ?? "reseau"}
                  onSelectStop={handleStopSelect}
                  onClearStop={handleStopClear}
                />
              </div>

              {isCityReady && draftStop ? (
                <>
                  <label className="nav-field">
                    <span className="nav-field__label">Direction</span>
                    <select
                      className="nav-select"
                      value={draftDirectionKey}
                      onChange={(event) => {
                        handleDirectionChange(event.target.value);
                      }}
                    >
                      <option value="">Choisir</option>
                      {directionOptions.map((direction) => (
                        <option key={direction.key} value={direction.key}>
                          {direction.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="nav-field nav-field--lines">
                    <span className="nav-field__label">Lignes</span>
                    <LineMultiSelectDropdown
                      lines={linesForDirection}
                      selectedLineIds={draftLineIds}
                      directionName={draftDirectionOption?.name ?? null}
                      disabled={!draftDirectionOption}
                      onToggleLine={handleToggleDraftLine}
                      onSelectAll={handleSelectAllDraftLines}
                      onClearSelection={handleClearDraftLines}
                    />
                  </div>

                  <button
                    type="button"
                    className="nav-confirm-button"
                    onClick={handleConfirmDraft}
                    disabled={!canConfirmDraft}
                    title={
                      canConfirmDraft
                        ? "Valider cet arrêt"
                        : watchSelections.length >= MAX_WATCH_SELECTIONS && !canUpdateExistingSelection
                          ? "Deux arrêts sont déjà validés"
                          : "Choisissez une direction et au moins une ligne"
                    }
                  >
                    OK
                  </button>
                </>
              ) : null}
            </div>

            <div className="app-navbar__validated">
              {watchSelections.map((selection) => (
                <article key={selection.id} className="watch-pill">
                  <div className="watch-pill__content">
                    <strong>{selection.stop.name}</strong>
                    <span>{selection.directionName}</span>
                    <small>{getLinesCountLabel(selection.lines.length)}</small>
                  </div>
                  <button
                    type="button"
                    className="watch-pill__remove"
                    onClick={() => {
                      handleRemoveWatchSelection(selection.id);
                    }}
                    aria-label={`Retirer ${selection.stop.name}`}
                  >
                    x
                  </button>
                </article>
              ))}
            </div>

            {nonBlockingError ? (
              <ErrorState title="Information" message={nonBlockingError} compact />
            ) : null}
          </div>
        </nav>
      </header>

      <main className="dashboard-panel">
        {citySelectionRequired ? (
          <section className="city-selection-prompt card" role="dialog" aria-modal="true" aria-labelledby="city-selection-title">
            <span className="section-kicker">Configuration</span>
            <h2 id="city-selection-title">Choisissez votre ville</h2>
            <p>
              Sélectionnez le reseau a afficher. Votre choix sera memorise localement pour les prochaines visites.
            </p>
            <div className="city-selection-prompt__actions">
              {availableCities.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  className="city-selection-prompt__button"
                  onClick={() => {
                    handleCityChange(city.id);
                  }}
                >
                  <span>{city.name}</span>
                  <small>{city.networkLabel}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {updateStatusMessage ? (
          <LoadingState
            title="Mise à jour de l'application"
            message={updateStatusMessage}
          />
        ) : null}

        <Dashboard
          selections={watchSelections}
          selectedCityLabel={selectedCityLabel}
          hasSelectedCity={isCityReady}
        />
      </main>

      {lastUpdatedLabel ? (
        <footer className="app-footer" aria-label="Informations de version">
          <small className="app-footer__meta">Dernière modification : {lastUpdatedLabel}</small>
        </footer>
      ) : null}
    </div>
  );
}
