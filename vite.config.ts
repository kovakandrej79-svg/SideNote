import { crx } from "@crxjs/vite-plugin";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
  build: {
    target: "esnext",
    // content script 里的 CSS 通过 ?inline 注入 Shadow DOM，不需要额外拆分
    cssCodeSplit: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
});
