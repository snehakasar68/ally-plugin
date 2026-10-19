---
name: a11y-audit
description: Audit a web page or front-end project for WCAG 2.2 accessibility and usability problems, fix the source code, and verify the fix. Use when the user asks for an accessibility audit, a11y fixes, WCAG compliance, screen-reader readiness, or keyboard-navigation checks.
argument-hint: "[url | html-file | src-dir-or-jsx-file]"
---

# Accessibility & UX audit

Target: `$ARGUMENTS` — one of:
- a URL such as http://localhost:3000 (rendered-page audit), or a path to a static .html file
- a React source path such as `./src` or `src/components/Card.jsx` (static JSX/TSX audit, no dev server needed)

If no target was given and the project has `.jsx`/`.tsx` files, start with `lint_jsx` on `./src` and ask whether a dev server URL
is available for the rendered audit too. Otherwise ask for the dev-server URL. Do not guess.

## Workflow

1. **Detect.** Use the MCP server `a11y-audit`:
   - URL / .html → `run_audit`. Source path → `lint_jsx` (returns file + line, so step 2 is already done for those issues).
   - React project with a dev server → run both: `lint_jsx` catches source problems, `run_audit` catches contrast, heading order,
     keyboard traps and anything only visible after render.
   - Add `viewport: "mobile"` as a second run when the user cares about mobile.
   - Note the returned `delta` field: it is your baseline for step 6.
2. **Locate the source.** The tool reports rendered HTML snippets, not source files. Use Grep/Glob/Read to find
   the file that produced each snippet (class names, ids, text). Works for HTML, JSX/TSX, Vue, Svelte and Angular templates.
   If you cannot find the source for an issue, say so — do not invent a location.
3. **Review for what engines cannot see.** Read the located files and look for: vague link/button text ("click here"),
   unclear error messages, placeholder-only inputs, missing focus management in dialogs and route changes,
   illogical reading order, WCAG 2.2 risks (2.4.11 focus not obscured, 2.5.7 dragging alternatives,
   3.3.7 redundant entry, 3.3.8 accessible authentication).
4. **Fix.** Delegate edits to the `a11y-fixer` subagent, or follow its rules yourself. Make the smallest change that fixes each issue.
5. **Ask before large changes.** If a fix needs new components, new dependencies, or CSS redesign, describe it and ask first.
6. **Verify.** Call the same tool(s) again with the SAME target.
   - Success = `criticalSerious` (run_audit) / `serious` (lint_jsx) went down and no new rule ids appeared.
   - If it did not improve, or something new broke, undo only YOUR OWN edits from this session (inspect `git diff` first;
     never discard changes the user made) and try a different fix.
7. **Report.** Give a short summary: issues before → after, files changed, and what still needs a human
   (alt text that needs real context, manual screen-reader testing with NVDA/VoiceOver, colour decisions needing design sign-off).

## Rules
- Automated tools cover only part of WCAG. Never claim the page is "fully compliant"; say what was and was not tested.
- Never modify tests, lockfiles, or unrelated files.
