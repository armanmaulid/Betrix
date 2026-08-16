import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Prod-only CSP hardening.
//
// index.html punya meta CSP dengan script-src 'unsafe-inline' — itu aman
// untuk dev (React Fast Refresh butuh inline preamble dari
// @vitejs/plugin-react), tapi di produksi kita mau tanpa 'unsafe-inline'.
// Script inline yang TETAP sengaja diizinkan (anti-clickjacking di
// index.html) di-allow-list lewat hash sha256. Dev TIDAK disentuh: plugin
// ini apply: "build".
function cspProdHardening(): Plugin {
  return {
    name: "betrix:csp-prod-hardening",
    apply: "build",
    async transformIndexHtml(html) {
      return rewriteCspWithInlineScriptHashes(html);
    },
  };
}

const CSP_META_RE = /<meta\b[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/i;
const INLINE_SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

async function rewriteCspWithInlineScriptHashes(html: string): Promise<string> {
  const metaTag = html.match(CSP_META_RE);
  if (!metaTag) return html;

  // Nilai content dibungkus kutip GANDA dan berisi kutip tunggal (sintaks
  // CSP: 'self', 'unsafe-inline'), jadi regex harus spesifik kutip-ganda —
  // [^"']* akan terpotong di kutip tunggal pertama.
  const contentMatch = metaTag[0].match(/content\s*=\s*"([^"]*)"/i);
  if (!contentMatch) return html;

  // Kumpulkan isi semua <script> inline (tanpa src). Di build ini praktis
  // cuma anti-clickjacking dari index.html, tapi dihitung dinamis biar aman
  // kalau nanti ada plugin lain yang inject inline script.
  const inlineScripts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = INLINE_SCRIPT_RE.exec(html)) !== null) {
    if (!/\bsrc\s*=/.test(m[1])) inlineScripts.push(m[2]);
  }

  const hashes: string[] = [];
  for (const script of inlineScripts) {
    hashes.push(`'sha256-${await sha256Base64(script)}'`);
  }

  const directives = contentMatch[1]
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);

  const rebuilt = directives
    .map((directive) => {
      if (!/^script-src\b/.test(directive)) return directive;
      const parts = directive.split(/\s+/);
      // Buang 'unsafe-inline' dari script-src, ganti dengan hash script
      // inline yang memang disengaja. TradingView tetap di-allow-list.
      const kept = parts.filter((p) => p !== "'unsafe-inline'");
      return [...kept, ...hashes].join(" ");
    })
    .join("; ");

  const newTag = metaTag[0].replace(
    /content\s*=\s*"[^"]*"/i,
    `content="${rebuilt}"`
  );

  return html.replace(metaTag[0], newTag);
}

// sha256 (base64) via Web Crypto — global crypto tersedia di Node >= 19.
// (tsconfig.node.json menyertakan lib DOM supaya crypto/TextEncoder/btoa
// ter-typing saat `tsc -b` mengecek file ini.)
async function sha256Base64(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default defineConfig({
  plugins: [react(), cspProdHardening()],
});
