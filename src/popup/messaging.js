import { SCRIPT_VERSION } from "../shared/constants.js";
import { scoreJobDescription } from "../shared/jobDescription.js";

export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export async function messageFrames(tabId, message) {
  let frames = [{ frameId: 0 }];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId })) || frames;
  } catch {
    /* main frame only */
  }
  const replies = [];
  for (const frame of frames) {
    try {
      const reply = await chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId });
      if (reply) replies.push({ frameId: frame.frameId, reply });
    } catch {
      /* frame without the content script */
    }
  }
  return replies;
}

export async function ensureContentScript(tabId) {
  const replies = await messageFrames(tabId, { type: "PING" });
  const current = replies.length > 0 && replies.every((item) => item.reply?.version === SCRIPT_VERSION);
  if (current) return;
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["content.js"],
  });
  await chrome.scripting.insertCSS({
    target: { tabId, allFrames: true },
    files: ["content.css"],
  });
}

export async function fillAssignments(tabId, assignments, resume) {
  const byFrame = new Map();
  for (const item of assignments) {
    const list = byFrame.get(item.frameId) || [];
    list.push(item);
    byFrame.set(item.frameId, list);
  }
  let filled = 0;
  for (const [frameId, list] of byFrame) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: "FILL", assignments: list, resume }, { frameId });
      filled += result?.filled || 0;
    } catch {
      /* frame gone */
    }
  }
  return filled;
}

export async function scanTab(tabId) {
  const replies = await messageFrames(tabId, { type: "SCAN" });
  const fields = [];
  let jobDescription = "";
  let bestScore = -Infinity;
  for (const { frameId, reply } of replies) {
    for (const field of reply.fields || []) {
      fields.push({ ...field, frameId });
    }
    const desc = reply.jobDescription || "";
    const score = scoreJobDescription(desc);
    if (score > bestScore) {
      bestScore = score;
      jobDescription = desc;
    }
  }
  return { fields, jobDescription };
}
