import type { PositionedVehicle } from "../domain/vehiclePositioning";

type VehicleMarkerProps = {
  vehicle: PositionedVehicle;
  lineColor: string;
  textColor: string;
};

function getArrowPath(directionId?: string): string {
  const normalizedDirection = directionId?.toLowerCase() ?? "";
  const pointsLeft =
    normalizedDirection.includes("inbound") ||
    normalizedDirection.includes("retour") ||
    normalizedDirection.includes("west");

  return pointsLeft ? "M 4 -5 L -3 0 L 4 5" : "M -4 -5 L 3 0 L -4 5";
}

export function VehicleMarker({
  vehicle,
  lineColor,
  textColor
}: VehicleMarkerProps): JSX.Element {
  return (
    <g
      className="vehicle-marker"
      style={{
        transform: `translate(${vehicle.x}px, ${vehicle.y}px)`
      }}
    >
      <title>{`${vehicle.vehicleId} - ${vehicle.status ?? "UNKNOWN"}`}</title>
      <circle className="vehicle-marker__ring" r="13" fill="#fbf7ef" stroke={lineColor} strokeWidth="4" />
      <circle className="vehicle-marker__core" r="6" fill={lineColor} />
      <path d={getArrowPath(vehicle.directionId)} fill="none" stroke={textColor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}
