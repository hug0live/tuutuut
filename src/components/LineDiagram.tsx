import { useMemo } from "react";
import { estimateNextArrival } from "../domain/arrivalEstimation";
import { projectLineStops } from "../domain/lineProjection";
import { positionVehicles } from "../domain/vehiclePositioning";
import type { Line, LineDirection } from "../domain/types";
import { useLineStops } from "../hooks/useLineStops";
import { useRealtimeVehicles } from "../hooks/useRealtimeVehicles";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { NextArrivalCard } from "./NextArrivalCard";
import { StopMarker } from "./StopMarker";
import { VehicleMarker } from "./VehicleMarker";

type LineDiagramProps = {
  line: Line;
  direction: LineDirection;
  selectedStopAnchorId: string | null;
  selectedStopName: string | null;
  embedded?: boolean;
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

export function LineDiagram({
  line,
  direction,
  selectedStopAnchorId,
  selectedStopName,
  embedded = false
}: LineDiagramProps): JSX.Element {
  const lineColor = line.color ?? "#0b7a75";
  const textColor = line.textColor ?? "#ffffff";
  const { lineStops, loading: stopsLoading, error: stopsError } = useLineStops(
    line.id,
    direction.id,
    selectedStopAnchorId ?? undefined
  );
  const { vehicles, loading: vehiclesLoading, error: vehiclesError, updatedAt } = useRealtimeVehicles(
    line.id,
    direction.id,
    selectedStopAnchorId ?? undefined
  );

  const projection = useMemo(() => projectLineStops(lineStops), [lineStops]);
  const positionedVehicles = useMemo(() => positionVehicles(vehicles, projection), [projection, vehicles]);
  const nextArrival = useMemo(() => estimateNextArrival(lineStops, vehicles), [lineStops, vehicles]);

  if (stopsLoading && lineStops.length === 0) {
    return (
      <article className={`line-diagram line-diagram--loading${embedded ? " line-diagram--embedded" : " card"}`}>
        <LoadingState
          title={`Ligne ${line.shortName} vers ${direction.name}`}
          message="Construction du schema horizontal..."
        />
      </article>
    );
  }

  if (stopsError && lineStops.length === 0) {
    return (
      <article className={`line-diagram${embedded ? " line-diagram--embedded" : " card"}`}>
        <ErrorState title={`Ligne ${line.shortName} vers ${direction.name}`} message={stopsError} />
      </article>
    );
  }

  return (
    <section className="line-diagram-layout">
      <article className={`line-diagram${embedded ? " line-diagram--embedded" : " card"}`}>
        <header className="line-diagram__header">
          <div className="line-diagram__title-group">
            <span
              className="line-badge"
              style={{
                background: lineColor,
                color: textColor
              }}
            >
              {line.shortName}
            </span>
            <div>
              <h3>{line.longName ?? `Ligne ${line.shortName}`}</h3>
              <p>Direction {direction.name}. Affichage ordonne des arrets avec projection horizontale SVG.</p>
            </div>
          </div>

          <div className="line-diagram__meta">
            <span>Vers {direction.name}</span>
            <span>{lineStops.length} arret(s)</span>
            <span>{positionedVehicles.length} vehicule(s)</span>
            <span>Mise a jour {formatTime(updatedAt)}</span>
          </div>
        </header>

        {vehiclesError ? (
          <div className="inline-warning">Temps reel indisponible, dernier etat conserve si disponible.</div>
        ) : null}

        <div className="line-diagram__svg-frame">
          <svg className="line-diagram__svg" viewBox={`0 0 ${projection.width} ${projection.height}`} role="img">
            <title>{`Schema de la ligne ${line.shortName} vers ${direction.name}`}</title>
            <desc>{`${line.longName ?? `Ligne ${line.shortName}`} direction ${direction.name}.`}</desc>

            <line
              className="diagram-rail"
              x1={projection.padding}
              y1={projection.lineY}
              x2={projection.width - projection.padding}
              y2={projection.lineY}
              stroke={lineColor}
              strokeWidth="8"
            />

            <line
              className="diagram-rail diagram-rail--ghost"
              x1={projection.padding}
              y1={projection.lineY}
              x2={projection.width - projection.padding}
              y2={projection.lineY}
              stroke="rgba(255,255,255,0.72)"
              strokeWidth="2"
            />

            {projection.projectedStops.map((stop) => (
              <StopMarker
                key={stop.stopId}
                stop={stop}
                lineY={projection.lineY}
                isSelected={stop.stopName === selectedStopName}
                showLabel={false}
              />
            ))}

            {positionedVehicles.map((vehicle) => (
              <VehicleMarker
                key={vehicle.vehicleId}
                vehicle={vehicle}
                lineColor={lineColor}
                textColor={textColor}
              />
            ))}

            {!vehiclesLoading && positionedVehicles.length === 0 ? (
              <text className="diagram-empty" x={projection.width / 2} y="48">
                Aucun vehicule visible en ce moment
              </text>
            ) : null}
          </svg>
        </div>
      </article>

      <NextArrivalCard
        stopName={selectedStopName ?? "cet arret"}
        arrival={nextArrival}
        loading={vehiclesLoading}
        error={vehiclesError}
        standalone
        badge={{
          label: line.shortName,
          color: lineColor,
          textColor
        }}
      />
    </section>
  );
}
