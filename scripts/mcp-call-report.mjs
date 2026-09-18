#!/usr/bin/env node
// MCP call report (F13) — the evidence the dogfooding loop runs on.
//
//   node scripts/mcp-call-report.mjs [logfile ...]      # or: < logfile
//
// Reads the API log and answers the two questions a dogfooding session is
// actually asking: *which tool did the agent pick, and was the result a sensible
// size?* — per tool, and in sequence.
//
// Two log shapes are accepted, because the API emits both depending on how it
// runs: one-JSON-object-per-line (`NODE_ENV=production`, log aggregators) and the
// human-readable `pino-pretty` format used in development. Neither is a
// prerequisite for the other: the loop must work in dev, where the logs are.
//
// The per-call line carries argument *names* and never values (api-design §10),
// so this report cannot leak a description, an address or a token even if it
// tried.

import { readFileSync } from 'node:fs';

const TIME_GAP_MS = 90_000; // one "conversation" = calls closer together than this

const MCP_EVENTS = new Set([
  'mcp.era.detected',
  'mcp.handshake.answered',
  'mcp.dispatched',
  'mcp.tool.called',
  'mcp.tool.invalid_arguments',
  'mcp.tool.failed',
  'mcp.tool.scope_denied',
  'mcp.rate_limit.exceeded',
]);

/** One pretty line: `[ts] LEVEL: msg {json}`. */
const PRETTY = /^\[([^\]]+)\]\s+(\w+):\s+([\w.]+)\s+(\{.*\})$/u;

/**
 * `pino-pretty` colours its output, and a captured log keeps the escape codes:
 * `\x1b[32mINFO\x1b[39m: \x1b[36mmcp.tool.called\x1b[39m`. Parse the text, not
 * the terminal's opinion of it — a report that only works on an uncoloured log is
 * a report that fails the first time someone pipes it to a file.
 */
const ANSI = /\u001B\[[0-9;]*m/gu;

function recordFrom(line) {
  const trimmed = line.trim().replace(ANSI, '');
  if (trimmed === '') return null;

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.msg === 'string' && MCP_EVENTS.has(parsed.msg)) {
        return {
          at: parsed.time ?? null,
          level: parsed.level,
          event: parsed.msg,
          ...parsed,
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  const match = PRETTY.exec(trimmed);
  if (match === null) return null;

  const [, at, level, event, json] = match;
  if (!MCP_EVENTS.has(event)) return null;

  try {
    return { at, level, event, ...JSON.parse(json) };
  } catch {
    return null;
  }
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[index];
}

function readInputs(paths) {
  if (paths.length > 0) {
    return paths.map((path) => readFileSync(path, 'utf8')).join('\n');
  }

  return readFileSync(0, 'utf8');
}

const paths = process.argv.slice(2);
const raw = readInputs(paths);

const records = raw
  .split('\n')
  .map(recordFrom)
  .filter((record) => record !== null);

const calls = records.filter((record) => record.event === 'mcp.tool.called');
const failures = records.filter(
  (record) =>
    record.event === 'mcp.tool.invalid_arguments' ||
    record.event === 'mcp.tool.failed',
);
const eras = records.filter((record) => record.event === 'mcp.era.detected');

if (records.length === 0) {
  console.log('No MCP activity in this log.');
  process.exit(0);
}

// ── Per tool ──
const byTool = new Map();
for (const call of calls) {
  const entry = byTool.get(call.tool) ?? {
    durations: [],
    bytes: [],
    errors: 0,
    args: new Set(),
  };
  if (typeof call.durationMs === 'number')
    entry.durations.push(call.durationMs);
  if (typeof call.resultBytes === 'number') entry.bytes.push(call.resultBytes);
  if (call.isError === true) entry.errors += 1;
  for (const key of call.argumentKeys ?? []) entry.args.add(key);
  byTool.set(call.tool, entry);
}

console.log(
  `MCP calls: ${calls.length}   protocol rejections: ${failures.length}\n`,
);
console.log(
  'tool                              calls   p50ms   p95ms  p95 bytes  errors  args used',
);
console.log('─'.repeat(96));

for (const [tool, entry] of [...byTool].sort(
  (a, b) => b[1].durations.length - a[1].durations.length,
)) {
  const row = [
    tool.padEnd(32),
    String(entry.durations.length).padStart(6),
    String(percentile(entry.durations, 50) ?? '-').padStart(7),
    String(percentile(entry.durations, 95) ?? '-').padStart(7),
    String(percentile(entry.bytes, 95) ?? '-').padStart(10),
    String(entry.errors).padStart(7),
    ` ${[...entry.args].join(', ') || '—'}`,
  ];
  console.log(row.join(''));
}

// ── Which era the callers were ──
if (eras.length > 0) {
  const tally = new Map();
  for (const record of eras) {
    const key = `${record.era ?? 'undetermined'}${record.eraSource ? ` (${record.eraSource})` : ''}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  console.log(
    `\neras seen: ${[...tally].map(([key, n]) => `${key} ×${n}`).join(', ')}`,
  );
}

// ── Conversations ──
// The surface is stateless, so there is no session id to group by: a gap in time
// is the honest proxy, and for reading a wrong pick that is enough — what matters
// is the *order* of tools within one burst.
console.log('\nconversations (tools in order):\n');

let conversation = [];
let previous = null;
let index = 0;

function flush() {
  if (conversation.length === 0) return;
  index += 1;
  console.log(`  #${index}: ${conversation.join(' → ')}`);
}

for (const call of calls) {
  const at =
    call.at === null ? null : Date.parse(String(call.at).replace(',', ''));
  if (previous !== null && at !== null && at - previous > TIME_GAP_MS)
    (flush(), (conversation = []));
  conversation.push(`${call.tool}${call.isError === true ? ' (error)' : ''}`);
  previous = at ?? previous;
}
flush();

// ── What failed, in the words the client read ──
if (failures.length > 0) {
  console.log('\nrejected calls:\n');
  for (const failure of failures) {
    const detail =
      failure.event === 'mcp.tool.invalid_arguments'
        ? `invalid arguments: ${(failure.invalidArguments ?? []).join(', ')}`
        : `failed: ${failure.tool}`;
    console.log(`  ${failure.tool ?? '?'} — ${detail}`);
  }
}
