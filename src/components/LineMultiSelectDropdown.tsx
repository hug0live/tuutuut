import { useEffect, useRef, useState } from "react";
import type { Line } from "../domain/types";

type LineMultiSelectDropdownProps = {
  lines: Line[];
  selectedLineIds: string[];
  directionName: string | null;
  disabled?: boolean;
  onToggleLine: (lineId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
};

function getButtonLabel(selectedCount: number, directionName: string | null, disabled: boolean): string {
  if (disabled) {
    return "Choisir une direction";
  }

  if (selectedCount === 0) {
    return directionName ? `Choisir pour ${directionName}` : "Choisir des lignes";
  }

  return `${selectedCount} ligne(s)`;
}

export function LineMultiSelectDropdown({
  lines,
  selectedLineIds,
  directionName,
  disabled = false,
  onToggleLine,
  onSelectAll,
  onClearSelection
}: LineMultiSelectDropdownProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (disabled || lines.length === 0) {
      setIsOpen(false);
    }
  }, [disabled, lines.length]);

  return (
    <div ref={containerRef} className="nav-multiselect">
      <button
        type="button"
        className="nav-multiselect__trigger"
        onClick={() => {
          if (!disabled) {
            setIsOpen((currentValue) => !currentValue);
          }
        }}
        aria-expanded={isOpen}
        disabled={disabled}
      >
        <span>{getButtonLabel(selectedLineIds.length, directionName, disabled)}</span>
        <span className="nav-multiselect__caret">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen ? (
        <div className="nav-multiselect__panel">
          <div className="nav-multiselect__toolbar">
            <button type="button" className="ghost-button" onClick={onSelectAll}>
              Tout
            </button>
            <button type="button" className="ghost-button" onClick={onClearSelection}>
              Rien
            </button>
          </div>

          {lines.length === 0 ? (
            <p className="field-empty field-empty--compact">Aucune ligne disponible.</p>
          ) : (
            <div className="nav-multiselect__options">
              {lines.map((line) => {
                const isChecked = selectedLineIds.includes(line.id);
                const lineColor = line.color ?? "#0b7a75";
                const textColor = line.textColor ?? "#ffffff";

                return (
                  <label key={line.id} className="nav-multiselect__option">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        onToggleLine(line.id);
                      }}
                    />
                    <span
                      className="line-inline-badge"
                      style={{
                        background: lineColor,
                        color: textColor
                      }}
                    >
                      {line.shortName}
                    </span>
                    <span className="nav-multiselect__option-label">{line.longName ?? line.shortName}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
