import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const webRoot = path.resolve("../web");
const seen = new Set();
const queue = ["src/renderer/main.jsx"];
const files = [];
const missing = [];
const external = new Set();

function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".") && !spec.startsWith("/")) {
    external.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
    return null;
  }
  const dir = path.dirname(fromFile);
  const base = path.normalize(path.join(dir, spec)).replaceAll("\\", "/");
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.css`,
    `${base}.json`,
    `${base}/index.js`,
    `${base}/index.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  for (const c of candidates) {
    const abs = path.join(webRoot, c);
    try {
      if (existsSync(abs) && statSync(abs).isFile()) return c.replaceAll("\\", "/");
    } catch {
      /* continue */
    }
  }
  missing.push({ from: fromFile, spec });
  return null;
}

while (queue.length) {
  const f = queue.shift();
  if (seen.has(f)) continue;
  seen.add(f);
  files.push(f);
  if (/\.(css|json|svg|png|jpg|jpeg|webp)$/i.test(f)) continue;
  const abs = path.join(webRoot, f);
  if (!existsSync(abs)) {
    missing.push({ from: "root", spec: f });
    continue;
  }
  const text = readFileSync(abs, "utf8");
  const re = /(?:from\s+|import\s*\(|import\s+)['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text))) {
    const r = resolveImport(f, m[1]);
    if (r && !seen.has(r)) queue.push(r);
  }
}

console.log(
  JSON.stringify(
    { count: files.length, files: files.sort(), external: [...external].sort(), missing },
    null,
    2,
  ),
);
