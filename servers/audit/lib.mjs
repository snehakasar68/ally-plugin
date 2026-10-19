// Deterministic audit engine. No LLM and no API key involved.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const RANK = { critical: 0, serious: 1, moderate: 2, minor: 3 };
// Browser selection. Defaults to Playwright's bundled Chromium. Override for older OSes (e.g. Ubuntu 20.04):
//   A11Y_BROWSER_PATH=/usr/bin/google-chrome   (any Chrome / Chromium / Edge executable)
//   A11Y_BROWSER_CHANNEL=chrome | msedge       (browser installed in its standard location)
function launchOptions() {
  const o = { headless: true };
  if (process.env.A11Y_BROWSER_PATH) o.executablePath = process.env.A11Y_BROWSER_PATH;
  else if (process.env.A11Y_BROWSER_CHANNEL) o.channel = process.env.A11Y_BROWSER_CHANNEL;
  return o;
}
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 375, height: 812 } };

export function toUrl(target) {
  if (/^(https?|file):\/\//i.test(target)) return target;
  return pathToFileURL(path.resolve(target)).href;
}

export async function audit(target, { tabProbe = true, pa11y = false, viewport = 'desktop' } = {}) {
  const { chromium } = await import('playwright');
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const url = toUrl(target);
  const browser = await chromium.launch(launchOptions());
  try {
    // axe-core requires a page created from a browser context (not browser.newPage())
    const context = await browser.newContext({ viewport: VIEWPORTS[viewport] || VIEWPORTS.desktop });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const hasContent = await page.evaluate(() => !!document.body && document.body.children.length > 0);
    if (!hasContent) throw new Error('The page rendered empty. If you are using snap Chromium it cannot read file:// paths: serve the page over http://localhost instead.');
    const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const issues = [];
    for (const v of axe.violations) for (const n of v.nodes) issues.push({
      engine: 'axe', rule: v.id, impact: v.impact || 'moderate', help: v.help,
      wcag: v.tags.filter(t => /^wcag\d/.test(t)), selector: n.target.join(' '), html: n.html.slice(0, 300), hint: (n.failureSummary || '').split('\n').slice(0, 3).join(' ')
    });
    if (tabProbe) issues.push(...await probeKeyboard(page));
    if (pa11y) issues.push(...await runPa11y(url, issues));
    return { url, viewport, issues };
  } finally { await browser.close(); }
}

// Press Tab repeatedly: detect keyboard traps, focus on hidden elements, missing focus indicators.
async function probeKeyboard(page) {
  const out = [];
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  let last = null, stuck = 0;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const cur = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      const noOutline = (cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0) && cs.boxShadow === 'none';
      // Track element identity, not markup: identical sibling buttons must not look like a trap.
      const ids = window.__a11yIds || (window.__a11yIds = new WeakMap());
      if (!ids.has(e)) ids.set(e, window.__a11yNext = (window.__a11yNext || 0) + 1);
      return { id: ids.get(e), html: e.outerHTML.slice(0, 240), visible: r.width > 0 && r.height > 0, noOutline, sel: e.id ? '#' + CSS.escape(e.id) : e.tagName.toLowerCase() };
    });
    if (!cur) break;
    stuck = last && cur.id === last.id ? stuck + 1 : 0;
    if (stuck >= 2) { out.push({ engine: 'probe', rule: 'keyboard-trap', impact: 'critical', help: 'Focus cannot move past this element with Tab', wcag: ['wcag212'], selector: cur.sel, html: cur.html }); break; }
    if (!cur.visible) out.push({ engine: 'probe', rule: 'focus-on-hidden-element', impact: 'serious', help: 'Tab focus lands on an element that is not visible', wcag: ['wcag241'], selector: cur.sel, html: cur.html });
    if (cur.noOutline && cur.visible) out.push({ engine: 'probe', rule: 'focus-indicator-missing', impact: 'serious', help: 'Focused element shows no outline or box-shadow', wcag: ['wcag247'], selector: cur.sel, html: cur.html });
    last = cur;
  }
  return out;
}

async function runPa11y(url, existing) {
  try {
    const { default: pa11y } = await import('pa11y');
    const r = await pa11y(url, { standard: 'WCAG2AA', runners: ['htmlcs'] });
    const seen = new Set(existing.map(i => i.html));
    return r.issues.filter(i => !seen.has(i.context)).map(i => ({
      engine: 'pa11y', rule: i.code, impact: i.type === 'error' ? 'serious' : 'moderate', help: i.message, wcag: [], selector: i.selector, html: (i.context || '').slice(0, 300) }));
  } catch { return []; }
}

/* ---- summary + baseline (the verify loop's memory) ---- */
const dir = path.join(os.tmpdir(), 'a11y-auditor');
const key = (url, viewport) => path.join(dir, crypto.createHash('sha1').update(url + '|' + viewport).digest('hex') + '.json');
export const loadBaseline = (url, viewport = 'desktop') => { try { return JSON.parse(fs.readFileSync(key(url, viewport), 'utf8')); } catch { return null; } };
export const saveBaseline = (url, viewport, snap) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(key(url, viewport), JSON.stringify(snap)); };

export function summarize(res, { limit = 40, save = true } = {}) {
  const issues = [...res.issues].sort((a, b) => RANK[a.impact] - RANK[b.impact]);
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  issues.forEach(i => { byImpact[i.impact] = (byImpact[i.impact] || 0) + 1; });
  const rules = [...new Set(issues.map(i => i.rule))].sort();
  const snap = { total: issues.length, criticalSerious: byImpact.critical + byImpact.serious, rules, at: new Date().toISOString() };
  const prev = loadBaseline(res.url, res.viewport);
  const delta = prev ? {
    previousTotal: prev.total, previousCriticalSerious: prev.criticalSerious,
    newRules: rules.filter(r => !prev.rules.includes(r)), resolvedRules: prev.rules.filter(r => !rules.includes(r)),
    improved: snap.criticalSerious < prev.criticalSerious || (snap.criticalSerious === prev.criticalSerious && snap.total < prev.total)
  } : null;
  if (save) saveBaseline(res.url, res.viewport, snap);
  return { url: res.url, viewport: res.viewport, total: snap.total, criticalSerious: snap.criticalSerious, byImpact, delta, shown: Math.min(limit, issues.length), issues: issues.slice(0, limit) };
}
