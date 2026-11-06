#!/usr/bin/env node
/**
 * Browser test runner. Starts a Vite dev server, then runs every tests/e2e/*.e2e.cjs file
 * in headless Chromium (one fresh page per test).
 *
 *   npm run e2e                              # all files
 *   npm run e2e -- tests/e2e/smoke.e2e.cjs   # one file
 *   npm run e2e -- --grep shop               # tests whose name matches
 *   E2E_PORT=5175 npm run e2e                # pick the dev server port (default 5190)
 *
 * Every test also fails if the page threw an uncaught error. Tests marked `knownBug`
 * are expected to fail; one that passes is reported so the marker can be removed.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { GameDriver } = require('./harness.cjs');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_TIMEOUT = 90_000;

function parseArgs(argv) {
  const files = [];
  let grep = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--grep') grep = new RegExp(argv[++i], 'i');
    else files.push(path.resolve(argv[i]));
  }
  if (!files.length) {
    for (const f of fs.readdirSync(__dirname).sort()) if (f.endsWith('.e2e.cjs')) files.push(path.join(__dirname, f));
  }
  return { files, grep };
}

function withTimeout(promise, ms, name) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${name}`)), ms); }),
  ]);
}

async function main() {
  const { files, grep } = parseArgs(process.argv.slice(2));
  const { createServer } = await import('vite');
  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    logLevel: 'error',
    server: { port: Number(process.env.E2E_PORT || 5190), strictPort: false, host: '127.0.0.1' },
  });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  console.log(`e2e: dev server at ${url}`);

  const browser = await chromium.launch();
  const results = [];
  try {
    for (const file of files) {
      const mod = require(file);
      const rel = path.relative(ROOT, file);
      for (const t of mod.tests || []) {
        if (grep && !grep.test(t.name)) continue;
        const context = await browser.newContext({ viewport: t.viewport || { width: 1280, height: 720 } });
        const page = await context.newPage();
        const g = new GameDriver(page);
        const started = Date.now();
        let error = null;
        try {
          await withTimeout((async () => {
            await g.open(url);
            await t.fn({ page, g, url, context, browser });
            g.assertNoErrors();
          })(), t.timeoutMs || DEFAULT_TIMEOUT, t.name);
        } catch (e) {
          error = e;
        }
        await context.close().catch(() => {});
        const ms = Date.now() - started;
        let status;
        if (t.knownBug) status = error ? 'known-bug' : 'FIXED?';
        else status = error ? 'FAIL' : 'pass';
        results.push({ file: rel, name: t.name, status, ms, error, knownBug: t.knownBug });
        const icon = { pass: '✓', FAIL: '✗', 'known-bug': '~', 'FIXED?': '!' }[status];
        console.log(`  ${icon} [${rel}] ${t.name} (${ms}ms)${t.knownBug ? `  — known bug: ${t.knownBug}` : ''}`);
        if (status === 'FAIL') console.log(`      ${String(error && (error.stack || error)).split('\n').slice(0, 6).join('\n      ')}`);
        if (status === 'FIXED?') console.log('      This known-bug test now passes. Remove its knownBug marker.');
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const count = (s) => results.filter((r) => r.status === s).length;
  console.log(`\ne2e: ${count('pass')} passed, ${count('FAIL')} failed, ${count('known-bug')} known bugs, ${count('FIXED?')} known bugs now passing`);
  process.exit(count('FAIL') || count('FIXED?') ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
