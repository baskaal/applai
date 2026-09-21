const shared = globalThis.JobApplyShared;
const PERSONALIZE = "{{personalize}}";
const EXAMPLE_AI_CONTEXT = `Write 2–3 short sentences. Be direct.
Name one specific thing from the job (a product, problem, or skill) and say why it fits me.
No generic praise, no buzzwords, no “I am passionate.” Plain language.`;

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

let pendingUnknown = [];
let activeTabId = null;
let coverSaveTimer = null;
let aiContextSaveTimer = null;

function setStatus(text) {
  statusEl.textContent = text || "";
}

async function getStore() {
  if (!globalThis.chrome?.storage?.local) {
    return { answers: {}, resume: null, coverLetter: "", openaiApiKey: "", aiContext: "" };
  }
  const data = await chrome.storage.local.get({
    answers: {},
    resume: null,
    coverLetter: "",
    openaiApiKey: "",
    aiContext: "",
  });
  return {
    answers: data.answers || {},
    resume: data.resume || null,
    coverLetter: data.coverLetter || "",
    openaiApiKey: data.openaiApiKey || "",
    aiContext: data.aiContext || "",
  };
}

async function saveAnswers(answers) {
  await chrome.storage.local.set({ answers });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const SCRIPT_VERSION = 4;

async function ensureContentScript(tabId) {
  const replies = await messageFrames(tabId, { type: "PING" });
  const current = replies.length > 0 && replies.every((item) => item.reply?.version === SCRIPT_VERSION);
  if (current) return;
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["shared.js", "content.js"],
  });
  await chrome.scripting.insertCSS({
    target: { tabId, allFrames: true },
    files: ["content.css"],
  });
}

async function messageFrames(tabId, message) {
  let frames = [{ frameId: 0 }];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId })) || frames;
  } catch {
    /* main frame only */
  }
  const replies = [];
  for (const frame of frames) {
    try {
      const reply = await chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId });
      if (reply) replies.push({ frameId: frame.frameId, reply });
    } catch {
      /* frame without the content script */
    }
  }
  return replies;
}

function fileToStore(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1] || "";
      resolve({
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        lastModified: file.lastModified,
        base64,
      });
    };
    reader.readAsDataURL(file);
  });
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isCoverLetterField(field) {
  return shared.isCoverLetterField(field);
}

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

async function renderSettings() {
  const { openaiApiKey, aiContext } = await getStore();
  openaiPill.textContent = openaiApiKey ? "Saved" : "Not saved";
  openaiKeyEl.value = "";
  openaiKeyEl.placeholder = openaiApiKey ? "Key saved — paste a new one to replace" : "sk-...";
  if (aiContextEl.value !== aiContext) aiContextEl.value = aiContext;
}

async function renderCoverLetter() {
  const { coverLetter } = await getStore();
  if (coverLetterEl.value !== coverLetter) coverLetterEl.value = coverLetter;
}

function inputForField(field, value = "") {
  if (field.fieldType === "textarea" || field.fieldType === "cover_letter") {
    const el = document.createElement("textarea");
    el.value = value;
    return el;
  }
  if (field.fieldType === "select" || field.fieldType === "radio") {
    const el = document.createElement("select");
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Choose…";
    el.appendChild(blank);
    (field.options || []).forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.value || opt.text;
      o.textContent = opt.text || opt.value;
      if (String(value) === o.value) o.selected = true;
      el.appendChild(o);
    });
    return el;
  }
  if (field.fieldType === "checkbox") {
    const el = document.createElement("select");
    [
      ["", "Choose…"],
      ["yes", "Yes"],
      ["no", "No"],
    ].forEach(([v, t]) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      if (String(value) === v) o.selected = true;
      el.appendChild(o);
    });
    return el;
  }
  const el = document.createElement("input");
  el.type = ["email", "tel", "url", "date", "number"].includes(field.fieldType) ? field.fieldType : "text";
  el.value = value;
  return el;
}

function renderPrompts(fields) {
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

async function fillAssignments(tabId, assignments, resume) {
  const byFrame = new Map();
  for (const item of assignments) {
    const list = byFrame.get(item.frameId) || [];
    list.push(item);
    byFrame.set(item.frameId, list);
  }
  let filled = 0;
  for (const [frameId, list] of byFrame) {
    try {
      const result = await chrome.tabs.sendMessage(
        tabId,
        { type: "FILL", assignments: list, resume },
        { frameId }
      );
      filled += result?.filled || 0;
    } catch {
      /* frame gone */
    }
  }
  return filled;
}

async function scanTab(tabId) {
  const replies = await messageFrames(tabId, { type: "SCAN" });
  const fields = [];
  let jobDescription = "";
  let bestScore = -Infinity;
  for (const { frameId, reply } of replies) {
    for (const field of reply.fields || []) {
      fields.push({ ...field, frameId });
    }
    const desc = reply.jobDescription || "";
    const score = shared.scoreJobDescription(desc);
    if (score > bestScore) {
      bestScore = score;
      jobDescription = desc;
    }
  }
  return { fields, jobDescription };
}

function partition(fields, answers, resume, coverLetterText) {
  const known = [];
  const unknown = [];
  let resumeTargets = 0;
  let coverLetterTargets = 0;

  for (const field of fields) {
    if (field.fieldType === "file") {
      if (resume && shared.isResumeField(field)) {
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
    const hit = shared.findStoredAnswer(field, answers);
    if (hit && hit.key !== "cover_letter") known.push({ ...field, value: hit.answer.value, storageKey: hit.key });
    else unknown.push(field);
  }
  return { known, unknown, resumeTargets, coverLetterTargets };
}

async function generatePersonalizedParagraph(apiKey, jobDescription, letter, aiContext) {
  if (!apiKey) {
    throw new Error("Add your OpenAI API key in Settings first.");
  }
  if (!jobDescription || jobDescription.trim().length < 40) {
    throw new Error("Could not find a job description on this page.");
  }

  const contextBlock = (aiContext || "").trim()
    ? `\n\nWRITING INSTRUCTIONS FROM THE APPLICANT:\n${aiContext.trim()}`
    : "";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 280,
      messages: [
        {
          role: "system",
          content:
            "Write one short cover-letter paragraph tailored to the job description. Sound like the same person as the rest of the letter. Follow the applicant's writing instructions when they are provided. No greeting, sign-off, title, or quotation marks. Return only the paragraph.",
        },
        {
          role: "user",
          content: `JOB DESCRIPTION:\n${jobDescription.slice(0, 8000)}\n\nCOVER LETTER DRAFT (the placeholder marks where this paragraph will go):\n${letter.replaceAll(PERSONALIZE, "[personalized paragraph]")}${contextBlock}`,
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI request failed (${response.status})`);
  }
  const paragraph = payload.choices?.[0]?.message?.content?.trim() || "";
  if (!paragraph) throw new Error("OpenAI returned an empty paragraph.");
  return paragraph.replace(/^["“]|["”]$/g, "");
}

async function composeCoverLetter(jobDescription) {
  const { coverLetter, openaiApiKey, aiContext } = await getStore();
  const letter = (coverLetter || "").trim();
  if (!letter) return { text: "", personalized: false };
  if (!letter.includes(PERSONALIZE)) return { text: letter, personalized: false };
  const paragraph = await generatePersonalizedParagraph(openaiApiKey, jobDescription, letter, aiContext);
  return { text: letter.replaceAll(PERSONALIZE, paragraph), personalized: true };
}

async function apply() {
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
      setStatus("No form fields found on this page. If the form is inside a login wall or unusual widget, open the actual application form first.");
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

    const { known, unknown, resumeTargets, coverLetterTargets } = partition(
      fields,
      answers,
      resume,
      coverLetterText
    );

    const assignments = known.map((field) => ({
      uid: field.uid,
      frameId: field.frameId,
      value: field.value,
    }));
    const filled = assignments.length ? await fillAssignments(tab.id, assignments, resume) : 0;

    pendingUnknown = unknown;
    renderPrompts(unknown);

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
}

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
    const key = shared.inferCanonical(field) || shared.questionKey(field.label);
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
  renderPrompts([]);
  setStatus(`Saved your answers and filled ${filled} remaining field${filled === 1 ? "" : "s"}.`);
  renderAnswers();
});

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
    card.className = "answer-card";
    const title = document.createElement("h3");
    title.textContent = answer.label || answer.key;
    const input = inputForField({ fieldType: answer.fieldType || "text" }, answer.value);
    const row = document.createElement("div");
    row.className = "row";
    const save = document.createElement("button");
    save.className = "save-btn";
    save.type = "button";
    save.textContent = "Save";
    const del = document.createElement("button");
    del.className = "delete-btn";
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

function setMenuOpen(open) {
  appMenu.hidden = !open;
  menuBtn.classList.toggle("is-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}

function showView(name) {
  Object.entries(views).forEach(([key, { tab, view }]) => {
    const active = key === name;
    view.hidden = !active;
    tab.classList.toggle("is-active", active);
  });
  currentViewEl.textContent = viewLabels[name] || name;
  setMenuOpen(false);
  if (name === "input") {
    renderCoverLetter();
    renderResume();
    renderAnswers();
  }
  if (name === "settings") renderSettings();
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
  coverLetterEl.value = `${coverLetterEl.value.slice(0, start)}${PERSONALIZE}${coverLetterEl.value.slice(end)}`;
  coverLetterEl.focus();
  const cursor = start + PERSONALIZE.length;
  coverLetterEl.setSelectionRange(cursor, cursor);
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
    coverStatus.textContent = filled
      ? "Filled the cover letter on this page."
      : "Found the field but could not fill it.";
  } catch (err) {
    coverStatus.textContent = err?.message || "Could not test the cover letter.";
  } finally {
    testCoverBtn.disabled = false;
    testCoverBtn.textContent = "Test";
  }
});

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

applyBtn.addEventListener("click", apply);
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

renderResume();
renderAnswers();
renderCoverLetter();
renderSettings();
