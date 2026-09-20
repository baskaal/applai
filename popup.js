const shared = globalThis.JobApplyShared;

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
const tabAnswers = document.getElementById("tab-answers");
const viewApply = document.getElementById("view-apply");
const viewAnswers = document.getElementById("view-answers");

let pendingUnknown = [];
let activeTabId = null;

function setStatus(text) {
  statusEl.textContent = text || "";
}

async function getStore() {
  if (!globalThis.chrome?.storage?.local) return { answers: {}, resume: null };
  const data = await chrome.storage.local.get({ answers: {}, resume: null });
  return { answers: data.answers || {}, resume: data.resume || null };
}

async function saveAnswers(answers) {
  await chrome.storage.local.set({ answers });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
    return;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["shared.js", "content.js"],
    });
    await chrome.scripting.insertCSS({
      target: { tabId, allFrames: true },
      files: ["content.css"],
    });
  }
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
  for (const { frameId, reply } of replies) {
    for (const field of reply.fields || []) {
      fields.push({ ...field, frameId });
    }
  }
  return fields;
}

function partition(fields, answers, resume) {
  const known = [];
  const unknown = [];
  let resumeTargets = 0;

  for (const field of fields) {
    if (field.fieldType === "file") {
      if (resume && shared.isResumeField(field)) {
        known.push({ ...field, value: resume.name });
        resumeTargets += 1;
      }
      continue;
    }
    if (field.value) continue;
    const hit = shared.findStoredAnswer(field, answers);
    if (hit) known.push({ ...field, value: hit.answer.value, storageKey: hit.key });
    else unknown.push(field);
  }
  return { known, unknown, resumeTargets };
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
    const fields = await scanTab(tab.id);
    if (!fields.length) {
      setStatus("No form fields found on this page. If the form is inside a login wall or unusual widget, open the actual application form first.");
      return;
    }

    const { answers, resume } = await getStore();
    const { known, unknown, resumeTargets } = partition(fields, answers, resume);

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
    if (key) {
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
  const entries = Object.values(answers).sort((a, b) => (a.label || "").localeCompare(b.label || ""));
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

function showView(name) {
  const apply = name === "apply";
  viewApply.hidden = !apply;
  viewAnswers.hidden = apply;
  tabApply.classList.toggle("is-active", apply);
  tabAnswers.classList.toggle("is-active", !apply);
  tabApply.setAttribute("aria-selected", String(apply));
  tabAnswers.setAttribute("aria-selected", String(!apply));
  if (!apply) renderAnswers();
}

applyBtn.addEventListener("click", apply);
tabApply.addEventListener("click", () => showView("apply"));
tabAnswers.addEventListener("click", () => showView("answers"));

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
