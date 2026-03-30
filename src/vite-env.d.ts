/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: "mock" | "tcl";
  readonly VITE_TCL_REALTIME_PROXY_PATH?: string;
  readonly VITE_TCL_REALTIME_PROVIDER?: "bus-tracker" | "official";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
