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
        <h2>Validez un arret dans la navbar</h2>
        <p>
          Recherchez un arret, choisissez une direction, cochez une ou plusieurs lignes, puis
          validez avec OK. Vous pouvez suivre jusqu&apos;a 2 arrets.
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
