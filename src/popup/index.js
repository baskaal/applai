import "../styles/popup.css";
import { bindApply } from "./apply.js";
import { menuButton, menuButtonOpen, menuItem, menuItemActive } from "./classes.js";
import { bindInput } from "./input.js";
import { ensureContentScript } from "./messaging.js";
import { bindSettings } from "./settings.js";

const applyBtn = document.getElementById("apply-btn");
const statusEl = document.getElementById("status");
const promptForm = document.getElementById("prompt-form");
const resumeInput = document.getElementById("resume-input");
const resumeMeta = document.getElementById("resume-meta");
const resumePill = document.getElementById("resume-pill");
const resumeRemove = document.getElementById("resume-remove");
const answersList = document.getElementById("answers-list");
const answersEmpty = document.getElementById("answers-empty");
const tabApply = document.getElementById("tab-apply");
const tabInput = document.getElementById("tab-input");
const tabSettings = document.getElementById("tab-settings");
const viewApply = document.getElementById("view-apply");
const viewInput = document.getElementById("view-input");
const viewSettings = document.getElementById("view-settings");
const coverLetterEl = document.getElementById("cover-letter");
const coverSaveState = document.getElementById("cover-save-state");
const insertPersonalize = document.getElementById("insert-personalize");
const testCoverBtn = document.getElementById("test-cover");
const coverStatus = document.getElementById("cover-status");
const openaiKeyEl = document.getElementById("openai-key");
const openaiPill = document.getElementById("openai-pill");
const saveOpenaiKey = document.getElementById("save-openai-key");
const clearOpenaiKey = document.getElementById("clear-openai-key");
const settingsStatus = document.getElementById("settings-status");
const aiContextEl = document.getElementById("ai-context");
const useAiExample = document.getElementById("use-ai-example");
const aiContextSaveState = document.getElementById("ai-context-save-state");
const menuBtn = document.getElementById("menu-btn");
const appMenu = document.getElementById("app-menu");
const currentViewEl = document.getElementById("current-view");

const viewLabels = {
  apply: "Apply",
  input: "Input",
  settings: "Settings",
};
const views = {
  apply: { tab: tabApply, view: viewApply },
  input: { tab: tabInput, view: viewInput },
  settings: { tab: tabSettings, view: viewSettings },
};

const { setStatus } = bindApply({
  applyBtn,
  statusEl,
  promptForm,
  ensureContentScript,
  renderAnswers: () => input.renderAnswers(),
});

const input = bindInput({
  resumeInput,
  resumeMeta,
  resumePill,
  resumeRemove,
  answersList,
  answersEmpty,
  coverLetterEl,
  coverSaveState,
  insertPersonalize,
  testCoverBtn,
  coverStatus,
  ensureContentScript,
  setStatus,
});

const { renderSettings } = bindSettings({
  openaiKeyEl,
  openaiPill,
  saveOpenaiKey,
  clearOpenaiKey,
  settingsStatus,
  aiContextEl,
  useAiExample,
  aiContextSaveState,
});

function setMenuOpen(open) {
  appMenu.hidden = !open;
  menuBtn.className = open ? `${menuButton} ${menuButtonOpen}` : menuButton;
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}

function showView(name) {
  Object.entries(views).forEach(([key, { tab, view }]) => {
    const active = key === name;
    view.hidden = !active;
    tab.className = active ? `${menuItem} ${menuItemActive}` : menuItem;
  });
  currentViewEl.textContent = viewLabels[name] || name;
  setMenuOpen(false);
  if (name === "input") {
    input.renderCoverLetter();
    input.renderResume();
    input.renderAnswers();
  }
  if (name === "settings") renderSettings();
}

menuBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  setMenuOpen(appMenu.hidden);
});
document.addEventListener("click", (event) => {
  if (!appMenu.hidden && !appMenu.contains(event.target) && event.target !== menuBtn) {
    setMenuOpen(false);
  }
});
tabApply.addEventListener("click", () => showView("apply"));
tabInput.addEventListener("click", () => showView("input"));
tabSettings.addEventListener("click", () => showView("settings"));

input.renderResume();
input.renderAnswers();
input.renderCoverLetter();
renderSettings();
