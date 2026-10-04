// Drives Chrome through a list of configs, one fresh browser per config, and records time and memory.
//   node run-bench.mjs configs.json results.json
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { serve } from './serve.mjs';
const puppeteer = createRequire('/Users/ishani/book/package.json')('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [configsFile, outFile] = process.argv.slice(2);
const configs = JSON.parse(readFileSync(configsFile, 'utf8'));
const server = await serve(8780);

/** Resident memory of the browser and every process under it, in MB (renderer, GPU process, utility). */
function treeRss(rootPid) {
  const rows = spawnSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' }).stdout.trim().split('\n')
    .map((l) => l.trim().split(/\s+/).map(Number));
  const kids = new Map(); for (const [pid, ppid] of rows) kids.set(ppid, [...(kids.get(ppid) ?? []), pid]);
  const rss = new Map(rows.map(([pid, , r]) => [pid, r]));
  let total = 0; const walk = (p) => { total += rss.get(p) ?? 0; (kids.get(p) ?? []).forEach(walk); };
  walk(rootPid);
  return total / 1024;
}

const sizeInfo = (file) => {
  const raw = readFileSync(file);
  return { fileMB: raw.length / 1e6, gzipMB: gzipSync(raw, { level: 9 }).length / 1e6, brotliMB: brotliCompressSync(raw).length / 1e6 };
};

const results = [];
for (const cfg of configs) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--ignore-gpu-blocklist', '--no-first-run'],
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8780/bench.html');
  await page.waitForFunction('window.benchReady === true', { timeout: 20000 });
  const pid = browser.process().pid;
  await new Promise((r) => setTimeout(r, 1500));
  const baseline = treeRss(pid);
  let peak = baseline;
  const timer = setInterval(() => { peak = Math.max(peak, treeRss(pid)); }, 150);
  const budget = cfg.timeoutMs ?? 240000;
  const out = await Promise.race([
    page.evaluate((c) => window.bench(c), cfg),
    new Promise((r) => setTimeout(() => r({ error: `timed out after ${budget / 1000} s` }), budget)),
  ]);
  clearInterval(timer);
  peak = Math.max(peak, treeRss(pid));
  const row = { ...cfg, ...out, baselineRssMB: baseline, peakRssMB: peak, addedRssMB: peak - baseline,
    ...sizeInfo(new URL(`.${cfg.model}`, import.meta.url).pathname) };
  results.push(row);
  console.log(JSON.stringify({ model: cfg.model.split('/').pop(), ep: cfg.ep, th: cfg.threads, size: cfg.size,
    first: row.firstRunMs?.toFixed(0), med: row.steady?.median?.toFixed(0), create: row.createMs?.toFixed(0), addedMB: row.addedRssMB.toFixed(0), err: row.error }));
  await browser.close();
  writeFileSync(outFile, JSON.stringify(results, null, 2));
}
server.close();
