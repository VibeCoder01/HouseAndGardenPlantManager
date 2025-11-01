import esbuild from "esbuild";
import { dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isProd = process.argv.includes("--prod");

/** Copy manifest.json after build */
function copyManifest() {
  fs.copyFileSync("manifest.json", "dist/manifest.json");
  if (fs.existsSync("versions.json")) {
    fs.copyFileSync("versions.json", "dist/versions.json");
  }
}

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  format: "cjs",
  target: "es2018",
  external: ["obsidian"],
  sourcemap: !isProd,
  treeShaking: true,
  logLevel: "info",
  watch: process.argv.includes("--watch") && {
    onRebuild(error) {
      if (error) console.error("Rebuild failed:", error);
      else copyManifest();
    }
  }
});

copyManifest();
console.log("Built plugin to dist/");
