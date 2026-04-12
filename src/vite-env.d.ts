/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_PATH?: string;
  readonly VITE_BUS_TRACKER_PROXY_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
