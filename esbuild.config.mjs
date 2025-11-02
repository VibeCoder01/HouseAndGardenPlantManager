import esbuild from "esbuild";
import { dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isProd = process.argv.includes("--prod");
const watchMode = process.argv.includes("--watch");

/** Copy static assets after build so they ship with the plugin. */
function copyAssets() {
  fs.mkdirSync("dist", { recursive: true });
  fs.copyFileSync("manifest.json", "dist/manifest.json");
  if (fs.existsSync("versions.json")) {
    fs.copyFileSync("versions.json", "dist/versions.json");
  }
  if (fs.existsSync("styles.css")) {
    fs.copyFileSync("styles.css", "dist/styles.css");
  }
  copyDirectory("Templates", "dist/Templates");
}

function copyDirectory(sourceDir, destinationDir) {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = `${sourceDir}/${entry.name}`;
    const destinationPath = `${destinationDir}/${entry.name}`;
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
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
  copyAssets();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  copyAssets();
  console.log("Built plugin to dist/");
}
