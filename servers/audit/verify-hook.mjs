#!/usr/bin/env node
// PostToolUse hook: after Claude edits a front-end file, re-check it and block (exit 2) on regressions.
//   .html        -> browser audit (axe-core + Tab probe)
//   .jsx / .tsx  -> static jsx-a11y lint
// Other framework files are verified by the skill via run_audit against the dev server instead.
import fs from 'node:fs';
import { audit, summarize, loadBaseline, saveBaseline, toUrl } from './lib.mjs';
import { lintJsx } from './jsx.mjs';

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const file = input.tool_input && input.tool_input.file_path;
  if (!file || !fs.existsSync(file)) process.exit(0);

  if (/\.(jsx|tsx)$/i.test(file)) {
    const before = loadBaseline(toUrl(file), 'jsx');
    const r = await lintJsx(file);
    saveBaseline(toUrl(file), 'jsx', { total: r.total, criticalSerious: r.serious, rules: r.rules, at: new Date().toISOString() });
    if (before && r.serious > before.criticalSerious) {
      const list = r.issues.filter(i => i.impact === 'serious').slice(0, 5).map(i => `- line ${i.line} ${i.rule}: ${i.help}`).join('\n');
      console.error(`a11y regression in ${file}: serious jsx-a11y issues ${before.criticalSerious} -> ${r.serious}.\n${list}\nFix this before continuing.`);
      process.exit(2);
    }
    process.exit(0);
  }

  if (!/\.html?$/i.test(file)) process.exit(0);
  const url = toUrl(file);
  const before = loadBaseline(url, 'desktop');
  const res = await audit(file, { tabProbe: true });
  const s = summarize(res, { save: false });
  if (before && s.criticalSerious > before.criticalSerious) {
    const worse = s.issues.filter(i => i.impact === 'critical' || i.impact === 'serious').slice(0, 5).map(i => `- ${i.rule}: ${i.help}`).join('\n');
    console.error(`a11y regression in ${file}: critical+serious ${before.criticalSerious} -> ${s.criticalSerious}.\n${worse}\nFix this before continuing.`);
    process.exit(2);
  }
  // First sighting only: keep run_audit's baseline intact so the skill's verify step still sees the full before -> after delta.
  if (!before) summarize(res, { save: true });
} catch { /* never block the developer because the checker itself failed */ }
process.exit(0);
