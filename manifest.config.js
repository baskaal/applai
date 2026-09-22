import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "applybot",
  version: "1.2.0",
  description:
    "Scan job application forms, save your answers, and autofill them the next time — including your resume.",
  action: {
    default_title: "applybot",
    default_popup: "src/popup.html",
    default_icon: {
      16: "icons/icon16.png",
      32: "icons/icon32.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    },
  },
  icons: {
    16: "icons/icon16.png",
    32: "icons/icon32.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  },
  permissions: ["storage", "activeTab", "scripting", "tabs", "webNavigation", "unlimitedStorage"],
  host_permissions: ["http://*/*", "https://*/*"],
  background: {
    service_worker: "src/background/index.js",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content/index.js"],
      all_frames: true,
      run_at: "document_idle",
    },
  ],
});
