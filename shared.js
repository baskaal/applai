(function (root) {
  const SKIP_TYPES = new Set([
    "hidden",
    "submit",
    "button",
    "reset",
    "image",
    "password",
    "color",
    "range",
    "search",
  ]);

  const COVER_LETTER_LABELS = [
    "cover letter",
    "covering letter",
    "motivation letter",
    "letter of motivation",
    "what interests you about working for this company",
    "what interests you about this company",
    "what interests you about this role",
    "why do you want to work here",
    "why do you want to work for this company",
    "why are you interested in this company",
    "why are you interested in this role",
    "why this company",
    "why this role",
    "tell us why you would like to join",
  ];

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  const COVER_LETTER_PATTERNS = COVER_LETTER_LABELS.map((label) => {
    const escaped = escapeRegExp(label).replace(/\s+/g, "\\s+");
    return new RegExp(escaped, "i");
  });

  const CANONICAL = [
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

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function questionKey(label) {
    const n = normalize(label);
    return n ? `q:${n}` : "";
  }

  function isResumeField(field) {
    if (field.fieldType !== "file") return false;
    const hay = `${field.label} ${field.name} ${field.accept}`.toLowerCase();
    if (/\b(cover\s*letter)\b/.test(hay)) return false;
    return /\b(resume|cv|curriculum|vitae)\b/.test(hay) || !/\b(photo|image|headshot|avatar)\b/.test(hay);
  }

  function inferCanonical(field) {
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

  function matchesCoverLetterLabel(text) {
    const n = normalize(text);
    if (!n) return false;
    return COVER_LETTER_LABELS.some((label) => {
      const needle = normalize(label);
      if (!needle) return false;
      if (n === needle || n.includes(needle)) return true;
      return needle.length >= 12 && n.length >= 12 && needle.includes(n);
    });
  }

  function isCoverLetterField(field) {
    if (inferCanonical(field) === "cover_letter") return true;
    return matchesCoverLetterLabel(`${field.label || ""} ${field.name || ""} ${field.placeholder || ""}`);
  }

  function findStoredAnswer(field, answers) {
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

  function looksLikeCaptcha(field) {
    const hay = `${field.label} ${field.name} ${field.id}`.toLowerCase();
    return /captcha|recaptcha|hcaptcha|cf-turnstile/.test(hay);
  }

  function looksLikeSearch(field) {
    const type = (field.inputType || field.fieldType || "").toLowerCase();
    if (type === "search") return true;
    const hay = `${field.label} ${field.name} ${field.id} ${field.placeholder} ${field.autocomplete}`.toLowerCase();
    if (/\b(search|find jobs|search jobs|job search|filter jobs)\b/.test(hay)) return true;
    if (/^(q|query|keyword|keywords|search|search_term|searchterm)$/i.test(field.name || field.id || "")) return true;
    return false;
  }

  function extractJobDescriptionFromText(text) {
    const normalized = String(text || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
    if (!normalized) return "";

    const startPatterns = [/about the job\b/i, /full job description\b/i, /\bjob description\b/i, /about the role\b/i];
    let start = -1;
    for (const re of startPatterns) {
      const idx = normalized.search(re);
      if (idx >= 0 && (start < 0 || idx < start)) start = idx;
    }

    let chunk = start >= 0 ? normalized.slice(start) : normalized;
    const end = chunk.search(/\n\s*(about the company|recent jobs|founders|see all jobs|apply to this job)\b/i);
    if (end > 160) chunk = chunk.slice(0, end);
    chunk = chunk.trim();

    const listingHits = (chunk.match(/\bapply\b/gi) || []).length;
    if (start < 0 && listingHits >= 8) return "";
    return chunk;
  }

  function scoreJobDescription(text) {
    const value = String(text || "").trim();
    if (value.length < 40) return -1;
    let score = Math.min(value.length, 8000) / 200;
    if (/about the job|full job description|responsibilities|what you.?ll bring/i.test(value)) score += 80;
    if ((value.match(/\bapply\b/gi) || []).length > 8) score -= 50;
    if (value.length < 500 && matchesCoverLetterLabel(value)) score -= 30;
    return score;
  }

  root.JobApplyShared = {
    SKIP_TYPES,
    CANONICAL,
    normalize,
    questionKey,
    COVER_LETTER_LABELS,
    matchesCoverLetterLabel,
    inferCanonical,
    isCoverLetterField,
    findStoredAnswer,
    isResumeField,
    looksLikeCaptcha,
    looksLikeSearch,
    extractJobDescriptionFromText,
    scoreJobDescription,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
