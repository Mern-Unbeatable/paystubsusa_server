// Static checks for the generated Postman files. Run from server/: node postman/validate.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(path.join(dir, f), "utf8"));
const collection = read("Paystubs-USA-API.postman_collection.json");
const envs = ["Paystubs-USA-Local.postman_environment.json", "Paystubs-USA-Development.postman_environment.json"].map(read);
const problems = [];

const requests = [];
const scripts = [];
(function walk(items, trail) {
  for (const it of items) {
    for (const e of it.event ?? []) scripts.push({ where: [...trail, it.name].join(" / "), code: e.script.exec.join("\n") });
    if (it.item) walk(it.item, [...trail, it.name]);
    else requests.push({ ...it, trail: [...trail, it.name].join(" / ") });
  }
})(collection.item, []);
for (const e of collection.event ?? []) scripts.push({ where: "collection", code: e.script.exec.join("\n") });

// 1. Every script compiles.
for (const s of scripts) {
  try {
    new Function("pm", "CryptoJS", "atob", s.code);
  } catch (err) {
    problems.push(`script syntax (${s.where}): ${err.message}`);
  }
}

// 2. Every {{var}} is declared in both environments or set at runtime by a script.
const text = JSON.stringify(collection);
const used = new Set([...text.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]).filter((v) => !v.startsWith("$")));
const runtime = new Set([...text.matchAll(/pm\.(?:environment|variables)\.set\(\\"([A-Za-z0-9_]+)\\"/g)].map((m) => m[1]));
for (const env of envs) {
  const keys = new Set(env.values.map((v) => v.key));
  for (const v of used) if (!keys.has(v) && !runtime.has(v)) problems.push(`${env.name}: {{${v}}} is not declared`);
  for (const v of env.values) if (v.value && !["baseUrl", "apiVersion", "allowDestructive"].includes(v.key)) problems.push(`${env.name}: ${v.key} has a value (expected empty)`);
}

// 3. Every request matches an Express route (method + path).
const srcRoot = path.join(dir, "..", "src");
const routeFiles = [];
(function find(d) {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) find(p);
    else if (/routes\.ts$/.test(f) || f === "app.ts") routeFiles.push(p);
  }
})(srcRoot);
const routes = [];
for (const f of routeFiles) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g)) {
    const root = /public\.routes\.ts$/.test(f);
    routes.push({ method: m[1].toUpperCase(), re: new RegExp("^" + (root ? "" : "/api/v1") + m[2].replace(/:[A-Za-z]+/g, "[^/]+") + "$") });
  }
}
const covered = new Set();
for (const r of requests) {
  const url = r.request.url.raw.split("?")[0].replace("{{baseUrl}}", "").replace("{{apiVersion}}", "v1").replace(/\{\{[^}]+\}\}/g, "x");
  const hit = routes.findIndex((rt) => rt.method === r.request.method && rt.re.test(url));
  if (hit === -1) problems.push(`no Express route for ${r.request.method} ${url} (${r.trail})`);
  else covered.add(hit);
}
const uncovered = routes.filter((_, i) => !covered.has(i)).map((r) => `${r.method} ${r.re.source}`);

// 4. No secrets or real-looking credentials.
const all = text + JSON.stringify(envs);
for (const [label, re] of [
  ["Stripe secret key", /sk_(live|test)_[A-Za-z0-9]{10,}/],
  ["webhook secret", /whsec_[A-Za-z0-9]{10,}/],
  ["JWT", /eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+/],
  ["literal Bearer token", /Bearer (?!\{\{)[A-Za-z0-9._-]{20,}/],
  ["non-test email", /[A-Za-z0-9._%+-]+@(?!example\.(test|com)\b)[A-Za-z0-9-]+\.[a-z]{2,}/],
]) {
  const m = all.match(re);
  if (m) problems.push(`possible ${label}: ${m[0]}`);
}

console.log(`${requests.length} requests, ${scripts.length} scripts, ${used.size} variables, ${routes.length} Express routes`);
console.log(uncovered.length ? `Routes without a request: ${uncovered.join(", ")}` : "Every Express route has at least one request.");
if (problems.length) {
  console.error(problems.map((p) => "FAIL " + p).join("\n"));
  process.exit(1);
}
console.log("OK");
