// Offline rPPG validation harness.
//
// Runs the production estimator (backend/rppg-core.mjs) over recorded RGB traces
// and reports how well the camera heart-rate estimate matches a reference.
//
// This script does NOT change the estimator. It exists to judge whether a
// future quality-gate/SNR fix is safe on real data before it ships, and to
// quantify how often the gate returns 0 (i.e. refuses to report a rate).
//
// Usage:
//   node backend/tools/validate-rppg.mjs --manifest <manifest.csv>
//   node backend/tools/validate-rppg.mjs --manifest <manifest.csv> --verbose
//
// See backend/tools/README-rppg-validation.md for how to collect recordings.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { estimateRppg } from '../rppg-core.mjs';

const TOLERANCE_BPM = 5; // a recording is "accurate" when |err| <= this

function parseArgs(argv) {
  const args = { manifest: '', verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest' || a === '-m') args.manifest = argv[++i] ?? '';
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

// Minimal RFC4180-ish CSV parser: handles quoted fields, commas and CRLF.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* ignore */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// A trace CSV has a header row with columns: t_ms,r,g,b (order-independent,
// case-insensitive). Returns { rgb, timestamps } in the exact shape estimateRppg
// expects: timestamps in MILLISECONDS.
function loadTrace(path) {
  const text = readFileSync(path, 'utf8');
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error(`trace ${path} has no data rows`);
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = {
    t: header.indexOf('t_ms') >= 0 ? header.indexOf('t_ms') : header.indexOf('t'),
    r: header.indexOf('r'),
    g: header.indexOf('g'),
    b: header.indexOf('b'),
  };
  if (idx.t < 0 || idx.r < 0 || idx.g < 0 || idx.b < 0) {
    throw new Error(`trace ${path} must have columns t_ms,r,g,b (got: ${header.join(',')})`);
  }
  const rgb = [];
  const timestamps = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const t = toNumber(r[idx.t]);
    const rr = toNumber(r[idx.r]);
    const gg = toNumber(r[idx.g]);
    const bb = toNumber(r[idx.b]);
    if (!Number.isFinite(t) || !Number.isFinite(rr) || !Number.isFinite(gg) || !Number.isFinite(bb)) continue;
    timestamps.push(t);
    rgb.push({ r: rr, g: gg, b: bb });
  }
  if (rgb.length === 0) throw new Error(`trace ${path} produced no valid samples`);
  return { rgb, timestamps };
}

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length); }
function median(xs) {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.manifest) {
    console.log('Usage: node backend/tools/validate-rppg.mjs --manifest <manifest.csv> [--verbose]');
    process.exit(args.help ? 0 : 1);
  }

  const manifestPath = resolve(args.manifest);
  const baseDir = dirname(manifestPath);
  const rows = parseCsv(readFileSync(manifestPath, 'utf8'));
  if (rows.length < 2) {
    console.error('manifest has no data rows');
    process.exit(1);
  }
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idCol = Math.max(0, header.findIndex(h => h === 'recording_id' || h === 'id'));
  const refCol = header.findIndex(h => h === 'reference_bpm' || h === 'ref_bpm' || h === 'bpm');
  const traceCol = header.findIndex(h => h === 'trace_path' || h === 'trace' || h === 'csv');
  if (refCol < 0 || traceCol < 0) {
    console.error('manifest must have columns: recording_id, reference_bpm, trace_path');
    console.error(`got: ${header.join(', ')}`);
    process.exit(1);
  }

  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[traceCol] || !String(r[traceCol]).trim()) continue;
    const id = String(r[idCol] ?? `row${i}`).trim();
    const reference = toNumber(r[refCol]);
    const tracePath = resolve(baseDir, String(r[traceCol]).trim());
    records.push({ id, reference, tracePath });
  }

  const results = [];
  for (const rec of records) {
    try {
      const { rgb, timestamps } = loadTrace(rec.tracePath);
      const out = estimateRppg(rgb, timestamps);
      const gateZero = !(out.bpm > 0) ? 1 : 0;
      const error = gateZero ? NaN : out.bpm - rec.reference;
      results.push({
        id: rec.id, reference: rec.reference, estimated: out.bpm, error,
        absError: Number.isNaN(error) ? NaN : Math.abs(error),
        confidence: out.confidence, signalQuality: out.signalQuality,
        snrDb: out.snrDb, samples: out.samples, gateZero,
      });
    } catch (err) {
      results.push({
        id: rec.id, reference: rec.reference, estimated: 0, error: NaN, absError: NaN,
        confidence: 'error', signalQuality: 0, snrDb: 0, samples: 0, gateZero: 1,
        loadError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const scored = results.filter(r => !r.gateZero && Number.isFinite(r.absError));
  const absErrors = scored.map(r => r.absError);
  const signedErrors = scored.map(r => r.error);
  const mae = absErrors.length ? mean(absErrors) : NaN;
  const bias = signedErrors.length ? mean(signedErrors) : NaN;
  const withinTolerance = absErrors.filter(e => e <= TOLERANCE_BPM).length;
  const gateZeroRate = results.length ? results.filter(r => r.gateZero).length / results.length : NaN;

  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n=== Per-recording results ===');
  console.log([pad('recording_id', 20), pad('ref', 6), pad('est', 6), pad('err', 7), pad('conf', 9), pad('snrDb', 8), pad('gate=0', 6)].join(' '));
  for (const r of results) {
    const est = r.gateZero ? '--' : r.estimated.toFixed(1);
    const err = Number.isFinite(r.error) ? (r.error >= 0 ? '+' : '') + r.error.toFixed(1) : '--';
    console.log([
      pad(r.id, 20), pad(r.reference, 6), pad(est, 6), pad(err, 7), pad(r.confidence, 9),
      pad(Number.isFinite(r.snrDb) ? r.snrDb.toFixed(1) : '--', 8), pad(r.gateZero ? 'yes' : 'no', 6),
    ].join(' '));
    if (args.verbose && r.loadError) console.log(`    load error: ${r.loadError}`);
  }

  console.log('\n=== Summary ===');
  console.log(`recordings                 : ${results.length}`);
  console.log(`scored (gate passed)       : ${scored.length}`);
  console.log(`gate returned 0 (refused)  : ${results.filter(r => r.gateZero).length}`);
  console.log(`gate-zero rate             : ${Number.isFinite(gateZeroRate) ? (gateZeroRate * 100).toFixed(1) + '%' : 'n/a'}`);
  console.log(`mean absolute error (MAE)  : ${Number.isFinite(mae) ? mae.toFixed(2) + ' bpm' : 'n/a'}`);
  console.log(`bias (mean signed error)   : ${Number.isFinite(bias) ? (bias >= 0 ? '+' : '') + bias.toFixed(2) + ' bpm' : 'n/a'}`);
  console.log(`median absolute error      : ${absErrors.length ? median(absErrors).toFixed(2) + ' bpm' : 'n/a'}`);
  console.log(`within +/-${TOLERANCE_BPM} bpm           : ${withinTolerance}/${scored.length}`);

  // Exit non-zero if nothing scored, so CI/local runs notice a fully-refusing gate.
  process.exit(scored.length === 0 ? 2 : 0);
}

main();

