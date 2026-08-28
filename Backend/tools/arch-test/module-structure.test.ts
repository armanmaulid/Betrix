// tools/arch-test/module-structure.test.ts
// Verifikasi struktur folder modules/<x>/ konsisten.
// Setiap module WAJIB punya folder: domain, application, infrastructure, presentation
// dan file barrel <x>.module.ts

import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');
const MODULES_DIR = join(SRC_DIR, 'modules');

function exists(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

describe('Module Structure', () => {
  it('src/modules/ folder exists or no modules yet (pre-fase-1)', () => {
    // Sebelum fase 1, folder modules/ belum ada — skip
    if (!exists(MODULES_DIR)) {
      expect(exists(MODULES_DIR)).toBe(false);
      return;
    }

    // Kalau ada, harus ada minimal 1 modul
    const modules = readdirSync(MODULES_DIR).filter((name) => {
      const full = join(MODULES_DIR, name);
      return statSync(full).isDirectory();
    });

    expect(modules.length).toBeGreaterThan(0);
  });

  it('setiap module WAJIB punya barrel file <name>.module.ts', () => {
    if (!exists(MODULES_DIR)) return;

    const modules = readdirSync(MODULES_DIR).filter((name) => {
      const full = join(MODULES_DIR, name);
      return statSync(full).isDirectory();
    });

    for (const mod of modules) {
      const barrelPath = join(MODULES_DIR, mod, `${mod}.module.ts`);
      expect(
        existsSync(barrelPath),
        `Module "${mod}" harus punya barrel file di: ${barrelPath}`,
      ).toBe(true);
    }
  });

  it('setiap module WAJIB punya folder domain/, application/, infrastructure/, presentation/', () => {
    if (!exists(MODULES_DIR)) return;

    const required = ['domain', 'application', 'infrastructure', 'presentation'];
    const modules = readdirSync(MODULES_DIR).filter((name) => {
      const full = join(MODULES_DIR, name);
      return statSync(full).isDirectory();
    });

    for (const mod of modules) {
      for (const folder of required) {
        const folderPath = join(MODULES_DIR, mod, folder);
        expect(
          exists(folderPath),
          `Module "${mod}" harus punya folder "${folder}/" di: ${folderPath}`,
        ).toBe(true);
      }
    }
  });
});
