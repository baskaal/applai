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
    if (nearby && nearby !== el) {
      const text = nearby.innerText.trim();
      if (text && text.length < 180) return text.replace(/\s+/g, " ");
    }
    return (el.placeholder || el.name || el.id || "").trim();
  }

  function currentValue(el) {
    if (el.type === "checkbox") return el.checked ? "yes" : "";
    if (el.type === "radio") return el.checked ? el.value || "yes" : "";
    if (el.type === "file") return el.files?.[0]?.name || "";
    return el.value || "";
  }

  function describeField(el, index) {
    const tag = el.tagName.toLowerCase();
    const inputType = (el.type || tag).toLowerCase();
    let fieldType = "text";
    if (tag === "select") fieldType = "select";
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

  function scan() {
    fieldMap.clear();
    const nodes = Array.from(document.querySelectorAll("input, textarea, select"));
    const fields = [];
    const seenRadios = new Set();

    nodes.forEach((el, index) => {
      if (!visible(el)) return;
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
      if (!field.label && field.fieldType !== "file") return;
      fields.push(field);
    });

    return { origin: location.origin, href: location.href, fields };
  }

  function nativeSet(el, value) {
    const proto =
      el.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : el.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PING") {
      sendResponse({ ok: true });
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
  });
})();
