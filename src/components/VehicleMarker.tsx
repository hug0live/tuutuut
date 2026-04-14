import type { PositionedVehicle } from "../domain/vehiclePositioning";

type VehicleMarkerProps = {
  vehicle: PositionedVehicle;
  lineColor: string;
  textColor: string;
  scale?: number;
};

function getArrowPath(directionId?: string): string {
  const normalizedDirection = directionId?.toLowerCase() ?? "";
  const pointsLeft =
    normalizedDirection.includes("inbound") ||
    normalizedDirection.includes("retour") ||
    normalizedDirection.includes("west");

  return pointsLeft ? "M 6 -7 L -4 0 L 6 7" : "M -6 -7 L 4 0 L -6 7";
}

export function VehicleMarker({
  vehicle,
  lineColor,
  textColor,
  scale = 1
}: VehicleMarkerProps): JSX.Element {
  return (
    <g
      className="vehicle-marker"
      style={{
        transform: `translate(${vehicle.x}px, ${vehicle.y}px)`
      }}
    >
      <title>{`${vehicle.vehicleId} - ${vehicle.status ?? "UNKNOWN"}`}</title>
      <g transform={scale === 1 ? undefined : `scale(${scale})`}>
        <circle className="vehicle-marker__ring" r="18" fill="#fbf7ef" stroke={lineColor} strokeWidth="5" />
        <circle className="vehicle-marker__core" r="8.5" fill={lineColor} />
        <path
          d={getArrowPath(vehicle.directionId)}
          fill="none"
          stroke={textColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}
