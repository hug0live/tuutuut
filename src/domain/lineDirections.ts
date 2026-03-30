import type { DirectionOption, Line, LineDirection } from "./types";

const FALLBACK_DIRECTION: LineDirection = {
  id: "default",
  name: "Direction principale"
};

function normalizeDirectionValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getLineDirections(line: Line): LineDirection[] {
  if (line.directions && line.directions.length > 0) {
    return line.directions;
  }

  return [FALLBACK_DIRECTION];
}

export function getDirectionKey(direction: LineDirection): string {
  return normalizeDirectionValue(direction.name) || normalizeDirectionValue(direction.id) || direction.id;
}

export function findLineDirection(line: Line, directionKey: string | null): LineDirection | null {
  if (!directionKey) {
    return null;
  }

  return getLineDirections(line).find((direction) => getDirectionKey(direction) === directionKey) ?? null;
}

export function getDirectionOptions(lines: Line[]): DirectionOption[] {
  const directionMap = new Map<string, DirectionOption>();

  lines.forEach((line) => {
    getLineDirections(line).forEach((direction) => {
      const key = getDirectionKey(direction);
      const existingDirection = directionMap.get(key);

      if (existingDirection) {
        directionMap.set(key, {
          ...existingDirection,
          lineCount: existingDirection.lineCount + 1
        });
        return;
      }

      directionMap.set(key, {
        key,
        name: direction.name,
        lineCount: 1
      });
    });
  });

  return [...directionMap.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "fr", { sensitivity: "base" })
  );
}
