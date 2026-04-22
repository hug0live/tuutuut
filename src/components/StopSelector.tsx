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
  disabled?: boolean;
  networkLabel?: string;
  onSelectStop: (stop: Stop) => void;
  onClearStop: () => void;
};

export function StopSelector({
  query,
  onQueryChange,
  results,
  loading,
  error,
  selectedStop,
  disabled = false,
  networkLabel = "reseau",
  onSelectStop,
  onClearStop
}: StopSelectorProps): JSX.Element {
  const normalizedQuery = query.trim();
  const selectedStopName = selectedStop?.name.trim() ?? "";
  const shouldShowResults = normalizedQuery.length > 0 && normalizedQuery !== selectedStopName;

  return (
    <section className="stop-selector stop-selector--compact">
      <label className="sr-only" htmlFor="stop-search-input">
        Rechercher un arrêt
      </label>

      <div className="search-box search-box--compact">
        <input
          id="stop-search-input"
          className="search-input"
          type="search"
          value={query}
          disabled={disabled}
          onChange={(event) => {
            onQueryChange(event.target.value);
          }}
          placeholder={disabled ? "Choisissez d'abord une ville" : `Rechercher un arrêt ${networkLabel}`}
          autoComplete="off"
        />

        {selectedStop ? (
          <button type="button" className="ghost-button" onClick={onClearStop}>
            Effacer
          </button>
        ) : null}
      </div>

      {error ? <ErrorState title="Recherche indisponible" message={error} compact /> : null}
      {loading ? <LoadingState title="Recherche" message="Mise à jour des arrêts..." compact /> : null}

      {!loading && !error && shouldShowResults ? (
        <div className="results-popover">
          {results.length === 0 ? (
            <p className="field-empty field-empty--compact">Aucun arrêt correspondant.</p>
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
                      disabled={disabled}
                    >
                      <span className="result-button__title">{stop.name}</span>
                      <span className="result-button__meta">Arrêt {networkLabel}</span>
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
