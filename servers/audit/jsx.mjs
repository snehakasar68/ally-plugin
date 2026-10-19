// Static JSX/TSX audit with eslint-plugin-jsx-a11y. No browser or dev server needed.
import fs from 'node:fs';
import path from 'node:path';

const EXT = /\.(jsx|tsx|js|ts)$/i;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'out']);
// Rules that are about real WCAG failures (not style); these count as "serious".
const SERIOUS = new Set([
  'alt-text', 'anchor-has-content', 'anchor-is-valid', 'aria-props', 'aria-proptypes', 'aria-role', 'aria-unsupported-elements',
  'click-events-have-key-events', 'control-has-associated-label', 'heading-has-content', 'html-has-lang', 'iframe-has-title',
  'interactive-supports-focus', 'label-has-associated-control', 'media-has-caption', 'mouse-events-have-key-events',
  'no-noninteractive-element-interactions', 'no-static-element-interactions', 'role-has-required-aria-props',
  'role-supports-aria-props', 'tabindex-no-positive', 'no-aria-hidden-on-focusable', 'no-interactive-element-to-noninteractive-role'
]);

function collect(target, out = []) {
  const st = fs.statSync(target);
  if (st.isFile()) { if (EXT.test(target)) out.push(target); return out; }
  for (const name of fs.readdirSync(target)) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    collect(path.join(target, name), out);
  }
  return out;
}

let cached;
async function linter() {
  if (cached) return cached;
  const { Linter } = await import('eslint');
  const { default: jsxA11y } = await import('eslint-plugin-jsx-a11y');
  const tsParser = (await import('@typescript-eslint/parser')).default;
  const rules = { ...jsxA11y.flatConfigs.strict.rules, 'jsx-a11y/control-has-associated-label': 'error' };
  const base = { plugins: { 'jsx-a11y': jsxA11y }, rules, linterOptions: { reportUnusedDisableDirectives: false } };
  cached = {
    linter: new Linter({ configType: 'flat' }),
    config: [
      { ...base, files: ['**/*.{js,jsx}'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } } },
      { ...base, files: ['**/*.{ts,tsx}'], languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } } }
    ]
  };
  return cached;
}

export async function lintJsx(target, { limit = 60 } = {}) {
  const files = collect(path.resolve(target));
  const { linter: l, config } = await linter();
  const issues = [];
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    if (!/<[A-Za-z]/.test(code)) continue; // no JSX in this file
    for (const m of l.verify(code, config, { filename: file })) {
      if (m.fatal) { issues.push({ engine: 'jsx-a11y', rule: 'parse-error', impact: 'minor', help: m.message, file, line: m.line }); continue; }
      const rule = (m.ruleId || '').replace('jsx-a11y/', '');
      issues.push({ engine: 'jsx-a11y', rule, impact: SERIOUS.has(rule) ? 'serious' : 'moderate', help: m.message, file, line: m.line, column: m.column,
        source: code.split('\n')[m.line - 1].trim().slice(0, 200) });
    }
  }
  const real = issues.filter(i => i.rule !== 'parse-error');
  return {
    target: path.resolve(target), filesScanned: files.length, total: real.length,
    serious: real.filter(i => i.impact === 'serious').length,
    rules: [...new Set(real.map(i => i.rule))].sort(),
    issues: issues.slice(0, limit)
  };
}
