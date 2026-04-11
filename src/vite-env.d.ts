/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_PATH?: string;
  readonly VITE_BUS_TRACKER_PROXY_PATH?: string;
  readonly VITE_DATA_SOURCE?: "mock" | "tcl";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
