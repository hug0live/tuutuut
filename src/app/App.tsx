import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { findLineDirection, getDirectionOptions } from "../domain/lineDirections";
import type { Line, LineDirection, Stop, WatchSelection, WatchSelectionLine } from "../domain/types";
import { Dashboard } from "../components/Dashboard";
import { ErrorState } from "../components/ErrorState";
import { LineMultiSelectDropdown } from "../components/LineMultiSelectDropdown";
import { StopSelector } from "../components/StopSelector";
import { useLinesByStop } from "../hooks/useLinesByStop";
import { useStopsSearch } from "../hooks/useStopsSearch";
import { useAppStore } from "../store/useAppStore";

const WATCH_SELECTIONS_STORAGE_KEY = "tcl-live-dashboard::watch-selections";
const MAX_WATCH_SELECTIONS = 2;

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

function loadWatchSelections(): WatchSelection[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storedValue = window.localStorage.getItem(WATCH_SELECTIONS_STORAGE_KEY);

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

function getLinesCountLabel(lineCount: number): string {
  return lineCount <= 0 ? "Aucune" : `${lineCount} ligne(s)`;
}

export function App(): JSX.Element {
  const { nonBlockingError, setNonBlockingError } = useAppStore();
  const [watchSelections, setWatchSelections] = useState<WatchSelection[]>(loadWatchSelections);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [draftStop, setDraftStop] = useState<Stop | null>(null);
  const [draftDirectionKey, setDraftDirectionKey] = useState<string>("");
  const [draftLineIds, setDraftLineIds] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(searchQuery);
  const { stops, loading: stopsLoading, error: stopsError } = useStopsSearch(deferredQuery);
  const { lines, error: linesError } = useLinesByStop(draftStop?.id ?? null);

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
    window.localStorage.setItem(WATCH_SELECTIONS_STORAGE_KEY, JSON.stringify(watchSelections));
  }, [watchSelections]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [watchSelections]);

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
    setDraftLineIds([]);
  };

  const handleToggleDraftLine = (lineId: string): void => {
    setDraftLineIds((currentLineIds) =>
      currentLineIds.includes(lineId)
        ? currentLineIds.filter((currentLineId) => currentLineId !== lineId)
        : [...currentLineIds, lineId]
    );
  };

  const handleSelectAllDraftLines = (): void => {
    setDraftLineIds(linesForDirection.map((line) => line.id));
  };

  const handleClearDraftLines = (): void => {
    setDraftLineIds([]);
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
            <div className="app-brand">TuuTuut</div>
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
              <div className="app-navbar__search">
                <StopSelector
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  results={stops}
                  loading={stopsLoading}
                  error={stopsError}
                  selectedStop={draftStop}
                  onSelectStop={handleStopSelect}
                  onClearStop={handleStopClear}
                />
              </div>

              {draftStop ? (
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
                        ? "Valider cet arret"
                        : watchSelections.length >= MAX_WATCH_SELECTIONS && !canUpdateExistingSelection
                          ? "Deux arrets sont deja valides"
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
        <Dashboard selections={watchSelections} />
      </main>
    </div>
  );
}
