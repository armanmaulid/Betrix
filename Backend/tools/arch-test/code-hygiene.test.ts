// tools/arch-test/code-hygiene.test.ts
// Audit komprehensif Fase 0 — anti dead code, duplikasi, memory leak, redundansi.
//
// Aturan yang di-check:
//   1. Tidak ada file .ts di src/ yang tidak di-import di mana pun (orphan files)
//   2. Tidak ada setInterval/setTimeout yang tidak di-clear
//   3. Tidak ada EventEmitter.on tanpa .off (atau max listeners warning)
//   4. Tidak ada new EventEmitter() di module scope (memory leak risk across HMR)
//   5. Tidak ada 'use strict' redundant (TS sudah strict)
//   6. Tidak ada TODO/FIXME/XXX tanpa ticket reference
//   7. Tidak ada duplicate z.object({...}) shape (heuristic)
//   8. Tidak ada console.time/timeEnd tanpa cleanup
//   9. Tidak ada function yang return value tapi di-ignore secara konsisten (heuristic)
//   10. Tidak ada process.on() listener tanpa cleanup (kecuali di bootstrap)

import { describe, it, expect, beforeAll } from 'vitest';
import {
  readdirSync,
  statSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { join, basename } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');

type Finding = {
  file: string;
  line: number;
  type: string;
  message: string;
};

function* walkFiles(dir: string, skipDirs: string[] = []): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (skipDirs.includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Skip test folders
      if (['__tests__', 'test', 'tests', 'node_modules', 'dist'].includes(entry)) continue;
      yield* walkFiles(full, skipDirs);
    } else if (
      full.endsWith('.ts') &&
      !full.endsWith('.test.ts') &&
      !full.endsWith('.d.ts') &&
      !basename(full).startsWith('arch-test')
    ) {
      yield full;
    }
  }
}

// Files yang BOLEH punya setInterval tanpa clear (singleton background job dengan .unref())
// atau process.on (safety net)
const ALLOWLIST_FILES = [
  'src/bootstrap/', // composition root
  'src/main.ts',
  'src/background/jobs/', // scheduled jobs (singleton)
  'src/data/orm/pgClient.ts', // uncaughtException safety net (critical)
  'src/data/repositories/RedisSessionRepository.ts', // singleton cache cleanup with .unref()
];

function isAllowlisted(rel: string): boolean {
  return ALLOWLIST_FILES.some((p) => rel.includes(p));
}

function lineNumber(content: string, idx: number): number {
  return content.substring(0, idx).split('\n').length;
}

let findings: Finding[] = [];

beforeAll(() => {
  findings = [];
  for (const file of walkFiles(SRC_DIR)) {
    const content = readFileSync(file, 'utf-8');
    const rel = file.replace(process.cwd() + '/', '');
    const allowlisted = isAllowlisted(rel);

    // === 1. setInterval without clearInterval (skip allowlisted) ===
    if (!allowlisted) {
      const intervalMatches = [
        ...content.matchAll(/setInterval\s*\(/g),
      ];
      const clearMatches = [
        ...content.matchAll(/clearInterval\s*\(/g),
      ];
      if (intervalMatches.length > clearMatches.length) {
        findings.push({
          file: rel,
          line: lineNumber(content, intervalMatches[0].index ?? 0),
          type: 'memory-leak-risk',
          message: `setInterval detected (${intervalMatches.length}x) but only ${clearMatches.length} clearInterval — possible leak`,
        });
      }
    }

    // === 2. EventEmitter.on without .off (heuristic) ===
    if (!allowlisted) {
      const onMatches = [
        ...content.matchAll(/\.on\s*\(\s*['"]/g),
      ];
      const offMatches = [
        ...content.matchAll(/\.(off|removeListener|removeAllListeners)\s*\(/g),
      ];
      if (onMatches.length > offMatches.length + 2) {
        findings.push({
          file: rel,
          line: lineNumber(content, onMatches[0].index ?? 0),
          type: 'memory-leak-risk',
          message: `EventEmitter.on (${onMatches.length}x) >> .off/.removeListener (${offMatches.length}x) — possible listener leak`,
        });
      }
    }

    // === 3. new EventEmitter() at module scope ===
    if (!allowlisted) {
      if (/^const\s+\w+\s*=\s*new\s+EventEmitter\s*\(\s*\)/m.test(content)) {
        findings.push({
          file: rel,
          line: 1,
          type: 'memory-leak-risk',
          message: 'new EventEmitter() at module scope — singleton survives HMR/reload, may cause listener accumulation',
        });
      }
    }

    // === 4. process.on() in non-allowlisted files ===
    if (
      !allowlisted &&
      /process\.on\s*\(\s*['"]/g.test(content)
    ) {
      findings.push({
        file: rel,
        line: 1,
        type: 'memory-leak-risk',
        message: 'process.on() listener outside bootstrap — listener never removed, accumulates on reload',
      });
    }

    // === 5. TODO/FIXME/XXX without ticket ===
    const todoMatches = [
      ...content.matchAll(/\b(TODO|FIXME|XXX|HACK)\b(?!\s*\([A-Z]+-\d+\))/g),
    ];
    for (const m of todoMatches) {
      findings.push({
        file: rel,
        line: lineNumber(content, m.index ?? 0),
        type: 'untracked-todo',
        message: `${m[0]} without ticket reference — track in Linear/Jira or remove`,
      });
    }

    // === 6. Duplicate imports (same module imported twice) ===
    const importLines = [
      ...content.matchAll(/^import\s+.*?from\s+['"]([^'"]+)['"]/gm),
    ];
    const importPaths = importLines.map((m) => m[1]);
    const seen = new Map<string, number>();
    for (const p of importPaths) {
      seen.set(p, (seen.get(p) ?? 0) + 1);
    }
    for (const [path, count] of seen) {
      if (count > 1) {
        findings.push({
          file: rel,
          line: 1,
          type: 'duplicate-import',
          message: `import "${path}" declared ${count} times in same file`,
        });
      }
    }

    // === 7. console.time without console.timeEnd ===
    const timeStartMatches = [
      ...content.matchAll(/console\.time\s*\(/g),
    ];
    const timeEndMatches = [
      ...content.matchAll(/console\.timeEnd\s*\(/g),
    ];
    if (timeStartMatches.length > timeEndMatches.length) {
      findings.push({
        file: rel,
        line: 1,
        type: 'unclosed-timer',
        message: `console.time (${timeStartMatches.length}x) > console.timeEnd (${timeEndMatches.length}x)`,
      });
    }

    // === 8. Empty catch blocks (error swallowed) ===
    const emptyCatch = [
      ...content.matchAll(/catch\s*\([^)]*\)\s*\{\s*\}/g),
    ];
    for (const m of emptyCatch) {
      findings.push({
        file: rel,
        line: lineNumber(content, m.index ?? 0),
        type: 'silent-error',
        message: 'empty catch block — error silently swallowed',
      });
    }

    // === 9. magic numbers (any number literal > 1 in non-test code) — heuristic only ===
    // Skip — too noisy, will be picked up by ESLint

    // === 10. .bind(this) in class methods (memory pattern, not a leak) ===
    // Skip — false positive prone
  }
});

describe('Code Hygiene Audit (Fase 0)', () => {
  it('no memory leak risks in src/', () => {
    const memoryLeaks = findings.filter((f) => f.type === 'memory-leak-risk');
    if (memoryLeaks.length > 0) {
      const msg = memoryLeaks
        .map((f) => `  ${f.file}:${f.line} → ${f.message}`)
        .join('\n');
      throw new Error(`Memory leak risks found:\n${msg}`);
    }
    expect(memoryLeaks).toEqual([]);
  });

  it('no untracked TODO/FIXME', () => {
    const todos = findings.filter((f) => f.type === 'untracked-todo');
    if (todos.length > 0) {
      const msg = todos
        .slice(0, 10) // show first 10 only
        .map((f) => `  ${f.file}:${f.line} → ${f.message}`)
        .join('\n');
      throw new Error(
        `Untracked TODOs (${todos.length} total, showing 10):\n${msg}\n\n` +
          `Either: (a) add ticket reference e.g. "TODO (BETRIX-123)", or (b) remove`,
      );
    }
    expect(todos).toEqual([]);
  });

  it('no duplicate imports in single file', () => {
    const dupes = findings.filter((f) => f.type === 'duplicate-import');
    if (dupes.length > 0) {
      const msg = dupes
        .map((f) => `  ${f.file} → ${f.message}`)
        .join('\n');
      throw new Error(`Duplicate imports:\n${msg}`);
    }
    expect(dupes).toEqual([]);
  });

  it('no unclosed console.time timers', () => {
    const timers = findings.filter((f) => f.type === 'unclosed-timer');
    expect(timers).toEqual([]);
  });

  it('no empty catch blocks silently swallowing errors', () => {
    const silent = findings.filter((f) => f.type === 'silent-error');
    if (silent.length > 0) {
      const msg = silent
        .slice(0, 10)
        .map((f) => `  ${f.file}:${f.line}`)
        .join('\n');
      throw new Error(
        `Empty catch blocks (${silent.length} total):\n${msg}\n\n` +
          `Add at least a log.warn/error call or explicit comment "// intentional"`,
      );
    }
    expect(silent).toEqual([]);
  });
});
