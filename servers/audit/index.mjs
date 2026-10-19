#!/usr/bin/env node
// MCP server (stdio) exposing one tool: run_audit
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { audit, summarize } from './lib.mjs';
import { lintJsx } from './jsx.mjs';

const server = new McpServer({ name: 'a11y-audit', version: '0.1.0' });

server.tool(
  'run_audit',
  'Open a page in a real browser and audit it for WCAG 2.2 issues (axe-core + keyboard Tab probe, optional pa11y). Works on any framework because it inspects the rendered DOM. Returns issues sorted by severity plus a delta versus the previous run of the same target, so you can verify fixes.',
  {
    target: z.string().describe('URL (e.g. http://localhost:3000) or path to a static .html file'),
    viewport: z.enum(['desktop', 'mobile']).optional().describe('Viewport size, default desktop'),
    tab_probe: z.boolean().optional().describe('Run the keyboard Tab probe (default true)'),
    pa11y: z.boolean().optional().describe('Also run pa11y/HTML_CodeSniffer (default false)')
  },
  async ({ target, viewport, tab_probe, pa11y }) => {
    try {
      const res = await audit(target, { viewport: viewport || 'desktop', tabProbe: tab_probe !== false, pa11y: !!pa11y });
      return { content: [{ type: 'text', text: JSON.stringify(summarize(res), null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: `Audit failed: ${e.message}. Is the dev server running, and was "npm install" run in servers/audit?` }] };
    }
  }
);

server.tool(
  'lint_jsx',
  'Statically audit React JSX/TSX source (a file or a directory) with eslint-plugin-jsx-a11y: missing alt, missing labels, click handlers on non-interactive elements, invalid ARIA roles/props, positive tabindex, etc. Needs no browser or dev server. Returns file + line for each issue so you can fix the component, then call again to verify.',
  { path: z.string().describe('Path to a .jsx/.tsx/.js/.ts file or a source directory such as ./src') },
  async ({ path: p }) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await lintJsx(p), null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: `JSX lint failed: ${e.message}` }] };
    }
  }
);

await server.connect(new StdioServerTransport());
