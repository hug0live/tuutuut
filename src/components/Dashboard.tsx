import type { WatchSelection } from "../domain/types";
import { CombinedStopDiagram } from "./CombinedStopDiagram";

type DashboardProps = {
  selections: WatchSelection[];
  selectedCityLabel: string;
  hasSelectedCity: boolean;
};

export function Dashboard({ selections, selectedCityLabel, hasSelectedCity }: DashboardProps): JSX.Element {
  if (!hasSelectedCity) {
    return <section className="dashboard-stack" aria-hidden="true" />;
  }

  if (selections.length === 0) {
    return (
      <section className="card dashboard-empty">
        <span className="section-kicker">Dashboard</span>
        <h2>Validez un arrêt dans la barre de navigation</h2>
        <p>
          Recherchez un arrêt, choisissez une direction, cochez une ou plusieurs lignes, puis
          validez avec OK. Vous pouvez suivre jusqu&apos;à 2 arrêts.
        </p>
        <p className="dashboard-empty__city">Ville active : {selectedCityLabel}</p>
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
