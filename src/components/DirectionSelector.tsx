import type { DirectionOption, Stop } from "../domain/types";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

type DirectionSelectorProps = {
  stop: Stop | null;
  directions: DirectionOption[];
  selectedDirectionKey: string | null;
  loading: boolean;
  error: string | null;
  onSelectDirection: (directionKey: string) => void;
  onClearSelection: () => void;
  compact?: boolean;
};

export function DirectionSelector({
  stop,
  directions,
  selectedDirectionKey,
  loading,
  error,
  onSelectDirection,
  onClearSelection,
  compact = false
}: DirectionSelectorProps): JSX.Element {
  if (compact) {
    return (
      <section className="direction-selector direction-selector--compact">
        {!stop ? <p className="field-empty field-empty--compact">Choisissez un arret pour charger ses directions.</p> : null}
        {error ? <ErrorState title="Directions indisponibles" message={error} compact /> : null}
        {loading && stop ? <LoadingState title="Directions" message="Chargement des destinations..." compact /> : null}

        {!loading && !error && stop ? (
          <>
            <div className="line-inline-toolbar">
              <span className="field-label">Direction</span>

              {selectedDirectionKey ? (
                <div className="toolbar-actions">
                  <button type="button" className="ghost-button" onClick={onClearSelection}>
                    Effacer
                  </button>
                </div>
              ) : null}
            </div>

            {directions.length === 0 ? (
              <p className="field-empty field-empty--compact">Aucune direction disponible pour cet arret.</p>
            ) : (
              <div className="direction-choice-list">
                {directions.map((direction) => {
                  const isSelected = direction.key === selectedDirectionKey;

                  return (
                    <button
                      key={direction.key}
                      type="button"
                      className={`direction-button${isSelected ? " direction-button--selected" : ""}`}
                      onClick={() => {
                        onSelectDirection(direction.key);
                      }}
                    >
                      <span>{direction.name}</span>
                      <span className="direction-button__count">{direction.lineCount} ligne(s)</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </section>
    );
  }

  return (
    <section className="field-block">
      <div className="field-heading">
        <label className="field-label">Selection de la direction</label>
        <p className="field-help">Choisissez d&apos;abord une destination, puis les lignes a afficher.</p>
      </div>

      {!stop ? <p className="field-empty">Selectionnez d&apos;abord un arret.</p> : null}
      {error ? <ErrorState title="Directions indisponibles" message={error} compact /> : null}
      {loading && stop ? <LoadingState title="Directions" message="Chargement des destinations..." compact /> : null}

      {!loading && !error && stop ? (
        <>
          <div className="line-selector__toolbar">
            <span>{selectedDirectionKey ? "1 direction active" : "Aucune direction active"}</span>

            {selectedDirectionKey ? (
              <div className="toolbar-actions">
                <button type="button" className="ghost-button" onClick={onClearSelection}>
                  Retirer la direction
                </button>
              </div>
            ) : null}
          </div>

          {directions.length === 0 ? (
            <p className="field-empty">Aucune direction disponible pour cet arret.</p>
          ) : (
            <div className="direction-choice-list">
              {directions.map((direction) => {
                const isSelected = direction.key === selectedDirectionKey;

                return (
                  <button
                    key={direction.key}
                    type="button"
                    className={`direction-button${isSelected ? " direction-button--selected" : ""}`}
                    onClick={() => {
                      onSelectDirection(direction.key);
                    }}
                  >
                    <span>{direction.name}</span>
                    <span className="direction-button__count">{direction.lineCount} ligne(s)</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
