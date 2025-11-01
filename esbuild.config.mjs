import esbuild from "esbuild";
import { dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isProd = process.argv.includes("--prod");
const watchMode = process.argv.includes("--watch");

/** Copy manifest.json after build */
function copyManifest() {
  fs.copyFileSync("manifest.json", "dist/manifest.json");
  if (fs.existsSync("versions.json")) {
    fs.copyFileSync("versions.json", "dist/versions.json");
  }
  if (fs.existsSync("styles.css")) {
    fs.copyFileSync("styles.css", "dist/styles.css");
  }
}

const buildOptions = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  format: "cjs",
  target: "es2018",
  external: ["obsidian"],
  sourcemap: !isProd,
  treeShaking: true,
  logLevel: "info",
};

if (watchMode) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  copyManifest();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  copyManifest();
  console.log("Built plugin to dist/");
}
