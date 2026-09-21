import { matchesCoverLetterLabel } from "./fields.js";

export function extractJobDescriptionFromText(text) {
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

export function scoreJobDescription(text) {
  const value = String(text || "").trim();
  if (value.length < 40) return -1;
  let score = Math.min(value.length, 8000) / 200;
  if (/about the job|full job description|responsibilities|what you.?ll bring/i.test(value)) score += 80;
  if ((value.match(/\bapply\b/gi) || []).length > 8) score -= 50;
  if (value.length < 500 && matchesCoverLetterLabel(value)) score -= 30;
  return score;
}
