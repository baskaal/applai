import "../styles/content.css";
import { SCRIPT_VERSION } from "../shared/constants.js";
import { fill } from "./fill.js";
import { scan } from "./scan.js";

function handleMessage(message, _sender, sendResponse) {
  if (message?.type === "PING") {
    sendResponse({ ok: true, version: SCRIPT_VERSION });
    return;
  }
  if (message?.type === "SCAN") {
    sendResponse(scan());
    return;
  }
  if (message?.type === "FILL") {
    sendResponse(fill(message.assignments || [], message.resume || null));
  }
}

globalThis.__applybotHandle = handleMessage;
if (!globalThis.__applybotListener) {
  globalThis.__applybotListener = true;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    return globalThis.__applybotHandle(message, sender, sendResponse);
  });
}
