import type { ProjectedStop } from "../domain/lineProjection";

type StopMarkerProps = {
  stop: ProjectedStop;
  lineY: number;
  isSelected: boolean;
  showLabel?: boolean;
};

export function StopMarker({ stop, lineY, isSelected, showLabel = true }: StopMarkerProps): JSX.Element {
  const labelY = lineY + 42;
  const labelRotation = -38;
  const labelAnchor = stop.ratio < 0.08 ? "start" : stop.ratio > 0.92 ? "end" : "middle";

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
      {showLabel ? (
        <text
          className="stop-marker__label"
          x={stop.x}
          y={labelY}
          textAnchor={labelAnchor}
          transform={`rotate(${labelRotation} ${stop.x} ${labelY})`}
        >
          {stop.stopName}
        </text>
      ) : null}
    </g>
  );
}
