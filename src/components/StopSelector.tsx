import type { Stop } from "../domain/types";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

type StopSelectorProps = {
  query: string;
  onQueryChange: (value: string) => void;
  results: Stop[];
  loading: boolean;
  error: string | null;
  selectedStop: Stop | null;
  onSelectStop: (stop: Stop) => void;
  onClearStop: () => void;
  compact?: boolean;
};

export function StopSelector({
  query,
  onQueryChange,
  results,
  loading,
  error,
  selectedStop,
  onSelectStop,
  onClearStop,
  compact = false
}: StopSelectorProps): JSX.Element {
  const normalizedQuery = query.trim();
  const selectedStopName = selectedStop?.name.trim() ?? "";
  const shouldShowResults = normalizedQuery.length > 0 && normalizedQuery !== selectedStopName;

  if (compact) {
    return (
      <section className="stop-selector stop-selector--compact">
        <label className="sr-only" htmlFor="stop-search-input">
          Rechercher un arret
        </label>

        <div className="search-box search-box--compact">
          <input
            id="stop-search-input"
            className="search-input"
            type="search"
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
            }}
            placeholder="Rechercher un arret TCL"
            autoComplete="off"
          />

          {selectedStop ? (
            <button type="button" className="ghost-button" onClick={onClearStop}>
              Effacer
            </button>
          ) : null}
        </div>

        {error ? <ErrorState title="Recherche indisponible" message={error} compact /> : null}
        {loading ? <LoadingState title="Recherche" message="Mise a jour des arrets..." compact /> : null}

        {!loading && !error && shouldShowResults ? (
          <div className="results-popover">
            {results.length === 0 ? (
              <p className="field-empty field-empty--compact">Aucun arret correspondant.</p>
            ) : (
              <ul className="results-list">
                {results.map((stop) => {
                  const isSelected = stop.id === selectedStop?.id;

                  return (
                    <li key={stop.id}>
                      <button
                        type="button"
                        className={`result-button${isSelected ? " result-button--selected" : ""}`}
                        onClick={() => {
                          onSelectStop(stop);
                        }}
                      >
                        <span className="result-button__title">{stop.name}</span>
                        <span className="result-button__meta">Arret TCL</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="field-block">
      <div className="field-heading">
        <label className="field-label" htmlFor="stop-search-input">
          Rechercher un arret
        </label>
        <p className="field-help">Exemples : Hotel de Ville, Part-Dieu, Charpennes.</p>
      </div>

      <div className="search-box">
        <input
          id="stop-search-input"
          className="search-input"
          type="search"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
          }}
          placeholder="Nom d'arret TCL"
          autoComplete="off"
        />

        {selectedStop ? (
          <button type="button" className="ghost-button" onClick={onClearStop}>
            Effacer
          </button>
        ) : null}
      </div>

      {selectedStop ? (
        <div className="selected-pill">
          <span>Arret actif</span>
          <strong>{selectedStop.name}</strong>
        </div>
      ) : (
        <p className="field-empty">Aucun arret choisi pour l&apos;instant.</p>
      )}

      {error ? <ErrorState title="Recherche indisponible" message={error} compact /> : null}
      {loading ? <LoadingState title="Recherche" message="Mise a jour des arrets..." compact /> : null}

      {!loading && !error ? (
        <div className="results-block">
          <div className="results-block__header">
            <span>{query.trim() ? "Resultats" : "Suggestions"}</span>
            <span>{results.length}</span>
          </div>

          {results.length === 0 ? (
            <p className="field-empty">Aucun arret correspondant.</p>
          ) : (
            <ul className="results-list">
              {results.map((stop) => {
                const isSelected = stop.id === selectedStop?.id;

                return (
                  <li key={stop.id}>
                    <button
                      type="button"
                      className={`result-button${isSelected ? " result-button--selected" : ""}`}
                      onClick={() => {
                        onSelectStop(stop);
                      }}
                    >
                      <span className="result-button__title">{stop.name}</span>
                      <span className="result-button__meta">Arret TCL unique</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
