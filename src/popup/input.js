import { PERSONALIZE_CLOSE, PERSONALIZE_OPEN } from "../shared/constants.js";
import { isCoverLetterField } from "../shared/fields.js";
import { composeCoverLetter } from "./openai.js";
import { fillAssignments, getActiveTab, scanTab } from "./messaging.js";
import { fileToStore, formatBytes, getStore, saveAnswers } from "./storage.js";
import { answerCard, answerRow, answerTitle, deleteButton, linkButton } from "./classes.js";
import { inputForField } from "./form.js";

export function bindInput({
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
}) {
  let coverSaveTimer = null;

  async function renderResume() {
    const { resume } = await getStore();
    if (!resume) {
      resumePill.textContent = "Not uploaded";
      resumeMeta.textContent = "";
      resumeRemove.hidden = true;
      return;
    }
    resumePill.textContent = "Ready";
    resumeMeta.textContent = `${resume.name} · ${formatBytes(resume.size || 0)}`;
    resumeRemove.hidden = false;
  }

  async function renderCoverLetter() {
    const { coverLetter } = await getStore();
    if (coverLetterEl.value !== coverLetter) coverLetterEl.value = coverLetter;
  }

  async function renderAnswers() {
    const { answers } = await getStore();
    const entries = Object.values(answers)
      .filter((answer) => answer.key !== "cover_letter")
      .sort((a, b) => (a.label || "").localeCompare(b.label || ""));
    answersList.innerHTML = "";
    answersEmpty.hidden = entries.length > 0;
    if (!entries.length) return;

    for (const answer of entries) {
      const card = document.createElement("article");
      card.className = answerCard;
      const title = document.createElement("h3");
      title.className = answerTitle;
      title.textContent = answer.label || answer.key;
      const input = inputForField({ fieldType: answer.fieldType || "text" }, answer.value);
      const row = document.createElement("div");
      row.className = answerRow;
      const save = document.createElement("button");
      save.className = linkButton;
      save.type = "button";
      save.textContent = "Save";
      const del = document.createElement("button");
      del.className = deleteButton;
      del.type = "button";
      del.textContent = "Delete";

      save.addEventListener("click", async () => {
        const store = await getStore();
        store.answers[answer.key] = {
          ...answer,
          value: input.value,
          updatedAt: Date.now(),
        };
        await saveAnswers(store.answers);
        setStatus("Answer updated.");
      });
      del.addEventListener("click", async () => {
        const store = await getStore();
        delete store.answers[answer.key];
        await saveAnswers(store.answers);
        renderAnswers();
      });

      row.append(save, del);
      card.append(title, input, row);
      answersList.appendChild(card);
    }
  }

  coverLetterEl.addEventListener("input", () => {
    coverSaveState.textContent = "Saving…";
    clearTimeout(coverSaveTimer);
    coverSaveTimer = setTimeout(async () => {
      if (globalThis.chrome?.storage?.local) {
        await chrome.storage.local.set({ coverLetter: coverLetterEl.value });
      }
      coverSaveState.textContent = "Saved";
    }, 350);
  });

  insertPersonalize.addEventListener("click", () => {
    const start = coverLetterEl.selectionStart ?? coverLetterEl.value.length;
    const end = coverLetterEl.selectionEnd ?? start;
    const selected = coverLetterEl.value.slice(start, end);
    coverLetterEl.value = `${coverLetterEl.value.slice(0, start)}${PERSONALIZE_OPEN}${selected}${PERSONALIZE_CLOSE}${coverLetterEl.value.slice(end)}`;
    coverLetterEl.focus();
    if (selected) {
      const cursor = start + PERSONALIZE_OPEN.length + selected.length + PERSONALIZE_CLOSE.length;
      coverLetterEl.setSelectionRange(cursor, cursor);
    } else {
      const cursor = start + PERSONALIZE_OPEN.length;
      coverLetterEl.setSelectionRange(cursor, cursor);
    }
    coverLetterEl.dispatchEvent(new Event("input"));
  });

  testCoverBtn.addEventListener("click", async () => {
    coverStatus.textContent = "";
    testCoverBtn.disabled = true;
    testCoverBtn.textContent = "Testing…";
    try {
      if (globalThis.chrome?.storage?.local) {
        await chrome.storage.local.set({ coverLetter: coverLetterEl.value });
      }
      const tab = await getActiveTab();
      if (!tab?.id || !/^https?:/.test(tab.url || "")) {
        throw new Error("Open a job page in this tab first.");
      }
      await ensureContentScript(tab.id);
      const { fields, jobDescription } = await scanTab(tab.id);
      const composed = await composeCoverLetter(jobDescription);
      if (!composed.text) throw new Error("Write a cover letter first.");
      const targets = fields.filter((field) => isCoverLetterField(field));
      if (!targets.length) throw new Error("No cover letter field found on this page.");
      const assignments = targets.map((field) => ({
        uid: field.uid,
        frameId: field.frameId,
        value: composed.text,
      }));
      const filled = await fillAssignments(tab.id, assignments, null);
      coverStatus.textContent = filled ? "Filled the cover letter on this page." : "Found the field but could not fill it.";
    } catch (err) {
      coverStatus.textContent = err?.message || "Could not test the cover letter.";
    } finally {
      testCoverBtn.disabled = false;
      testCoverBtn.textContent = "Test";
    }
  });

  resumeInput.addEventListener("change", async () => {
    const file = resumeInput.files?.[0];
    resumeInput.value = "";
    if (!file) return;
    const resume = await fileToStore(file);
    await chrome.storage.local.set({ resume });
    await renderResume();
    setStatus("Resume saved in this browser.");
  });

  resumeRemove.addEventListener("click", async () => {
    await chrome.storage.local.set({ resume: null });
    await renderResume();
    setStatus("Resume removed.");
  });

  return { renderResume, renderCoverLetter, renderAnswers };
}
