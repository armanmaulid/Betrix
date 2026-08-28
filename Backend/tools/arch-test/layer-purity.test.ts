// tools/arch-test/layer-purity.test.ts
// Verifikasi layer purity: domain/application/infrastructure/presentation
// TIDAK boleh import dari layer yang lebih "luar".

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');
const MODULES_DIR = join(SRC_DIR, 'modules');

type Violation = {
  file: string;
  line: number;
  importPath: string;
  rule: string;
};

function* walkFiles(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkFiles(full);
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts') && !full.endsWith('.d.ts')) {
      yield full;
    }
  }
}

function findImports(content: string): Array<{ line: number; importPath: string }> {
  const results: Array<{ line: number; importPath: string }> = [];
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    // Match: import ... from '...'
    // Match: import('...')
    const m1 = line.match(/from\s+['"]([^'"]+)['"]/);
    if (m1) {
      results.push({ line: idx + 1, importPath: m1[1] });
      return;
    }
    const m2 = line.match(/import\(\s*['"]([^'"]+)['"]\s*\)/);
    if (m2) {
      results.push({ line: idx + 1, importPath: m2[1] });
    }
  });
  return results;
}

function isInternalImport(p: string): boolean {
  return p.startsWith('.') || p.startsWith('@/') || p.startsWith('src/');
}

let allViolations: Violation[] = [];

beforeAll(() => {
  allViolations = [];
  if (!existsSync(MODULES_DIR)) return; // skip pre-fase-1

  for (const file of walkFiles(MODULES_DIR)) {
    const content = readFileSync(file, 'utf-8');
    const imports = findImports(content);

    const relFile = file.replace(process.cwd() + '/', '');

    for (const { line, importPath } of imports) {
      if (!isInternalImport(importPath)) continue;

      // Normalize path
      const normalized = importPath.replace(/^@\//, 'src/');

      // === Rule: domain TIDAK boleh import infrastructure/interfaces/application/presentation
      if (relFile.includes('/modules/') && relFile.includes('/domain/')) {
        if (
          normalized.includes('/infrastructure/') ||
          normalized.includes('/interfaces/') ||
          normalized.includes('/application/') ||
          normalized.includes('/presentation/')
        ) {
          // Boleh import dari domain sendiri modul yang sama
          const fileModule = relFile.match(/modules\/([^/]+)\/domain/)?.[1];
          const importModule = normalized.match(/modules\/([^/]+)\//)?.[1];
          if (fileModule && importModule && fileModule !== importModule) {
            allViolations.push({
              file: relFile,
              line,
              importPath,
              rule: 'domain-tidak-boleh-import-module-lain',
            });
          } else if (normalized.includes('/infrastructure/') || normalized.includes('/interfaces/')) {
            allViolations.push({
              file: relFile,
              line,
              importPath,
              rule: 'domain-tidak-boleh-import-infra-atau-interfaces',
            });
          }
        }
      }
    }
  }
});

describe('Layer Purity (Hexagonal)', () => {
  it('domain TIDAK boleh import infrastructure/interfaces/application module lain', () => {
    if (!existsSync(MODULES_DIR)) {
      // Pre-fase-1: tidak ada modules/, skip
      expect(true).toBe(true);
      return;
    }

    if (allViolations.length > 0) {
      const msg = allViolations
        .map((v) => `  ${v.file}:${v.line} [${v.rule}] → ${v.importPath}`)
        .join('\n');
      throw new Error(`Layer purity violations:\n${msg}`);
    }

    expect(allViolations).toEqual([]);
  });
});
