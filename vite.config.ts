import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

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
