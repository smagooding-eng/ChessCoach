import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isBuild = process.argv.includes("build");

// Tailwind v4 puts every style inside CSS cascade layers (@layer), which
// Safari only understands from 15.4. Older iPads drop those blocks entirely
// and the app shows up unstyled. This writes a second copy of the CSS with
// the layers unwrapped (same rules, same order) and index.html loads it only
// on browsers without layer support. Modern browsers never download it.
function unwrapLayers(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@layer", i);
    if (at < 0) { out += css.slice(i); break; }
    out += css.slice(i, at);
    let j = at + 6;
    while (j < css.length && css[j] !== "{" && css[j] !== ";") j++;
    if (css[j] === ";") { i = j + 1; continue; } // "@layer a, b;" order statement
    // "@layer name { ... }": keep the inside, drop the wrapper
    let depth = 1; let k = j + 1; let q: string | null = null;
    while (k < css.length && depth > 0) {
      const ch = css[k];
      if (q) { if (ch === "\\") k++; else if (ch === q) q = null; }
      else if (ch === '"' || ch === "'") q = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      k++;
    }
    out += unwrapLayers(css.slice(j + 1, k - 1));
    i = k;
  }
  return out;
}
const LEGACY_CSS = "assets/legacy-layers.css";
function legacyLayersCss(): Plugin {
  const stamp = Date.now().toString(36);
  return {
    name: "legacy-layers-css",
    apply: "build",
    generateBundle(_opts, bundle) {
      const parts: string[] = [];
      for (const f of Object.values(bundle)) {
        if (f.type === "asset" && f.fileName.endsWith(".css") && typeof f.source === "string" && f.source.includes("@layer")) parts.push(unwrapLayers(f.source));
      }
      if (parts.length) this.emitFile({ type: "asset", fileName: LEGACY_CSS, source: parts.join("\n") });
    },
    transformIndexHtml() {
      return [{
        tag: "script",
        injectTo: "head",
        children: `if(typeof CSSLayerBlockRule==="undefined"){var l=document.createElement("link");l.rel="stylesheet";l.href="${basePath}${LEGACY_CSS}?v=${stamp}";document.head.appendChild(l);}`,
      }];
    },
  };
}

const rawPort = process.env.PORT;

if (!isBuild && !rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = rawPort ? Number(rawPort) : 3000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    legacyLayersCss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    // Vite 7's default only runs on Safari 16.4+ / Chrome 111+. Compile down
    // so older iPads and phones (Safari 13+, Chrome 87+) can run the app too.
    target: ["es2020", "safari13", "chrome87", "edge88", "firefox78"],
    cssTarget: ["safari13", "chrome87", "edge88", "firefox78"],
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
