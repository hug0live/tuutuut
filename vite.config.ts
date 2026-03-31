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

function normalizeProxyPath(value: string | undefined): string {
  if (!value) {
    return "/api/tcl/realtime";
  }

  if (value.charAt(0) === "/") {
    return value;
  }

  return `/${value}`;
}

function buildProxyRewrite(path: string, endpoint: URL, requestorRef?: string): string {
  const incomingUrl = new URL(path, "http://localhost");
  const mergedParams = new URLSearchParams(endpoint.search);

  incomingUrl.searchParams.forEach((value, key) => {
    mergedParams.set(key, value);
  });

  if (requestorRef && !mergedParams.has("RequestorRef")) {
    mergedParams.set("RequestorRef", requestorRef);
  }

  const query = mergedParams.toString();
  return `${endpoint.pathname}${query ? `?${query}` : ""}`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, new URL(".", import.meta.url).pathname, "");
  const realtimeUrl = env.TCL_REALTIME_URL?.trim();
  const realtimeAuthHeader = env.TCL_REALTIME_AUTH_HEADER?.trim();
  const realtimeRequestorRef = env.TCL_REALTIME_REQUESTOR_REF?.trim();
  const realtimeProxyPath = normalizeProxyPath(env.VITE_TCL_REALTIME_PROXY_PATH);

  return {
    base: resolveBasePath(env),
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      ...(realtimeUrl
        ? {
            proxy: {
              [realtimeProxyPath]: {
                target: new URL(realtimeUrl).origin,
                changeOrigin: true,
                headers: realtimeAuthHeader
                  ? {
                      Authorization: realtimeAuthHeader
                    }
                  : undefined,
                rewrite: (path) =>
                  buildProxyRewrite(path, new URL(realtimeUrl), realtimeRequestorRef)
              }
            }
          }
        : {})
    }
  };
});
