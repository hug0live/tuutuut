import type { EstimatedArrival } from "../domain/arrivalEstimation";

type ArrivalBadge = {
  label: string;
  color: string;
  textColor: string;
};

type NextArrivalCardProps = {
  title?: string;
  stopName: string;
  arrival: EstimatedArrival | null;
  loading?: boolean;
  error?: string | null;
  badge?: ArrivalBadge | null;
  standalone?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  unavailableMessage?: string;
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

function getArrivalSourceLabel(arrival: EstimatedArrival | null): string | null {
  if (!arrival?.sourceType) {
    return null;
  }

  return arrival.sourceType === "REALTIME" ? "Temps réel" : "Théorique";
}

function getCaption(
  arrival: EstimatedArrival | null,
  loading: boolean,
  error: string | null | undefined,
  loadingMessage: string,
  emptyMessage: string,
  unavailableMessage: string
): string {
  if (loading && !arrival) {
    return loadingMessage;
  }

  if (!arrival) {
    return error ? unavailableMessage : emptyMessage;
  }

  if (arrival.sourceType === "THEORETICAL") {
    return `Horaire théorique à ${formatExpectedTime(arrival.expectedAt)}`;
  }

  return `Prévu à ${formatExpectedTime(arrival.expectedAt)}`;
}

export function NextArrivalCard({
  title = "Prochain bus",
  stopName,
  arrival,
  loading = false,
  error = null,
  badge = null,
  standalone = false,
  loadingMessage = "Recherche du prochain passage...",
  emptyMessage = "Aucun bus visible pour cet arrêt.",
  unavailableMessage = "Temps réel indisponible pour le prochain passage."
}: NextArrivalCardProps): JSX.Element {
  const arrivalSourceLabel = getArrivalSourceLabel(arrival);
  const isRealtime = arrival?.sourceType === "REALTIME";
  const isTheoretical = arrival?.sourceType === "THEORETICAL";

  return (
    <aside
      className={`next-arrival-card${standalone ? " next-arrival-card--standalone card" : ""}${
        isTheoretical ? " next-arrival-card--theoretical" : ""
      }${isRealtime ? " next-arrival-card--realtime" : ""}`}
      aria-live="polite"
    >
      <div className="next-arrival-card__topbar">
        <span className="next-arrival-card__eyebrow">{title}</span>

        {arrivalSourceLabel ? (
          <span
            className={`next-arrival-card__source${isRealtime ? " next-arrival-card__source--realtime" : ""}`}
            aria-label={arrivalSourceLabel}
            title={arrivalSourceLabel}
          >
            {isRealtime ? (
              <span className="next-arrival-card__realtime-icon" aria-hidden="true">
                <span className="next-arrival-card__realtime-dot" />
                <span className="next-arrival-card__realtime-wave next-arrival-card__realtime-wave--inner" />
                <span className="next-arrival-card__realtime-wave next-arrival-card__realtime-wave--outer" />
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

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
      <p className="next-arrival-card__caption">
        {getCaption(arrival, loading, error, loadingMessage, emptyMessage, unavailableMessage)}
      </p>
      <p className="next-arrival-card__stop">à {stopName}</p>
    </aside>
  );
}
