import { findPersonalizeBlocks, replacePersonalizeBlocks } from "../shared/constants.js";
import { getStore } from "./storage.js";

function parseRewrittenSnippets(content, expectedCount) {
  const trimmed = (content || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error("OpenAI did not return personalized snippets.");
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    throw new Error("OpenAI returned invalid personalized snippets.");
  }
  if (!Array.isArray(parsed) || parsed.length < expectedCount) {
    throw new Error("OpenAI returned incomplete personalized snippets.");
  }
  return parsed.slice(0, expectedCount).map((snippet) => String(snippet).trim().replace(/^["“]|["”]$/g, ""));
}

export async function generatePersonalizedSnippets(apiKey, jobDescription, letter, aiContext, blocks) {
  if (!apiKey) {
    throw new Error("Add your OpenAI API key in Settings first.");
  }
  if (!jobDescription || jobDescription.trim().length < 40) {
    throw new Error("Could not find a job description on this page.");
  }

  const contextBlock = (aiContext || "").trim()
    ? `\n\nAPPLICANT BACKGROUND (skills, experience, and any writing preferences):\n${aiContext.trim()}`
    : "";
  const drafts = blocks.map((block, index) => `${index + 1}. ${block.draft.trim() || "[no draft — write a short sentence that fits this spot]"}`).join("\n");
  const markedLetter = replacePersonalizeBlocks(
    letter,
    blocks.map((_, index) => `[DRAFT ${index + 1}]`)
  );

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: Math.min(800, 120 + blocks.length * 160),
      messages: [
        {
          role: "system",
          content:
            "Rewrite each cover-letter draft so it is specific to this job. Keep the applicant's intent and voice. Use the applicant background to name the most relevant skills or experience they can actually provide for this role. Do not invent skills or experience that are not in the background. Do not add a greeting, sign-off, title, or quotation marks. Return only a JSON array of strings, one rewritten snippet per draft, in the same order.",
        },
        {
          role: "user",
          content: `JOB DESCRIPTION:\n${jobDescription.slice(0, 8000)}\n\nCOVER LETTER (numbered drafts mark the snippets to rewrite):\n${markedLetter}${contextBlock}\n\nDRAFTS TO REWRITE:\n${drafts}`,
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI request failed (${response.status})`);
  }
  return parseRewrittenSnippets(payload.choices?.[0]?.message?.content, blocks.length);
}

export async function composeCoverLetter(jobDescription) {
  const { coverLetter, openaiApiKey, aiContext } = await getStore();
  const letter = (coverLetter || "").trim();
  if (!letter) return { text: "", personalized: false };
  const blocks = findPersonalizeBlocks(letter);
  if (!blocks.length) return { text: letter, personalized: false };
  const snippets = await generatePersonalizedSnippets(openaiApiKey, jobDescription, letter, aiContext, blocks);
  return { text: replacePersonalizeBlocks(letter, snippets), personalized: true };
}
