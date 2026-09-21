import { PERSONALIZE } from "../shared/constants.js";
import { getStore } from "./storage.js";

export async function generatePersonalizedParagraph(apiKey, jobDescription, letter, aiContext) {
  if (!apiKey) {
    throw new Error("Add your OpenAI API key in Settings first.");
  }
  if (!jobDescription || jobDescription.trim().length < 40) {
    throw new Error("Could not find a job description on this page.");
  }

  const contextBlock = (aiContext || "").trim()
    ? `\n\nWRITING INSTRUCTIONS FROM THE APPLICANT:\n${aiContext.trim()}`
    : "";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 280,
      messages: [
        {
          role: "system",
          content:
            "Write one short cover-letter paragraph tailored to the job description. Sound like the same person as the rest of the letter. Follow the applicant's writing instructions when they are provided. No greeting, sign-off, title, or quotation marks. Return only the paragraph.",
        },
        {
          role: "user",
          content: `JOB DESCRIPTION:\n${jobDescription.slice(0, 8000)}\n\nCOVER LETTER DRAFT (the placeholder marks where this paragraph will go):\n${letter.replaceAll(PERSONALIZE, "[personalized paragraph]")}${contextBlock}`,
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI request failed (${response.status})`);
  }
  const paragraph = payload.choices?.[0]?.message?.content?.trim() || "";
  if (!paragraph) throw new Error("OpenAI returned an empty paragraph.");
  return paragraph.replace(/^["“]|["”]$/g, "");
}

export async function composeCoverLetter(jobDescription) {
  const { coverLetter, openaiApiKey, aiContext } = await getStore();
  const letter = (coverLetter || "").trim();
  if (!letter) return { text: "", personalized: false };
  if (!letter.includes(PERSONALIZE)) return { text: letter, personalized: false };
  const paragraph = await generatePersonalizedParagraph(openaiApiKey, jobDescription, letter, aiContext);
  return { text: letter.replaceAll(PERSONALIZE, paragraph), personalized: true };
}
