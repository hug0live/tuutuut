import type { ProjectedStop } from "../domain/lineProjection";

type StopMarkerProps = {
  stop: ProjectedStop;
  lineY: number;
  isSelected: boolean;
};

export function StopMarker({ stop, lineY, isSelected }: StopMarkerProps): JSX.Element {
  return (
    <g className={`stop-marker${isSelected ? " stop-marker--selected" : ""}`}>
      <line
        className="stop-marker__tick"
        x1={stop.x}
        y1={lineY - 16}
        x2={stop.x}
        y2={lineY + 16}
      />
      <circle className="stop-marker__node" cx={stop.x} cy={lineY} r={isSelected ? 7 : 5} />
    </g>
  );
}
