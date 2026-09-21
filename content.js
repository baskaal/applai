(function () {
  const shared = globalThis.JobApplyShared;
  const fieldMap = new Map();

  function visible(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.disabled) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getLabel(el) {
    if (el.labels && el.labels.length) {
      const text = Array.from(el.labels)
        .map((l) => l.innerText)
        .join(" ")
        .trim();
      if (text) return text.replace(/\s+/g, " ");
    }
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.innerText || "")
        .join(" ")
        .trim();
      if (text) return text.replace(/\s+/g, " ");
    }
    const describedBy = el.getAttribute("aria-describedby");
    if (describedBy) {
      const text = describedBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.innerText || "")
        .join(" ")
        .trim();
      if (text) return text.replace(/\s+/g, " ");
    }
    const wrapping = el.closest("label");
    if (wrapping) {
      const clone = wrapping.cloneNode(true);
      clone.querySelectorAll("input, select, textarea").forEach((n) => n.remove());
      const text = clone.innerText.trim();
      if (text) return text.replace(/\s+/g, " ");
    }
    const group = el.closest("div, li, td, fieldset, p");
    const nearby = group?.querySelector("label, legend, .label, [class*='label']");
    if (nearby && nearby !== el && !nearby.contains(el)) {
      const text = nearby.innerText.trim();
      if (text && text.length < 180) return text.replace(/\s+/g, " ");
    }
    const above = labelAbove(el);
    if (above) return above;
    return (el.placeholder || el.name || el.id || "").trim();
  }

  function labelAbove(el) {
    let node = el;
    for (let depth = 0; depth < 6 && node; depth += 1) {
      let prev = node.previousElementSibling;
      while (prev) {
        if (!prev.matches("input, textarea, select, button") && !prev.querySelector("input, textarea, select, [contenteditable='true']")) {
          const text = (prev.innerText || "").replace(/\s+/g, " ").trim();
          if (text && text.length >= 8 && text.length < 180) return text;
        }
        prev = prev.previousElementSibling;
      }
      node = node.parentElement;
    }
    return "";
  }

  function currentValue(el) {
    if (el.type === "checkbox") return el.checked ? "yes" : "";
    if (el.type === "radio") return el.checked ? el.value || "yes" : "";
    if (el.type === "file") return el.files?.[0]?.name || "";
    if (el.isContentEditable) return (el.innerText || "").trim();
    return el.value || "";
  }

  function describeField(el, index) {
    const tag = el.tagName.toLowerCase();
    const inputType = (el.type || tag).toLowerCase();
    let fieldType = "text";
    if (el.isContentEditable) fieldType = "textarea";
    else if (tag === "select") fieldType = "select";
    else if (tag === "textarea") fieldType = "textarea";
    else if (inputType === "file") fieldType = "file";
    else if (inputType === "checkbox") fieldType = "checkbox";
    else if (inputType === "radio") fieldType = "radio";
    else if (["email", "tel", "url", "date", "number", "month"].includes(inputType)) fieldType = inputType;
    else fieldType = "text";

    const uid = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
    fieldMap.set(uid, el);

    const options =
      tag === "select"
        ? Array.from(el.options)
            .filter((o) => o.value || o.text)
            .map((o) => ({ value: o.value, text: o.text.trim() }))
        : el.type === "radio"
          ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)).map((r) => ({
              value: r.value,
              text: getLabel(r),
            }))
          : [];

    return {
      uid,
      fieldType,
      inputType,
      label: getLabel(el),
      name: el.name || "",
      id: el.id || "",
      placeholder: el.placeholder || "",
      autocomplete: el.autocomplete || el.getAttribute("autocomplete") || "",
      accept: el.accept || "",
      required: Boolean(el.required),
      value: currentValue(el),
      options,
    };
  }

  const SCRIPT_VERSION = 4;

  function extractJobDescription() {
    const headingRe = /^(about the job|full job description|job description|about the role)$/i;
    const headingNodes = document.querySelectorAll("h1, h2, h3, h4, h5, h6, p, span, strong, div");
    for (const node of headingNodes) {
      if (node.children.length > 4) continue;
      const heading = (node.innerText || "").replace(/\s+/g, " ").trim();
      if (!headingRe.test(heading)) continue;
      let scope = node.parentElement;
      for (let i = 0; i < 4 && scope; i += 1) {
        const text = (scope.innerText || "").replace(/\s+\n/g, "\n").trim();
        const sliced = shared.extractJobDescriptionFromText(text);
        if (sliced.length > 180) return sliced.slice(0, 12000);
        scope = scope.parentElement;
      }
    }
    const body = document.body?.innerText?.replace(/\s+\n/g, "\n").trim() || "";
    return shared.extractJobDescriptionFromText(body).slice(0, 12000);
  }

  function findControlNearLabel(labelNode) {
    const scope = labelNode.closest("label, li, section, form, [role='dialog'], [class*='modal'], [class*='apply'], div") || labelNode.parentElement;
    if (scope) {
      const field = [...scope.querySelectorAll("textarea, input[type='text'], [contenteditable='true']")].find(
        (el) => visible(el) && !labelNode.contains(el)
      );
      if (field) return field;
    }
    let sib = labelNode.nextElementSibling;
    while (sib) {
      if (sib.matches("textarea, input, [contenteditable='true']") && visible(sib)) return sib;
      const nested = [...sib.querySelectorAll("textarea, input[type='text'], [contenteditable='true']")].find(visible);
      if (nested) return nested;
      sib = sib.nextElementSibling;
    }
    return null;
  }

  function findCoverLetterControl() {
    const nodes = document.querySelectorAll("label, legend, h1, h2, h3, h4, h5, p, span, strong, dt, div");
    for (const node of nodes) {
      if (node.children.length > 4) continue;
      if (node.querySelector("textarea, input, [contenteditable='true']")) continue;
      const text = (node.innerText || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 160) continue;
      if (!shared.matchesCoverLetterLabel(text)) continue;
      const field = findControlNearLabel(node);
      if (field) return { el: field, label: text };
    }
    return null;
  }

  function scan() {
    fieldMap.clear();
    const nodes = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"));
    const fields = [];
    const seenRadios = new Set();
    const seenEls = new Set();

    nodes.forEach((el, index) => {
      if (!visible(el)) return;
      if (el.getAttribute("contenteditable") === "true" && el.closest("input, textarea")) return;
      const type = (el.type || "").toLowerCase();
      if (shared.SKIP_TYPES.has(type)) return;
      if (el.closest("[data-jah-ignore]")) return;

      if (type === "radio") {
        const key = el.name || el.id;
        if (key && seenRadios.has(key)) return;
        if (key) seenRadios.add(key);
      }

      const field = describeField(el, index);
      if (shared.looksLikeCaptcha(field)) return;
      if (shared.looksLikeSearch(field)) return;
      if (el.closest('header, nav, [role="search"], [role="banner"], [role="navigation"]')) return;
      if (!field.label && field.fieldType !== "file") return;
      seenEls.add(el);
      fields.push(field);
    });

    const coverLetter = findCoverLetterControl();
    if (coverLetter) {
      const existing = fields.find((f) => fieldMap.get(f.uid) === coverLetter.el);
      if (existing) existing.label = coverLetter.label;
      else if (!seenEls.has(coverLetter.el)) {
        const extra = describeField(coverLetter.el, fields.length);
        extra.label = coverLetter.label;
        fields.push(extra);
      }
    }

    return { origin: location.origin, href: location.href, fields, jobDescription: extractJobDescription() };
  }

  function nativeSet(el, value) {
    if (el.isContentEditable) {
      fillContentEditable(el, value);
      return;
    }
    const proto =
      el.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : el.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    const previous = el.value;
    el.focus();
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
    const tracker = el._valueTracker;
    if (tracker) tracker.setValue(previous);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertFromPaste", data: value }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function fillContentEditable(el, value) {
    el.focus();
    try {
      document.execCommand("selectAll", false, null);
      const ok = document.execCommand("insertText", false, value);
      if (!ok) el.textContent = value;
    } catch {
      el.textContent = value;
    }
    if (!(el.innerText || "").trim()) el.textContent = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertFromPaste", data: value }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function nativeCheck(el, checked) {
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
    if (desc?.set) desc.set.call(el, checked);
    else el.checked = checked;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("click", { bubbles: true }));
  }

  function fillSelect(el, value) {
    const needle = String(value).trim().toLowerCase();
    const match = Array.from(el.options).find((o) => {
      return o.value.toLowerCase() === needle || o.text.trim().toLowerCase() === needle;
    });
    if (match) nativeSet(el, match.value);
    else nativeSet(el, value);
  }

  function truthy(value) {
    return /^(yes|true|y|1|on|checked)$/i.test(String(value).trim());
  }

  function base64ToFile(resume) {
    const binary = atob(resume.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], resume.name, { type: resume.mime || "application/pdf", lastModified: resume.lastModified || Date.now() });
  }

  function fillFile(el, resume) {
    if (!resume?.base64) return false;
    const file = base64ToFile(resume);
    const dt = new DataTransfer();
    dt.items.add(file);
    el.files = dt.files;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return el.files.length > 0;
  }

  function fillOne(el, value, resume) {
    if (!el) return false;
    const type = (el.type || "").toLowerCase();
    if (type === "file") return fillFile(el, resume);
    if (type === "checkbox") {
      nativeCheck(el, truthy(value));
      return true;
    }
    if (type === "radio") {
      const group = el.name
        ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`))
        : [el];
      const needle = String(value).trim().toLowerCase();
      const match =
        group.find((r) => (r.value || "").toLowerCase() === needle) ||
        group.find((r) => getLabel(r).toLowerCase() === needle) ||
        (truthy(value) ? group[0] : null);
      if (!match) return false;
      nativeCheck(match, true);
      return true;
    }
    if (el.tagName === "SELECT") {
      fillSelect(el, value);
      return true;
    }
    nativeSet(el, value);
    return true;
  }

  function fill(assignments, resume) {
    let filled = 0;
    const missing = [];
    for (const item of assignments) {
      const el = fieldMap.get(item.uid);
      if (!el) {
        missing.push(item.uid);
        continue;
      }
      const ok = fillOne(el, item.value, resume);
      if (ok) filled += 1;
    }
    if (filled) showToast(`Filled ${filled} field${filled === 1 ? "" : "s"}`);
    return { filled, missing };
  }

  function showToast(message) {
    document.querySelectorAll(".jah-toast").forEach((n) => n.remove());
    const toast = document.createElement("div");
    toast.className = "jah-toast";
    toast.textContent = message;
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

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
      return;
    }
  }

  globalThis.__jahHandle = handleMessage;
  if (!globalThis.__jahListener) {
    globalThis.__jahListener = true;
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      return globalThis.__jahHandle(message, sender, sendResponse);
    });
  }
})();
