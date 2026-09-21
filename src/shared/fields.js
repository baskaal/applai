import { COVER_LETTER_LABELS } from "./constants.js";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COVER_LETTER_PATTERNS = COVER_LETTER_LABELS.map((label) => {
  const escaped = escapeRegExp(label).replace(/\s+/g, "\\s+");
  return new RegExp(escaped, "i");
});

export const CANONICAL = [
  { key: "email", type: "email", patterns: [/\be-?mail\b/i], autocomplete: ["email"] },
  {
    key: "phone",
    type: "tel",
    patterns: [/\b(phone|mobile|cell|telephone)\b/i],
    autocomplete: ["tel", "tel-national"],
  },
  {
    key: "first_name",
    type: "text",
    patterns: [/\b(first\s*name|given\s*name|forename)\b/i, /\bfname\b/i],
    autocomplete: ["given-name"],
  },
  {
    key: "last_name",
    type: "text",
    patterns: [/\b(last\s*name|family\s*name|surname)\b/i, /\blname\b/i],
    autocomplete: ["family-name"],
  },
  {
    key: "full_name",
    type: "text",
    patterns: [/\b(full\s*name|legal\s*name|your\s*name)\b/i],
    autocomplete: ["name"],
  },
  {
    key: "middle_name",
    type: "text",
    patterns: [/\bmiddle\s*(name|initial)\b/i],
    autocomplete: ["additional-name"],
  },
  {
    key: "address",
    type: "text",
    patterns: [/\b(street\s*address|address\s*line\s*1|mailing\s*address)\b/i, /^address$/i],
    autocomplete: ["street-address", "address-line1"],
  },
  {
    key: "address2",
    type: "text",
    patterns: [/\b(address\s*line\s*2|apt|suite|unit)\b/i],
    autocomplete: ["address-line2"],
  },
  { key: "city", type: "text", patterns: [/\b(city|town)\b/i], autocomplete: ["address-level2"] },
  {
    key: "state",
    type: "text",
    patterns: [/\b(state|province|region)\b/i],
    autocomplete: ["address-level1"],
  },
  {
    key: "zip",
    type: "text",
    patterns: [/\b(zip|postal)\b/i],
    autocomplete: ["postal-code"],
  },
  { key: "country", type: "text", patterns: [/\bcountry\b/i], autocomplete: ["country", "country-name"] },
  { key: "linkedin", type: "url", patterns: [/\blinkedin\b/i] },
  { key: "github", type: "url", patterns: [/\bgithub\b/i] },
  {
    key: "website",
    type: "url",
    patterns: [/\b(website|portfolio|personal\s*site)\b/i],
    autocomplete: ["url"],
  },
  {
    key: "work_authorization",
    type: "text",
    patterns: [/\b(work\s*authori[sz]ation|authorized\s*to\s*work|eligible\s*to\s*work)\b/i],
  },
  {
    key: "sponsorship",
    type: "text",
    patterns: [/\b(visa|sponsor(ship)?|require\s*sponsor)\b/i],
  },
  {
    key: "salary",
    type: "text",
    patterns: [/\b(salary|compensation|expected\s*pay|pay\s*expectation)\b/i],
  },
  {
    key: "start_date",
    type: "text",
    patterns: [/\b(start\s*date|available\s*(to\s*start|from)|availability\s*date)\b/i],
  },
  {
    key: "cover_letter",
    type: "textarea",
    patterns: COVER_LETTER_PATTERNS,
  },
  {
    key: "pronouns",
    type: "text",
    patterns: [/\bpronouns?\b/i],
  },
];

export function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function questionKey(label) {
  const n = normalize(label);
  return n ? `q:${n}` : "";
}

export function isResumeField(field) {
  if (field.fieldType !== "file") return false;
  const hay = `${field.label} ${field.name} ${field.accept}`.toLowerCase();
  if (/\b(cover\s*letter)\b/.test(hay)) return false;
  return /\b(resume|cv|curriculum|vitae)\b/.test(hay) || !/\b(photo|image|headshot|avatar)\b/.test(hay);
}

export function inferCanonical(field) {
  const hay = `${field.label} ${field.name} ${field.placeholder} ${field.autocomplete}`.trim();
  const auto = (field.autocomplete || "").toLowerCase();
  const type = (field.inputType || field.fieldType || "").toLowerCase();

  for (const rule of CANONICAL) {
    if (rule.autocomplete?.some((v) => auto === v || auto.includes(v))) return rule.key;
  }
  if (type === "email") return "email";
  if (type === "tel") return "phone";
  for (const rule of CANONICAL) {
    if (rule.patterns.some((re) => re.test(hay))) return rule.key;
  }
  if (field.fieldType === "file" && isResumeField(field)) return "resume";
  return questionKey(field.label || field.name || field.placeholder);
}

export function matchesCoverLetterLabel(text) {
  const n = normalize(text);
  if (!n) return false;
  return COVER_LETTER_LABELS.some((label) => {
    const needle = normalize(label);
    if (!needle) return false;
    if (n === needle || n.includes(needle)) return true;
    return needle.length >= 12 && n.length >= 12 && needle.includes(n);
  });
}

export function isCoverLetterField(field) {
  if (inferCanonical(field) === "cover_letter") return true;
  return matchesCoverLetterLabel(`${field.label || ""} ${field.name || ""} ${field.placeholder || ""}`);
}

export function findStoredAnswer(field, answers) {
  const canonical = inferCanonical(field);
  if (canonical && answers[canonical]?.value != null && answers[canonical].value !== "") {
    return { key: canonical, answer: answers[canonical] };
  }

  const labelKey = questionKey(field.label);
  if (labelKey && answers[labelKey]?.value != null && answers[labelKey].value !== "") {
    return { key: labelKey, answer: answers[labelKey] };
  }

  const needle = normalize(field.label || field.name);
  if (!needle || needle.length < 4) return null;

  let best = null;
  for (const [key, answer] of Object.entries(answers)) {
    const hay = normalize(answer.label || key.replace(/^q:/, ""));
    if (!hay) continue;
    if (hay === needle || hay.includes(needle) || needle.includes(hay)) {
      const score = Math.min(hay.length, needle.length) / Math.max(hay.length, needle.length);
      if (!best || score > best.score) best = { key, answer, score };
    }
  }
  if (best && best.score >= 0.72) return { key: best.key, answer: best.answer };
  return null;
}

export function looksLikeCaptcha(field) {
  const hay = `${field.label} ${field.name} ${field.id}`.toLowerCase();
  return /captcha|recaptcha|hcaptcha|cf-turnstile/.test(hay);
}

export function looksLikeSearch(field) {
  const type = (field.inputType || field.fieldType || "").toLowerCase();
  if (type === "search") return true;
  const hay = `${field.label} ${field.name} ${field.id} ${field.placeholder} ${field.autocomplete}`.toLowerCase();
  if (/\b(search|find jobs|search jobs|job search|filter jobs)\b/.test(hay)) return true;
  if (/^(q|query|keyword|keywords|search|search_term|searchterm)$/i.test(field.name || field.id || "")) return true;
  return false;
}
