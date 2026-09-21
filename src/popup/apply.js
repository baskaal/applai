import { PERSONALIZE } from "../shared/constants.js";
import { findStoredAnswer, inferCanonical, isCoverLetterField, isResumeField, questionKey } from "../shared/fields.js";
import { composeCoverLetter } from "./openai.js";
import { fillAssignments, getActiveTab, scanTab } from "./messaging.js";
import { getStore, saveAnswers } from "./storage.js";
import { inputForField } from "./form.js";

export function partition(fields, answers, resume, coverLetterText) {
  const known = [];
  const unknown = [];
  let resumeTargets = 0;
  let coverLetterTargets = 0;

  for (const field of fields) {
    if (field.fieldType === "file") {
      if (resume && isResumeField(field)) {
        known.push({ ...field, value: resume.name });
        resumeTargets += 1;
      }
      continue;
    }
    if (field.value) continue;
    if (coverLetterText && isCoverLetterField(field)) {
      known.push({ ...field, value: coverLetterText });
      coverLetterTargets += 1;
      continue;
    }
    const hit = findStoredAnswer(field, answers);
    if (hit && hit.key !== "cover_letter") known.push({ ...field, value: hit.answer.value, storageKey: hit.key });
    else unknown.push(field);
  }
  return { known, unknown, resumeTargets, coverLetterTargets };
}

export function renderPrompts(promptForm, fields) {
  promptForm.innerHTML = "";
  if (!fields.length) {
    promptForm.hidden = true;
    return;
  }
  promptForm.hidden = false;
  const intro = document.createElement("p");
  intro.className = "muted";
  intro.textContent = "New questions on this form. Save them to reuse later.";
  promptForm.appendChild(intro);

  fields.forEach((field) => {
    const wrap = document.createElement("div");
    wrap.className = "prompt-item";
    const label = document.createElement("label");
    label.textContent = field.label || field.name || "Untitled field";
    if (field.required) {
      const req = document.createElement("span");
      req.className = "req";
      req.textContent = " *";
      label.appendChild(req);
    }
    const input = inputForField(field);
    input.dataset.uid = field.uid;
    wrap.appendChild(label);
    wrap.appendChild(input);
    promptForm.appendChild(wrap);
  });

  const save = document.createElement("button");
  save.className = "apply-btn";
  save.type = "submit";
  save.textContent = "Save & fill remaining";
  promptForm.appendChild(save);
}

export function bindApply({ applyBtn, statusEl, promptForm, ensureContentScript, renderAnswers }) {
  let pendingUnknown = [];
  let activeTabId = null;

  function setStatus(text) {
    statusEl.textContent = text || "";
  }

  applyBtn.addEventListener("click", async () => {
    setStatus("");
    promptForm.hidden = true;
    pendingUnknown = [];
    applyBtn.disabled = true;
    applyBtn.textContent = "Scanning…";

    try {
      const tab = await getActiveTab();
      if (!tab?.id || !/^https?:/.test(tab.url || "")) {
        setStatus("Open a job application page (http or https), then try again.");
        return;
      }
      activeTabId = tab.id;
      await ensureContentScript(tab.id);
      const { fields, jobDescription } = await scanTab(tab.id);
      if (!fields.length) {
        setStatus(
          "No form fields found on this page. If the form is inside a login wall or unusual widget, open the actual application form first."
        );
        return;
      }

      const { answers, resume, coverLetter } = await getStore();
      let coverLetterText = (coverLetter || "").trim();
      let personalized = false;
      if (coverLetterText.includes(PERSONALIZE)) {
        applyBtn.textContent = "Personalizing…";
        const composed = await composeCoverLetter(jobDescription);
        coverLetterText = composed.text;
        personalized = composed.personalized;
      }

      const { known, unknown, resumeTargets, coverLetterTargets } = partition(fields, answers, resume, coverLetterText);
      const assignments = known.map((field) => ({
        uid: field.uid,
        frameId: field.frameId,
        value: field.value,
      }));
      const filled = assignments.length ? await fillAssignments(tab.id, assignments, resume) : 0;

      pendingUnknown = unknown;
      renderPrompts(promptForm, unknown);

      const bits = [`Found ${fields.length} fields.`, `Autofilled ${filled}.`];
      if (resumeTargets) bits.push(`Attached resume to ${resumeTargets} file field${resumeTargets === 1 ? "" : "s"}.`);
      else if (fields.some((f) => f.fieldType === "file") && !resume) bits.push("Upload a resume in this popup to attach it.");
      if (coverLetterTargets && personalized) bits.push("Filled the cover letter with a personalized paragraph.");
      else if (coverLetterTargets) bits.push("Filled the cover letter.");
      else if (coverLetterText && !fields.some(isCoverLetterField)) bits.push("No cover letter field was found on this form.");
      if (unknown.length) bits.push(`${unknown.length} new question${unknown.length === 1 ? "" : "s"} need your input.`);
      else bits.push("Everything we recognized was filled from saved answers.");
      setStatus(bits.join(" "));
    } catch (err) {
      setStatus(err?.message || "Could not scan this page.");
    } finally {
      applyBtn.disabled = false;
      applyBtn.textContent = "Apply";
    }
  });

  promptForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeTabId || !pendingUnknown.length) return;

    const { answers, resume } = await getStore();
    const assignments = [];
    const inputs = promptForm.querySelectorAll("input, textarea, select");

    pendingUnknown.forEach((field) => {
      const input = [...inputs].find((el) => el.dataset.uid === field.uid);
      const value = input?.value?.trim() || "";
      if (!value) return;
      const key = inferCanonical(field) || questionKey(field.label);
      if (key && key !== "cover_letter") {
        answers[key] = {
          key,
          label: field.label || field.name || key,
          value,
          fieldType: field.fieldType,
          updatedAt: Date.now(),
        };
      }
      assignments.push({ uid: field.uid, frameId: field.frameId, value });
    });

    await saveAnswers(answers);
    const filled = await fillAssignments(activeTabId, assignments, resume);
    pendingUnknown = [];
    renderPrompts(promptForm, []);
    setStatus(`Saved your answers and filled ${filled} remaining field${filled === 1 ? "" : "s"}.`);
    renderAnswers();
  });

  return { setStatus };
}
