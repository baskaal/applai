export const PERSONALIZE_OPEN = "{{";
export const PERSONALIZE_CLOSE = "}}";
export const PERSONALIZE_RE = /\{\{([\s\S]*?)\}\}/g;
export const SCRIPT_VERSION = 5;
export const EXAMPLE_AI_CONTEXT = `Skills and experience I want mentioned when they match the job.
Write in plain language. Be direct.
No generic praise, no buzzwords, no “I am passionate.”`;

export function findPersonalizeBlocks(letter) {
  return [...(letter || "").matchAll(new RegExp(PERSONALIZE_RE.source, "g"))].map((match) => ({
    raw: match[0],
    draft: match[1],
  }));
}

export function replacePersonalizeBlocks(letter, rewritten) {
  let index = 0;
  return letter.replace(new RegExp(PERSONALIZE_RE.source, "g"), () => rewritten[index++] ?? "");
}

export const SKIP_TYPES = new Set([
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

export const COVER_LETTER_LABELS = [
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
