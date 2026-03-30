import type { AdapterSourceInfo } from "../domain/types";

type StatusBarProps = {
  selectedStopName: string | null;
  lastUpdated: string | null;
  sourceInfo: AdapterSourceInfo;
  isBusy?: boolean;
};

function formatTime(timestamp: string | null): string {
  if (!timestamp) {
    return "En attente";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp));
}

export function StatusBar({
  selectedStopName,
  lastUpdated,
  sourceInfo,
  isBusy = false
}: StatusBarProps): JSX.Element {
  return (
    <header className="status-bar">
      <section className="card status-hero">
        <span className="section-kicker">TCL Live Dashboard</span>
        <h1>Suivi temps reel des lignes de bus sur ecran mural</h1>
        <p>
          Vue SVG sans carte, mise a jour automatique toutes les 10 secondes et source de donnees
          temps reel interchangeable.
        </p>
      </section>

      <section className="card status-card">
        <span className="status-card__label">Arret selectionne</span>
        <strong className="status-card__value">{selectedStopName ?? "Aucun arret"}</strong>
        <span className="status-card__meta">Le choix de l&apos;arret pilote la liste des lignes.</span>
      </section>

      <section className="card status-card">
        <span className="status-card__label">Derniere mise a jour</span>
        <strong className="status-card__value">{formatTime(lastUpdated)}</strong>
        <span className="status-card__meta">
          {isBusy ? "Actualisation en cours..." : "Rafraichissement automatique actif"}
        </span>
      </section>

      <section className="card status-card">
        <span className="status-card__label">Source de donnees</span>
        <strong className="status-card__value">{sourceInfo.label}</strong>
        <span className="status-card__meta">{sourceInfo.detail}</span>
      </section>
    </header>
  );
}
