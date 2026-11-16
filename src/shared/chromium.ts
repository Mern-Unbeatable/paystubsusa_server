import { existsSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const SYSTEM_CHROMIUM_CANDIDATES = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chrome",
];

const BROWSER_NAMES = new Set([
  "chromium",
  "chromium-browser",
  "chrome",
  "chrome.exe",
  "chrome-headless-shell",
  "chrome-headless-shell.exe",
  "headless_shell",
]);

function playwrightBrowsersRoot() {
  return process.env.PLAYWRIGHT_BROWSERS_PATH?.trim() || path.join(os.homedir(), ".cache", "ms-playwright");
}

/** Depth-limited search for a Playwright-downloaded browser binary. */
function findInPlaywrightCache(root = playwrightBrowsersRoot(), depth = 0): string | undefined {
  if (depth > 6 || !existsSync(root)) return undefined;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return undefined;
  }
  for (const name of entries) {
    const full = path.join(root, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isFile() && BROWSER_NAMES.has(name)) return full;
    if (st.isDirectory()) {
      const found = findInPlaywrightCache(full, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Resolve a Chromium/Chrome binary for Playwright.
 * Order: env (if the file exists) → system packages → Playwright browser cache.
 */
export function findChromiumExecutable(envPath?: string | null): string | undefined {
  const fromEnv = envPath?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const candidate of SYSTEM_CHROMIUM_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return findInPlaywrightCache();
}
