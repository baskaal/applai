import { fieldMap, getLabel } from "./dom.js";

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

function showToast(message) {
  document.querySelectorAll(".applybot-toast").forEach((n) => n.remove());
  const toast = document.createElement("div");
  toast.className = "applybot-toast";
  toast.textContent = message;
  document.documentElement.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

export function fill(assignments, resume) {
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
