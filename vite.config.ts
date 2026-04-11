import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function getProcessEnv(): Record<string, string | undefined> {
  const processValue =
    typeof globalThis === "object"
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      : undefined;

  return processValue?.env ?? {};
}

function normalizeBasePath(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const withLeadingSlash = trimmedValue.charAt(0) === "/" ? trimmedValue : `/${trimmedValue}`;
  return withLeadingSlash.slice(-1) === "/" ? withLeadingSlash : `${withLeadingSlash}/`;
}

function resolveBasePath(env: Record<string, string>): string {
  const processEnv = getProcessEnv();
  const configuredBasePath = normalizeBasePath(processEnv.VITE_BASE_PATH ?? env.VITE_BASE_PATH);

  if (configuredBasePath) {
    return configuredBasePath;
  }

  const githubActions = processEnv.GITHUB_ACTIONS ?? env.GITHUB_ACTIONS;
  const repositorySlug = (processEnv.GITHUB_REPOSITORY ?? env.GITHUB_REPOSITORY)?.trim();

  if (githubActions === "true" && repositorySlug && repositorySlug.indexOf("/") !== -1) {
    const repositoryName = repositorySlug.split("/", 2)[1];
    return normalizeBasePath(repositoryName) ?? "/";
  }

  return "/";
}

function normalizeBusTrackerProxyPath(value: string | undefined): string {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return "/api/bus-tracker";
  }

  return trimmedValue.charAt(0) === "/" ? trimmedValue : `/${trimmedValue}`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, new URL(".", import.meta.url).pathname, "");
  const busTrackerProxyPath = normalizeBusTrackerProxyPath(env.VITE_BUS_TRACKER_PROXY_PATH);

  return {
    base: resolveBasePath(env),
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        [busTrackerProxyPath]: {
          target: "https://bus-tracker.fr",
          changeOrigin: true,
          rewrite: (path) => path.replace(new RegExp(`^${busTrackerProxyPath}`), "/api")
        }
      }
    }
  };
});
