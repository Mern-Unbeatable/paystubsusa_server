import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="stylesheet" href="./renderer.css" />
  </head>
  <body>
    <div id="root" class="paystub-print-root"></div>
    <script src="./renderer.js"></script>
  </body>
</html>
`;

/**
 * Offline IIFE bundle for Playwright (file://). Output: server/dist-renderer/.
 */
export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "renderer-index-html",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "index.html",
          source: INDEX_HTML,
        });
      },
    },
  ],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, "../dist-renderer"),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, "src/renderer/main.jsx"),
      formats: ["iife"],
      name: "PaystubRenderer",
      fileName: () => "renderer.js",
      cssFileName: "renderer",
    },
  },
});
