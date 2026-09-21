import { SKIP_TYPES } from "../shared/constants.js";
import { looksLikeCaptcha, looksLikeSearch, matchesCoverLetterLabel } from "../shared/fields.js";
import { extractJobDescriptionFromText } from "../shared/jobDescription.js";
import { describeField, fieldMap, visible } from "./dom.js";

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
      const sliced = extractJobDescriptionFromText(text);
      if (sliced.length > 180) return sliced.slice(0, 12000);
      scope = scope.parentElement;
    }
  }
  const body = document.body?.innerText?.replace(/\s+\n/g, "\n").trim() || "";
  return extractJobDescriptionFromText(body).slice(0, 12000);
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
    if (!matchesCoverLetterLabel(text)) continue;
    const field = findControlNearLabel(node);
    if (field) return { el: field, label: text };
  }
  return null;
}

export function scan() {
  fieldMap.clear();
  const nodes = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"));
  const fields = [];
  const seenRadios = new Set();
  const seenEls = new Set();

  nodes.forEach((el, index) => {
    if (!visible(el)) return;
    if (el.getAttribute("contenteditable") === "true" && el.closest("input, textarea")) return;
    const type = (el.type || "").toLowerCase();
    if (SKIP_TYPES.has(type)) return;
    if (el.closest("[data-jah-ignore]")) return;

    if (type === "radio") {
      const key = el.name || el.id;
      if (key && seenRadios.has(key)) return;
      if (key) seenRadios.add(key);
    }

    const field = describeField(el, index);
    if (looksLikeCaptcha(field)) return;
    if (looksLikeSearch(field)) return;
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
