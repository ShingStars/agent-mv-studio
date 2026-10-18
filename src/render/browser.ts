/**
 * Browser discovery + launch. We use an installed Chrome/Edge (or a Playwright
 * browser cache) because the package ships `playwright-core`, which never
 * downloads a browser by itself.
 */

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';

function playwrightCache(root: string): string[] {
  const out: string[] = [];
  try {
    for (const entry of readdirSync(root)) {
      if (!entry.startsWith('chromium-')) continue;
      for (const rel of [
        ['chrome-win', 'chrome.exe'],
        ['chrome-linux', 'chrome'],
        ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
      ]) {
        const p = join(root, entry, ...rel);
        if (existsSync(p)) out.push(p);
      }
    }
  } catch {
    /* cache dir missing */
  }
  return out;
}

export function findBrowser(): string {
  const env = process.env;
  const explicit = env.AGENT_MV_CHROME ?? env.CHROME_PATH ?? env.CHROME_BIN;
  if (explicit && existsSync(explicit)) return explicit;
  const local = env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
  const candidates = [
    ...playwrightCache(join(local, 'ms-playwright')),
    ...playwrightCache(join(homedir(), '.cache', 'ms-playwright')),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(
    'No Chrome/Edge found. Install Chrome, or run `npx playwright install chromium`, or set AGENT_MV_CHROME to the executable path.',
  );
}

export async function launchBrowser(headed = false): Promise<Browser> {
  return chromium.launch({
    executablePath: findBrowser(),
    headless: !headed,
    args: ['--disable-gpu', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--font-render-hinting=none'],
  });
}
