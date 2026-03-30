from __future__ import annotations

import csv
import hashlib
import json
import os
import sys
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

GTFS_PATH = Path(os.environ.get("TCL_GTFS_ZIP", "/tmp/lyon_tcl_gtfs.zip"))
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "src" / "mocks" / "tclBusCatalog.json"
BUS_ROUTE_TYPES = {"3", "11"}


@dataclass(frozen=True)
class TripRecord:
    route_id: str
    direction_id: str
    headsign: str


def iter_csv_rows(archive: zipfile.ZipFile, filename: str):
    with archive.open(filename) as handle:
        yield from csv.DictReader((line.decode("utf-8-sig") for line in handle))


def main() -> int:
    if not GTFS_PATH.exists():
        print(f"GTFS file not found: {GTFS_PATH}", file=sys.stderr)
        return 1

    with zipfile.ZipFile(GTFS_PATH) as archive:
        routes: dict[str, dict[str, str]] = {}

        for row in iter_csv_rows(archive, "routes.txt"):
            if row["route_type"] in BUS_ROUTE_TYPES:
                routes[row["route_id"]] = row

        trips: dict[str, TripRecord] = {}

        for row in iter_csv_rows(archive, "trips.txt"):
            route_id = row["route_id"]

            if route_id not in routes:
                continue

            trips[row["trip_id"]] = TripRecord(
                route_id=route_id,
                direction_id=row.get("direction_id", "0") or "0",
                headsign=row.get("trip_headsign", "").strip() or f"Direction {row.get('direction_id', '0') or '0'}",
            )

        trip_stop_sequences: dict[str, list[tuple[int, str]]] = defaultdict(list)

        for row in iter_csv_rows(archive, "stop_times.txt"):
            trip_id = row["trip_id"]

            if trip_id not in trips:
                continue

            trip_stop_sequences[trip_id].append((int(row["stop_sequence"]), row["stop_id"]))

        pattern_counter: Counter[tuple[str, str, str, tuple[str, ...]]] = Counter()
        direction_name_counter: Counter[tuple[str, str, str]] = Counter()
        used_stop_ids: set[str] = set()

        for trip_id, stop_entries in trip_stop_sequences.items():
            stop_entries.sort(key=lambda item: item[0])
            stop_ids = tuple(stop_id for _, stop_id in stop_entries)

            if len(stop_ids) < 2:
                continue

            trip = trips[trip_id]
            key = (trip.route_id, trip.direction_id, trip.headsign, stop_ids)
            pattern_counter[key] += 1
            direction_name_counter[(trip.route_id, trip.direction_id, trip.headsign)] += 1
            used_stop_ids.update(stop_ids)

        stops: dict[str, dict[str, object]] = {}

        for row in iter_csv_rows(archive, "stops.txt"):
            stop_id = row["stop_id"]

            if stop_id not in used_stop_ids:
                continue

            stops[stop_id] = {
                "id": stop_id,
                "name": row["stop_name"].strip(),
                "lat": float(row["stop_lat"]) if row.get("stop_lat") else None,
                "lon": float(row["stop_lon"]) if row.get("stop_lon") else None,
            }

        lines: list[dict[str, object]] = []
        patterns_by_route: dict[str, list[dict[str, object]]] = defaultdict(list)

        for (route_id, direction_id, headsign, stop_ids), trip_count in pattern_counter.items():
            pattern_signature = f"{headsign}|{';'.join(stop_ids)}"
            patterns_by_route[route_id].append(
                {
                    "id": f"{route_id}:{direction_id}:{hashlib.sha1(pattern_signature.encode('utf-8')).hexdigest()[:10]}",
                    "directionId": direction_id,
                    "directionName": headsign,
                    "headsign": headsign,
                    "tripCount": trip_count,
                    "stopIds": list(stop_ids),
                }
            )

        for route_id, route_row in sorted(routes.items(), key=lambda item: item[1]["route_short_name"]):
            route_patterns = patterns_by_route.get(route_id, [])

            if not route_patterns:
                continue

            directions = []
            seen_direction_ids: set[str] = set()

            for direction_id in sorted({pattern["directionId"] for pattern in route_patterns}):
                if direction_id in seen_direction_ids:
                    continue

                direction_name = max(
                    (
                        (count, headsign)
                        for (candidate_route_id, candidate_direction_id, headsign), count in direction_name_counter.items()
                        if candidate_route_id == route_id and candidate_direction_id == direction_id
                    ),
                    default=(0, f"Direction {direction_id}"),
                )[1]

                directions.append(
                    {
                        "id": direction_id,
                        "name": direction_name,
                    }
                )
                seen_direction_ids.add(direction_id)

            route_patterns.sort(
                key=lambda pattern: (
                    pattern["directionId"],
                    -int(pattern["tripCount"]),
                    -len(pattern["stopIds"]),
                    str(pattern["headsign"]),
                )
            )

            lines.append(
                {
                    "id": route_id,
                    "shortName": route_row["route_short_name"].strip(),
                    "longName": route_row["route_long_name"].strip(),
                    "color": f"#{route_row['route_color']}" if route_row.get("route_color") else None,
                    "textColor": f"#{route_row['route_text_color']}" if route_row.get("route_text_color") else None,
                    "directions": directions,
                    "patterns": route_patterns,
                }
            )

    catalog = {
        "source": {
            "type": "official_gtfs_snapshot",
            "label": "GTFS TCL officiel",
            "generatedFrom": str(GTFS_PATH),
        },
        "stops": sorted(stops.values(), key=lambda stop: (str(stop["name"]).lower(), str(stop["id"]))),
        "lines": lines,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {OUTPUT_PATH}")
    print(f"Stops: {len(catalog['stops'])}")
    print(f"Lines: {len(catalog['lines'])}")
    print(f"Patterns: {sum(len(line['patterns']) for line in catalog['lines'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
