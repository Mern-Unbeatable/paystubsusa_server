/**
 * Ensures a Chromium binary exists before the API starts.
 * Used on Coolify/Nixpacks when the Dockerfile (apt chromium) is not the build strategy.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const SYSTEM = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chrome",
];

const NAMES = new Set([
  "chromium",
  "chrome",
  "chrome.exe",
  "chrome-headless-shell",
  "chrome-headless-shell.exe",
  "headless_shell",
]);

function findCache(root, depth = 0) {
  if (depth > 6 || !existsSync(root)) return null;
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return null;
  }
  for (const name of entries) {
    const full = path.join(root, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isFile() && NAMES.has(name)) return full;
    if (st.isDirectory()) {
      const found = findCache(full, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function findChromium() {
  const fromEnv = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const p of SYSTEM) if (existsSync(p)) return p;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim() || path.join(os.homedir(), ".cache", "ms-playwright");
  return findCache(root);
}

const existing = findChromium();
if (existing) {
  console.log(`[ensure-chromium] Found Chromium at ${existing}`);
  process.exit(0);
}

console.log("[ensure-chromium] No Chromium found; installing Playwright Chromium…");

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const deps = spawnSync(npx, ["playwright-core", "install-deps", "chromium"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});
if (deps.status !== 0) {
  console.warn("[ensure-chromium] install-deps failed or unavailable; continuing with browser download only");
}

const install = spawnSync(npx, ["playwright-core", "install", "chromium"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});
if (install.status !== 0) {
  console.error(
    "[ensure-chromium] playwright-core install chromium failed — API will start but PDF jobs will fail until Chromium is available (use Coolify Dockerfile build)",
  );
  process.exit(0);
}

const after = findChromium();
if (!after) {
  console.error(
    "[ensure-chromium] Install finished but no browser binary was found — API will start but PDF jobs will fail",
  );
  process.exit(0);
}

console.log(`[ensure-chromium] Ready at ${after}`);
