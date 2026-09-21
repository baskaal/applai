import { EXAMPLE_AI_CONTEXT } from "../shared/constants.js";
import { getStore } from "./storage.js";

export function bindSettings({ openaiKeyEl, openaiPill, saveOpenaiKey, clearOpenaiKey, settingsStatus, aiContextEl, useAiExample, aiContextSaveState }) {
  let aiContextSaveTimer = null;

  async function renderSettings() {
    const { openaiApiKey, aiContext } = await getStore();
    openaiPill.textContent = openaiApiKey ? "Saved" : "Not saved";
    openaiKeyEl.value = "";
    openaiKeyEl.placeholder = openaiApiKey ? "Key saved — paste a new one to replace" : "sk-...";
    if (aiContextEl.value !== aiContext) aiContextEl.value = aiContext;
  }

  saveOpenaiKey.addEventListener("click", async () => {
    const key = openaiKeyEl.value.trim();
    if (!key) {
      settingsStatus.textContent = "Paste an API key first.";
      return;
    }
    await chrome.storage.local.set({ openaiApiKey: key });
    openaiKeyEl.value = "";
    settingsStatus.textContent = "API key saved in this browser.";
    await renderSettings();
  });

  clearOpenaiKey.addEventListener("click", async () => {
    await chrome.storage.local.set({ openaiApiKey: "" });
    openaiKeyEl.value = "";
    settingsStatus.textContent = "API key removed.";
    await renderSettings();
  });

  aiContextEl.addEventListener("input", () => {
    aiContextSaveState.textContent = "Saving…";
    clearTimeout(aiContextSaveTimer);
    aiContextSaveTimer = setTimeout(async () => {
      if (globalThis.chrome?.storage?.local) {
        await chrome.storage.local.set({ aiContext: aiContextEl.value });
      }
      aiContextSaveState.textContent = "Saved";
    }, 350);
  });

  useAiExample.addEventListener("click", () => {
    aiContextEl.value = EXAMPLE_AI_CONTEXT;
    aiContextEl.dispatchEvent(new Event("input"));
  });

  return { renderSettings };
}
