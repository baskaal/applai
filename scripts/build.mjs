import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

async function copyStatic() {
  await mkdir(join(dist, "icons"), { recursive: true });
  await Promise.all([
    cp(join(root, "src/popup.html"), join(dist, "popup.html")),
    cp(join(root, "src/popup.css"), join(dist, "popup.css")),
    cp(join(root, "src/content.css"), join(dist, "content.css")),
    cp(join(root, "src/manifest.json"), join(dist, "manifest.json")),
    cp(join(root, "icons"), join(dist, "icons"), { recursive: true }),
  ]);
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
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching extension source. Load unpacked from dist/");
} else {
  await esbuild.build(buildOptions);
}
