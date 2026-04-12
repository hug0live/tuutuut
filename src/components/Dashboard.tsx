import type { WatchSelection } from "../domain/types";
import { CombinedStopDiagram } from "./CombinedStopDiagram";

type DashboardProps = {
  selections: WatchSelection[];
};

export function Dashboard({ selections }: DashboardProps): JSX.Element {
  if (selections.length === 0) {
    return (
      <section className="card dashboard-empty">
        <span className="section-kicker">Dashboard</span>
        <h2>Validez un arrêt dans la barre de navigation</h2>
        <p>
          Recherchez un arrêt, choisissez une direction, cochez une ou plusieurs lignes, puis
          validez avec OK. Vous pouvez suivre jusqu&apos;à 2 arrêts.
        </p>
      </section>
    );
  }

  return (
    <section className="dashboard-stack">
      {selections.map((selection) => (
        <CombinedStopDiagram key={selection.id} selection={selection} />
      ))}
    </section>
  );
}
