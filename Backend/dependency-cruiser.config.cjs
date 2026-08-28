// dependency-cruiser.config.cjs
// Enforce module boundaries untuk hexagonal architecture + modular monolith
//
// Aturan:
// 1. domain/** TIDAK boleh import infrastructure/** atau presentation/**
// 2. infrastructure/** TIDAK boleh import presentation/**
// 3. application/** TIDAK boleh import presentation/**
// 4. modules/<x>/** TIDAK boleh import internal modules/<y>/** (cuma via barrel)
// 5. shared/** boleh di-import siapa saja
// 6. core/** boleh di-import siapa saja (tapi TIDAK boleh import domain/ aplikasi)

const path = require('node:path');

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // === HEXAGONAL: domain tidak boleh tahu infra/presentation ===
    {
      name: 'no-domain-to-infra',
      severity: 'error',
      comment: 'Domain layer tidak boleh depend on infrastructure layer',
      from: { path: '^src/modules/[^/]+/domain/' },
      to: { path: '^src/(infrastructure|interfaces)/' },
    },
    {
      name: 'no-domain-to-presentation',
      severity: 'error',
      comment: 'Domain layer tidak boleh depend on presentation/interface layer',
      from: { path: '^src/modules/[^/]+/domain/' },
      to: { path: '^src/interfaces/' },
    },
    {
      name: 'no-domain-to-application-presentation',
      severity: 'error',
      comment: 'Domain layer TIDAK boleh import dari application/presentation modul lain (harus via port)',
      from: { path: '^src/modules/[^/]+/domain/' },
      to: { path: '^src/modules/[^/]+/(application|presentation|infrastructure|events)/' },
    },
    {
      name: 'no-domain-to-other-modules-internal',
      severity: 'error',
      comment: 'Module X domain TIDAK boleh import module Y (harus via barrel atau event bus)',
      from: { path: '^src/modules/([^/]+)/domain/' },
      to: { path: '^src/modules/(?!(?:\\1)\\b)[^/]+/' },
    },

    // === APPLICATION layer rules ===
    {
      name: 'no-application-to-presentation',
      severity: 'error',
      comment: 'Application layer tidak boleh depend on presentation layer',
      from: { path: '^src/modules/[^/]+/application/' },
      to: { path: '^src/interfaces/' },
    },
    {
      name: 'no-application-to-other-modules-internal',
      severity: 'error',
      comment: 'Application module X TIDAK boleh import application module Y (harus via barrel atau event). Test files dikecualikan.',
      from: { path: '^src/modules/([^/]+)/application/', pathNot: '\\.test\\.ts$' },
      to: { path: '^src/modules/(?!(?:\\1)\\b)[^/]+/application/' },
    },
    {
      name: 'no-application-to-infra-persistence',
      severity: 'info',
      comment: 'Application sebaiknya pakai port, bukan langsung ke infrastructure persistence',
      from: { path: '^src/modules/[^/]+/application/' },
      to: { path: '^src/infrastructure/persistence/providers/' },
    },

    // === INFRASTRUCTURE layer rules ===
    {
      name: 'no-infra-to-presentation',
      severity: 'error',
      comment: 'Infrastructure TIDAK boleh depend on presentation',
      from: { path: '^src/infrastructure/' },
      to: { path: '^src/interfaces/' },
    },
    {
      name: 'no-infra-to-application',
      severity: 'error',
      comment: 'Infrastructure TIDAK boleh depend on application layer',
      from: { path: '^src/infrastructure/' },
      to: { path: '^src/modules/[^/]+/application/' },
    },
    {
      name: 'no-infra-to-other-module-domain',
      severity: 'error',
      comment: 'Infrastructure TIDAK boleh import domain module lain (cuma boleh domain modul sendiri atau shared)',
      from: { path: '^src/infrastructure/' },
      to: { path: '^src/modules/([^/]+)/(domain|application)/' },
    },

    // === MODULE isolation: tidak boleh import internal module lain ===
    // Pengecualian:
    //  - Co-located test files (*.test.ts) — best practice
    //  - Barrel export files (*.module.ts di root module) — by design export internal
    {
      name: 'no-cross-module-internal-imports',
      severity: 'error',
      comment: 'Module internal tidak boleh di-import langsung dari module lain. Pengecualian: barrel (*.module.ts) dan co-located tests (*.test.ts).',
      from: {
        path: '^src/modules/([^/]+)/',
        pathNot: '\\.(test|module)\\.ts$',
      },
      to: {
        path: '^src/modules/(?!(?:\\1)\\b)[^/]+/',
        pathNot: '\\.test\\.ts$',
      },
    },

    // === SHARED boleh diakses, tapi shared tidak boleh import modules ===
    {
      name: 'no-shared-to-modules',
      severity: 'error',
      comment: 'Shared/kernel TIDAK boleh depend on business modules',
      from: { path: '^src/shared/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-shared-to-infra',
      severity: 'error',
      comment: 'Shared/kernel TIDAK boleh depend on infrastructure (cuma port/interface)',
      from: { path: '^src/shared/' },
      to: { path: '^src/infrastructure/' },
    },

    // === No circular dependencies ===
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Tidak boleh ada circular dependency di src/',
      from: { pathNot: '^(node_modules|dist|build|coverage)' },
      to: { circular: true },
    },
  ],

  options: {
    doNotFollow: {
      path: '(node_modules|dist|build|coverage|.git|docs)',
    },
    tsConfig: {
      fileName: './tsconfig.json',
    },
  },
};
