import { inject, injectable } from "tsyringe";
import { randomInt, createHash, randomUUID } from "crypto";
import { CaptchaStore } from "@domain/repositories/CaptchaStore.js";

const CAPTCHA_TTL_SECONDS = 5 * 60; // 5 menit, sekali pakai

export interface CaptchaChallenge {
  challengeId: string;
  question: string;
}

@injectable()
export class CaptchaService {
  constructor(
    @inject("CaptchaStore") private store: CaptchaStore
  ) {}

  /**
   * Challenge in-app sederhana (penjumlahan dua angka) — tanpa pihak ketiga.
   * Kontrak FE: kirim `captcha: { challengeId, answer }` di body login.
   */
  async createChallenge(): Promise<CaptchaChallenge> {
    const a = randomInt(1, 20);
    const b = randomInt(1, 20);
    const challengeId = randomUUID();
    const answerHash = this.hash(String(a + b));
    await this.store.save(challengeId, answerHash, CAPTCHA_TTL_SECONDS);
    return { challengeId, question: `What is ${a} + ${b}?` };
  }

  /** Verify jawaban — challenge langsung dihapus (sekali pakai). */
  async verify(challengeId: string, answer: string): Promise<boolean> {
    const expectedHash = await this.store.getAndDelete(challengeId);
    if (!expectedHash) return false;
    return expectedHash === this.hash(answer.trim());
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
