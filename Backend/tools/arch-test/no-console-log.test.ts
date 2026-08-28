// tools/arch-test/no-console-log.test.ts
// Production code TIDAK boleh pakai console.log/error/warn
// (kecuali di folder scripts/, tools/, atau file *.cli.ts)

import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');

function* walkFiles(dir: string, allowList: string[] = []): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Skip test folders & arch-test
      if (entry === '__tests__' || entry === 'test' || entry === 'tests') continue;
      yield* walkFiles(full, allowList);
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts') && !full.endsWith('.d.ts')) {
      // Skip files in allowList (e.g. migration scripts, CLI tools)
      const allowed = allowList.some((pattern) => full.includes(pattern));
      if (allowed) continue;
      yield full;
    }
  }
}

function findConsoleCalls(content: string): Array<{ line: number; call: string }> {
  const results: Array<{ line: number; call: string }> = [];
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    // Match console.log/error/warn/info/debug (exclude console in comments/strings)
    const m = line.match(/console\.(log|error|warn|info|debug)\s*\(/);
    if (m && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
      results.push({ line: idx + 1, call: m[0] });
    }
  });
  return results;
}

describe('No Console Statements', () => {
  it('tidak boleh ada console.log/error/warn/info/debug di src/ (kecuali yang di-allowlist)', () => {
    const violations: Array<{ file: string; line: number; call: string }> = [];

    // File yang BOLEH pakai console (bootstrap, migration scripts, CLI)
    const allowList = [
      'src/bootstrap/', // startup scripts
      'src/main.ts',
      'src/data/orm/migrate.ts', // legacy migration
    ];

    for (const file of walkFiles(SRC_DIR, allowList)) {
      const content = readFileSync(file, 'utf-8');
      const calls = findConsoleCalls(content);
      for (const c of calls) {
        violations.push({
          file: file.replace(process.cwd() + '/', ''),
          line: c.line,
          call: c.call,
        });
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line}  → ${v.call}`)
        .join('\n');
      throw new Error(
        `Ditemukan console statements. Gunakan logger terstruktur:\n${msg}\n\n` +
          `Lihat: src/infrastructure/observability/logger.ts (akan dibuat di step 0.3.1)`,
      );
    }

    expect(violations).toEqual([]);
  });
});
