import type { ProjectedStop } from "../domain/lineProjection";

type StopMarkerProps = {
  stop: ProjectedStop;
  lineY: number;
  isSelected: boolean;
  showLabel?: boolean;
};

function splitLabel(label: string): string[] {
  if (label.length <= 16) {
    return [label];
  }

  const words = label.split(" ");
  const midPoint = Math.ceil(words.length / 2);
  return [words.slice(0, midPoint).join(" "), words.slice(midPoint).join(" ")];
}

export function StopMarker({
  stop,
  lineY,
  isSelected,
  showLabel = true
}: StopMarkerProps): JSX.Element {
  const labelLines = splitLabel(stop.stopName);
  const labelBaseY = stop.labelSide === "top" ? lineY - 34 - (labelLines.length - 1) * 11 : lineY + 34;

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
        <text className="stop-marker__label" x={stop.x} y={labelBaseY}>
          {labelLines.map((line, index) => (
            <tspan key={`${stop.stopId}-${line}`} x={stop.x} dy={index === 0 ? 0 : 13}>
              {line}
            </tspan>
          ))}
        </text>
      ) : null}
    </g>
  );
}
