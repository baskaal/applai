import * as esbuild from "esbuild";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");
const tailwind = join(root, "node_modules/.bin/tailwindcss");

async function copyStatic() {
  await mkdir(join(dist, "icons"), { recursive: true });
  await Promise.all([
    cp(join(root, "src/popup.html"), join(dist, "popup.html")),
    cp(join(root, "src/manifest.json"), join(dist, "manifest.json")),
    cp(join(root, "icons"), join(dist, "icons"), { recursive: true }),
  ]);
}

function cssArgs(input, output) {
  return ["-i", input, "-o", output];
}

function buildCss() {
  for (const [input, output] of [
    ["src/styles/popup.css", "dist/popup.css"],
    ["src/styles/content.css", "dist/content.css"],
  ]) {
    const result = spawnSync(tailwind, cssArgs(input, output), { cwd: root, stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

function watchCss() {
  for (const [input, output] of [
    ["src/styles/popup.css", "dist/popup.css"],
    ["src/styles/content.css", "dist/content.css"],
  ]) {
    spawn(tailwind, [...cssArgs(input, output), "--watch"], { cwd: root, stdio: "inherit" });
  }
}

const buildOptions = {
  absWorkingDir: root,
  entryPoints: {
    popup: "src/popup/index.js",
    content: "src/content/index.js",
    background: "src/background/index.js",
  },
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: ["chrome114"],
  logLevel: "info",
};

await rm(dist, { recursive: true, force: true });
await copyStatic();

if (watch) {
  watchCss();
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching extension source. Load unpacked from dist/");
} else {
  buildCss();
  await esbuild.build(buildOptions);
}
