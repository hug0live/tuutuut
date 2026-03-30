import type { Line, Stop } from "../domain/types";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

type LineSelectorProps = {
  stop: Stop | null;
  directionName: string | null;
  lines: Line[];
  selectedLineIds: string[];
  loading: boolean;
  error: string | null;
  onToggleLine: (lineId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  compact?: boolean;
};

export function LineSelector({
  stop,
  directionName,
  lines,
  selectedLineIds,
  loading,
  error,
  onToggleLine,
  onSelectAll,
  onClearSelection,
  compact = false
}: LineSelectorProps): JSX.Element {
  const selectedLineIdSet = new Set(selectedLineIds);

  if (compact) {
    return (
      <section className="line-selector line-selector--compact">
        {!stop ? <p className="field-empty field-empty--compact">Choisissez un arret, puis une direction.</p> : null}
        {stop && !directionName ? (
          <p className="field-empty field-empty--compact">Choisissez maintenant une direction pour afficher les lignes.</p>
        ) : null}
        {error ? <ErrorState title="Lignes indisponibles" message={error} compact /> : null}
        {loading && stop && directionName ? <LoadingState title="Lignes" message="Chargement des lignes..." compact /> : null}

        {!loading && !error && stop && directionName ? (
          <>
            <div className="line-inline-toolbar">
              <span className="field-label">Lignes</span>

              {lines.length > 0 ? (
                <div className="toolbar-actions">
                  <button type="button" className="ghost-button" onClick={onSelectAll}>
                    Tout
                  </button>
                  <button type="button" className="ghost-button" onClick={onClearSelection}>
                    Rien
                  </button>
                </div>
              ) : null}
            </div>

            {lines.length === 0 ? (
              <p className="field-empty field-empty--compact">Aucune ligne disponible vers {directionName}.</p>
            ) : (
              <div className="line-choice-grid">
                {lines.map((line) => {
                  const isSelected = selectedLineIdSet.has(line.id);
                  const lineColor = line.color ?? "#0b7a75";
                  const textColor = line.textColor ?? "#ffffff";

                  return (
                    <button
                      key={line.id}
                      type="button"
                      className={`line-choice-button${isSelected ? " line-choice-button--selected" : ""}`}
                      onClick={() => {
                        onToggleLine(line.id);
                      }}
                      style={
                        isSelected
                          ? {
                              borderColor: lineColor,
                              background: `${lineColor}16`
                            }
                          : undefined
                      }
                    >
                      <span
                        className="line-inline-badge"
                        style={{
                          background: lineColor,
                          color: textColor
                        }}
                      >
                        {line.shortName}
                      </span>
                      <span className="line-choice-button__text">
                        <strong>{line.longName ?? line.shortName}</strong>
                        <small>{isSelected ? "Affichee sur le dashboard" : `Vers ${directionName}`}</small>
                      </span>
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
        <label className="field-label">Selection des lignes</label>
        <p className="field-help">Une fois la direction choisie, activez une ou plusieurs lignes.</p>
      </div>

      {!stop ? <p className="field-empty">Selectionnez d&apos;abord un arret.</p> : null}
      {stop && !directionName ? <p className="field-empty">Choisissez d&apos;abord une direction.</p> : null}
      {error ? <ErrorState title="Lignes indisponibles" message={error} compact /> : null}
      {loading && stop && directionName ? <LoadingState title="Lignes" message="Chargement des lignes..." compact /> : null}

      {!loading && !error && stop && directionName ? (
        <>
          <div className="line-selector__toolbar">
            <span>{selectedLineIds.length} ligne(s) active(s)</span>

            {lines.length > 0 ? (
              <div className="toolbar-actions">
                <button type="button" className="ghost-button" onClick={onSelectAll}>
                  Tout activer
                </button>
                <button type="button" className="ghost-button" onClick={onClearSelection}>
                  Tout retirer
                </button>
              </div>
            ) : null}
          </div>

          {lines.length === 0 ? (
            <p className="field-empty">Aucune ligne disponible vers {directionName}.</p>
          ) : (
            <div className="line-choice-grid">
              {lines.map((line) => {
                const isSelected = selectedLineIdSet.has(line.id);
                const lineColor = line.color ?? "#0b7a75";
                const textColor = line.textColor ?? "#ffffff";

                return (
                  <button
                    key={line.id}
                    type="button"
                    className={`line-choice-button${isSelected ? " line-choice-button--selected" : ""}`}
                    onClick={() => {
                      onToggleLine(line.id);
                    }}
                    style={
                      isSelected
                        ? {
                            borderColor: lineColor,
                            background: `${lineColor}16`
                          }
                        : undefined
                    }
                  >
                    <span
                      className="line-inline-badge"
                      style={{
                        background: lineColor,
                        color: textColor
                      }}
                    >
                      {line.shortName}
                    </span>
                    <span className="line-choice-button__text">
                      <strong>{line.longName ?? line.shortName}</strong>
                      <small>{isSelected ? "Affichee sur le dashboard" : `Vers ${directionName}`}</small>
                    </span>
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
