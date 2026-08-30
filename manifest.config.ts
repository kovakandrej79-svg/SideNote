import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "划词旁注 · Sidenote",
  version: pkg.version,
  description: pkg.description,

  // 最小权限：storage 存 API Key，activeTab 用于点击图标打开设置
  permissions: ["storage"],
  host_permissions: ["https://api.deepseek.com/*"],

  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },

  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content/index.tsx"],
      run_at: "document_idle",
      all_frames: false, // iframe 内暂不支持
    },
  ],

  options_page: "src/options/index.html",

  icons: {
    16: "icons/icon16.png",
    32: "icons/icon32.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  },

  action: {
    default_title: "划词旁注 设置",
    default_icon: {
      16: "icons/icon16.png",
      32: "icons/icon32.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    },
  },
});
