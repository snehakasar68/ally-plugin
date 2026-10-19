#!/usr/bin/env node
// Test the engine without Claude:  node cli.mjs ../../fixtures/missing-alt.html
import { audit, summarize } from './lib.mjs';
const target = process.argv[2];
if (!target) { console.error('Usage: node cli.mjs <url-or-html-file> [--mobile]'); process.exit(1); }
const res = await audit(target, { viewport: process.argv.includes('--mobile') ? 'mobile' : 'desktop' });
console.log(JSON.stringify(summarize(res), null, 2));
