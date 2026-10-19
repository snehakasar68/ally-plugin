#!/usr/bin/env node
// SessionStart hook: install the audit server's npm dependencies the first time the plugin runs on a machine.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ready = ['@modelcontextprotocol/sdk', 'playwright', '@axe-core/playwright', 'eslint-plugin-jsx-a11y']
  .every(p => fs.existsSync(path.join(dir, 'node_modules', p, 'package.json')));
if (ready) process.exit(0);

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const r = spawnSync(npm, ['ci', '--no-audit', '--no-fund'], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8', shell: process.platform === 'win32' });
const msg = r.status === 0
  ? 'a11y-auditor: dependencies installed. Run /mcp and reconnect "a11y-audit" (or restart Claude Code) to start the audit tools.'
  : `a11y-auditor: npm install failed in ${dir}. Run "npm install" there manually.\n${(r.stderr || '').slice(-800)}`;
console.log(JSON.stringify({ systemMessage: msg }));
