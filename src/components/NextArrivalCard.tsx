import type { EstimatedArrival } from "../domain/arrivalEstimation";

type ArrivalBadge = {
  label: string;
  color: string;
  textColor: string;
};

type NextArrivalCardProps = {
  stopName: string;
  arrival: EstimatedArrival | null;
  loading?: boolean;
  error?: string | null;
  badge?: ArrivalBadge | null;
  standalone?: boolean;
};

function formatEtaValue(arrival: EstimatedArrival | null, loading: boolean, error: string | null | undefined): string {
  if (loading && !arrival) {
    return "...";
  }

  if (!arrival) {
    return error ? "Indispo" : "--";
  }

  if (arrival.secondsAway <= 20 || arrival.status === "DUE") {
    return "Maint.";
  }

  if (arrival.secondsAway < 60) {
    return `${Math.max(1, Math.round(arrival.secondsAway))} s`;
  }

  const roundedMinutes = Math.max(1, Math.round(arrival.secondsAway / 60));
  return `${roundedMinutes} min`;
}

function formatExpectedTime(timestamp: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function getCaption(
  arrival: EstimatedArrival | null,
  loading: boolean,
  error: string | null | undefined
): string {
  if (loading && !arrival) {
    return "Recherche du prochain passage...";
  }

  if (!arrival) {
    return error ? "Temps réel indisponible pour le prochain passage." : "Aucun bus visible pour cet arrêt.";
  }

  return `Prévu à ${formatExpectedTime(arrival.expectedAt)}`;
}

export function NextArrivalCard({
  stopName,
  arrival,
  loading = false,
  error = null,
  badge = null,
  standalone = false
}: NextArrivalCardProps): JSX.Element {
  return (
    <aside
      className={`next-arrival-card${standalone ? " next-arrival-card--standalone card" : ""}`}
      aria-live="polite"
    >
      <span className="next-arrival-card__eyebrow">Prochain bus</span>

      {badge ? (
        <span
          className="next-arrival-card__badge"
          style={{
            background: badge.color,
            color: badge.textColor
          }}
        >
          {badge.label}
        </span>
      ) : null}

      <strong className="next-arrival-card__value">{formatEtaValue(arrival, loading, error)}</strong>
      <p className="next-arrival-card__caption">{getCaption(arrival, loading, error)}</p>
      <p className="next-arrival-card__stop">à {stopName}</p>
    </aside>
  );
}
