export const fieldMap = new Map();

export function visible(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.disabled) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function getLabel(el) {
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

export function currentValue(el) {
  if (el.type === "checkbox") return el.checked ? "yes" : "";
  if (el.type === "radio") return el.checked ? el.value || "yes" : "";
  if (el.type === "file") return el.files?.[0]?.name || "";
  if (el.isContentEditable) return (el.innerText || "").trim();
  return el.value || "";
}

export function describeField(el, index) {
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
