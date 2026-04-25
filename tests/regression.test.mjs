import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url);

async function readProjectFile(path) {
  return readFile(join(repoRoot.pathname, path), "utf8");
}

function extractObjectLiteral(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Expected to find ${marker}`);

  const startIndex = source.indexOf("{", markerIndex);
  assert.notEqual(startIndex, -1, `Expected ${marker} to start an object literal`);

  let depth = 0;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }

    if (depth === 0) {
      return source.slice(startIndex, index + 1);
    }
  }

  assert.fail(`Expected ${marker} object literal to close`);
}

test("every configured city declares bus-tracker as its realtime provider", async () => {
  const citiesSource = await readProjectFile("src/config/cities.ts");
  const cityEntries = [...citiesSource.matchAll(/realtimeProvider:\s*([a-zA-Z0-9]+)RealtimeConfig\.provider/g)];

  assert.ok(cityEntries.length >= 2, "Expected every supported city to declare a realtimeProvider");

  for (const [, configName] of cityEntries) {
    const configObject = extractObjectLiteral(citiesSource, `const ${configName}RealtimeConfig =`);
    assert.match(configObject, /provider:\s*"bus-tracker"/, `${configName} should use bus-tracker`);
    assert.match(configObject, /networkId:\s*\d+/, `${configName} should declare a bus-tracker networkId`);
  }
});

test("bus-tracker identifiers live in centralized city configuration", async () => {
  const [citiesSource, tclAdapterSource, t2cAdapterSource] = await Promise.all([
    readProjectFile("src/config/cities.ts"),
    readProjectFile("src/services/api/adapters/tclAdapter.ts"),
    readProjectFile("src/services/api/adapters/t2cAdapter.ts")
  ]);

  assert.match(citiesSource, /const lyonRealtimeConfig = \{[\s\S]*networkId:\s*91/, "Lyon should configure Bus Tracker network 91");
  assert.match(
    citiesSource,
    /const clermontFerrandRealtimeConfig = \{[\s\S]*networkId:\s*101/,
    "Clermont-Ferrand should configure Bus Tracker network 101"
  );
  assert.doesNotMatch(tclAdapterSource, /networkId:\s*91|busTrackerNetworkId/, "TCL adapter should not hard-code Bus Tracker IDs");
  assert.doesNotMatch(t2cAdapterSource, /networkId:\s*101|busTrackerNetworkId/, "T2C adapter should not hard-code Bus Tracker IDs");
});

test("city adapters delegate realtime work to the shared realtime service", async () => {
  const adapterPaths = [
    "src/services/api/adapters/tclAdapter.ts",
    "src/services/api/adapters/t2cAdapter.ts"
  ];

  for (const adapterPath of adapterPaths) {
    const source = await readProjectFile(adapterPath);

    assert.match(source, /realtimeService\.getVehicles\(/, `${adapterPath} should delegate vehicle lookup`);
    assert.match(source, /realtimeService\.getPassages\(/, `${adapterPath} should delegate realtime passage estimation`);
    assert.doesNotMatch(source, /fetchBusTracker|online-vehicles|\/api\/bus-tracker/, `${adapterPath} should not fetch Bus Tracker directly`);
    assert.doesNotMatch(source, /buildRealtimePassageFromVehicle/, `${adapterPath} should not compute provider passages directly`);
  }
});

test("bus-tracker provider owns provider-specific fetching and normalization safeguards", async () => {
  const source = await readProjectFile("src/services/realtime/busTrackerProvider.ts");

  assert.match(source, /id:\s*"bus-tracker"/, "Provider should identify itself as bus-tracker");
  assert.match(source, /online-vehicles/, "Provider should fetch Bus Tracker vehicle positions");
  assert.match(source, /getVehicles\(request: RealtimeProviderRequest\)/, "Provider should expose normalized vehicles");
  assert.match(source, /getPassages\(request: RealtimeProviderPassageRequest\)/, "Provider should expose normalized waiting times");
  assert.match(source, /maxVehicleAgeMs/, "Provider should guard against stale vehicle data");
  assert.match(source, /return null;/, "Provider should safely drop incomplete records");
  assert.match(source, /catch \(error\)/, "Provider should fail gracefully when Bus Tracker is unavailable");
});

test("realtime provider interface requires vehicles and passages", async () => {
  const source = await readProjectFile("src/services/realtime/types.ts");

  assert.match(source, /export type RealtimeProviderId = "bus-tracker"/);
  assert.match(source, /export type CityRealtimeConfig = BusTrackerRealtimeConfig/);
  assert.match(source, /getVehicles\(request: RealtimeProviderRequest\): Promise<VehiclePosition\[\]>/);
  assert.match(source, /getPassages\(request: RealtimeProviderPassageRequest\): Promise<RealtimePassage\[\]>/);
});
