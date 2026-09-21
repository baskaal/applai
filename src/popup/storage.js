export async function getStore() {
  if (!globalThis.chrome?.storage?.local) {
    return { answers: {}, resume: null, coverLetter: "", openaiApiKey: "", aiContext: "" };
  }
  const data = await chrome.storage.local.get({
    answers: {},
    resume: null,
    coverLetter: "",
    openaiApiKey: "",
    aiContext: "",
  });
  return {
    answers: data.answers || {},
    resume: data.resume || null,
    coverLetter: data.coverLetter || "",
    openaiApiKey: data.openaiApiKey || "",
    aiContext: data.aiContext || "",
  };
}

export async function saveAnswers(answers) {
  await chrome.storage.local.set({ answers });
}

export function fileToStore(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1] || "";
      resolve({
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        lastModified: file.lastModified,
        base64,
      });
    };
    reader.readAsDataURL(file);
  });
}

export function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
