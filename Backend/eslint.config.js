import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",

      // DDD boundary guardrail: lapisan domain tidak boleh tahu apa pun di luarnya.
      // Pelanggaran yang terdeteksi di sini dibereskan di Phase 2-4.
      "import/no-restricted-paths": ["error", {
        zones: [
          {
            target: "./src/domain",
            from: [
              "./src/application",
              "./src/config",
              "./src/data",
              "./src/infrastructure",
              "./src/presentation",
            ],
          },
          {
            // Keputusan Phase 3 (opsi A): domain hanya boleh memakai @core/errors
            // (domain exceptions). @core lainnya tetap dilarang.
            // Catatan: except di-resolve relatif terhadap `from` (bukan cwd).
            target: "./src/domain",
            from: "./src/core",
            except: ["./errors"],
          },

          // Phase 7 — Bounded context guardrail.
          // Catatan: glob `*` di target/from tidak cocok dengan path absolut Windows
          // (minimatch tanpa opsi windowsPathsNoEscape), jadi tiap konteks memakai
          // zone eksplisit (mekanisme containsPath, sama seperti zone ./src/domain).
          //
          // 1) Shared kernel (src/domain global) tidak boleh tahu konteks apa pun.
          {
            target: "./src/domain",
            from: "./src/contexts",
          },
          // 2) Konteks `news`: domain konteks tidak boleh import application/infrastructure
          //    (domain konteks = lapisan paling dalam, mirror src/domain).
          {
            target: "./src/contexts/news/domain",
            from: ["./src/contexts/news/application", "./src/contexts/news/infrastructure"],
          },
          // 3) Konteks `news`: domain konteks hanya boleh memakai @core/errors.
          {
            target: "./src/contexts/news/domain",
            from: "./src/core",
            except: ["./errors"],
          },
        ],
      }],
    },
  }
);