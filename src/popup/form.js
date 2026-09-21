import { fieldControl, fieldTextarea } from "./classes.js";

export function inputForField(field, value = "") {
  if (field.fieldType === "textarea" || field.fieldType === "cover_letter") {
    const el = document.createElement("textarea");
    el.className = fieldTextarea;
    el.value = value;
    return el;
  }
  if (field.fieldType === "select" || field.fieldType === "radio") {
    const el = document.createElement("select");
    el.className = fieldControl;
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
    el.className = fieldControl;
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
  el.className = fieldControl;
  el.type = ["email", "tel", "url", "date", "number"].includes(field.fieldType) ? field.fieldType : "text";
  el.value = value;
  return el;
}
