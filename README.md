# a11y-auditor (Claude Code plugin)

Audits any front-end for WCAG 2.2 issues and fixes the source — **no API key in the plugin**.
Claude Code supplies the LLM; the plugin supplies deterministic audit tools and instructions.

| Part | File | Job |
|---|---|---|
| Skill | `skills/a11y-audit/SKILL.md` | The workflow: detect → locate → review → fix → verify → report |
| Subagent | `agents/a11y-fixer.md` | Fixing rules (semantic HTML first, minimal edits) |
| MCP server | `servers/audit/` | `run_audit`: Playwright + axe-core + Tab probe (+ pa11y). `lint_jsx`: static JSX/TSX check with eslint-plugin-jsx-a11y |
| Hook | `hooks/hooks.json` | After editing a .html / .jsx / .tsx file, re-check it and block regressions |

## Install (for other users)
Requirements: Claude Code, Node.js 18+, Google Chrome or Chromium.

**From Git (recommended)** — inside Claude Code CLI:
```
/plugin marketplace add <github-user>/<repo>
/plugin install a11y-auditor@wishtree-a11y
```
**From a zip / shared folder** — unzip anywhere, then in a terminal:
```bash
claude plugin marketplace add /path/to/a11y-plugin
claude plugin install a11y-auditor@wishtree-a11y
```
(VS Code users without the `claude` command can use the binary bundled with the extension:
`~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude`.)

On first start the plugin installs its npm dependencies automatically (about a minute). When you see
"dependencies installed", run `/mcp` and reconnect `a11y-audit`, or restart Claude Code.
On Ubuntu 20.04 or other older Linux, also set `export A11Y_BROWSER_PATH=/usr/bin/google-chrome` (see Browser setup).

Use it in any project: `/a11y-auditor:a11y-audit ./src` or `/a11y-auditor:a11y-audit http://localhost:3000`.

## Try it locally (plugin development)
```bash
cd servers/audit && npm install      # installs deps + Chromium (needs internet once)
node cli.mjs ../../fixtures/missing-alt.html     # test the engine alone, no Claude needed
cd ../..
claude --plugin-dir .                # start Claude Code with the plugin loaded (run from the plugin root)
```
Then inside Claude Code: `/a11y-auditor:a11y-audit http://localhost:3000`, a path to an .html file, or a React source path such as `./src` (no dev server needed).
Use `/reload-plugins` after editing plugin files. `claude plugin validate` checks the manifest.

## Browser setup (if `playwright install chromium` fails)
Older systems such as Ubuntu 20.04 are no longer supported by Playwright's bundled Chromium. Use a browser you already have:
```bash
which google-chrome chromium chromium-browser microsoft-edge   # find one
export A11Y_BROWSER_PATH=/usr/bin/google-chrome                # use its path
# or, for a standard Chrome / Edge install:  export A11Y_BROWSER_CHANNEL=chrome
node servers/audit/cli.mjs fixtures/missing-alt.html
```
To make Claude Code's plugin server see the variable, export it in the same shell before running `claude`.
Snap-packaged Chromium may be blocked from reading local `file://` fixtures; test with a `python3 -m http.server` URL instead.
The best long-term fix is Ubuntu 22.04 or newer.

## Test checklist (fixtures/)
| Fixture | Expected finding |
|---|---|
| missing-alt.html | `image-alt` |
| low-contrast.html | `color-contrast` |
| div-button.html | click handler on non-interactive element (axe may not flag it; the skill's source review should) |
| heading-skip.html | `heading-order` |
| keyboard-trap.html | `keyboard-trap` (from the Tab probe) |

## Known limits
- Dependencies (`node_modules`, Chromium) are not bundled; a SessionStart hook installs them on first run.
- The hook verifies `.html`, `.jsx` and `.tsx`. Vue/Svelte/Angular files are verified by the skill re-running `run_audit` against the dev server.
- Automated tools find only part of WCAG issues. Keep manual screen-reader testing (NVDA / VoiceOver).
- Usage counts against the developer's own Claude plan. Unattended CI runs need a different setup.
