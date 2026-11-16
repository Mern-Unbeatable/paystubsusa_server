import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright-core";
import { env } from "../config/env.ts";
import { findChromiumExecutable } from "../shared/chromium.ts";
import { logger } from "../shared/logger.ts";

export interface RenderPayload {
  type: string;
  template: { code: string; renderer: string; variant: unknown };
  formData: unknown;
}

export interface DocumentRenderer {
  render(payload: RenderPayload): Promise<Buffer>;
  close(): Promise<void>;
}

const RENDER_TIMEOUT_MS = 20_000;

export function resolveChromiumExecutable(): string | undefined {
  const fromEnv = env.CHROMIUM_EXECUTABLE_PATH?.trim();
  // If Coolify sets a missing path (e.g. /usr/bin/chromium on Nixpacks), fall through to cache.
  if (fromEnv && !existsSync(fromEnv)) {
    logger.warn({ path: fromEnv }, "CHROMIUM_EXECUTABLE_PATH does not exist; trying system/Playwright cache");
  }
  return findChromiumExecutable(fromEnv);
}

/**
 * Renders through the offline template bundle (spec section 15). The bundle must expose
 * `window.renderDocument(payload)` and set `data-ready="true"` on its root once fonts are loaded.
 */
export class PlaywrightRenderer implements DocumentRenderer {
  private browser: Promise<Browser> | undefined;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  private getBrowser() {
    this.browser ??= Promise.resolve()
      .then(() => {
        const executablePath = resolveChromiumExecutable();
        if (executablePath) {
          logger.info({ executablePath }, "Launching Chromium for PDF rendering");
        } else {
          logger.warn(
            "CHROMIUM_EXECUTABLE_PATH unset and no system Chromium found; trying Playwright cache (often missing in Coolify — use the server Dockerfile)",
          );
        }
        // --no-sandbox: containers often run as root without a user namespace.
        return chromium.launch({
          ...(executablePath ? { executablePath } : {}),
          args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
        });
      })
      .then((b) => {
        b.on("disconnected", () => {
          logger.warn("Chromium disconnected; it will be relaunched on the next render");
          this.browser = undefined;
        });
        return b;
      })
      .catch((err: unknown) => {
        this.browser = undefined;
        const tip =
          " Use the server Dockerfile (Build Pack = Dockerfile), set CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium, and redeploy.";
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Chromium launch failed: ${message}.${tip}`, { cause: err });
      });
    return this.browser;
  }

  private async acquire() {
    if (this.active >= env.RENDER_CONCURRENCY) await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
  }

  private release() {
    this.active--;
    this.waiting.shift()?.();
  }

  async render(payload: RenderPayload): Promise<Buffer> {
    const bundle = path.resolve(env.RENDERER_BUNDLE_PATH);
    if (!existsSync(bundle)) {
      throw new Error(
        `Renderer bundle not found at ${bundle}; run npm run build:renderer (set RENDERER_BUNDLE_PATH if using a custom path)`,
      );
    }
    const bundleUrl = pathToFileURL(bundle).href;

    await this.acquire();
    const context = await (await this.getBrowser()).newContext({ offline: true });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      await page.route("**/*", (route) =>
        route.request().url().startsWith("file:") || route.request().url().startsWith("data:")
          ? route.continue()
          : route.abort(),
      );
      await page.goto(bundleUrl, { waitUntil: "load" });
      await page.waitForFunction(() => typeof (globalThis as { renderDocument?: unknown }).renderDocument === "function");
      await page.evaluate(
        (p) => (globalThis as unknown as { renderDocument: (x: unknown) => unknown }).renderDocument(p),
        payload as unknown as Record<string, unknown>,
      );
      await page.waitForSelector('[data-ready="true"]');
      return await page.pdf({ format: "Letter", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    } finally {
      await context.close().catch(() => undefined);
      this.release();
    }
  }

  async close() {
    const b = this.browser;
    this.browser = undefined;
    if (b) await (await b).close().catch(() => undefined);
  }
}
