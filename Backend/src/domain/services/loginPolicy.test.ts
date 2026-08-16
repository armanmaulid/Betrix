import { describe, it, expect } from "vitest";
import {
  computeLoginDelaySeconds,
  isCaptchaRequired,
  CAPTCHA_REQUIRED_MIN_FAILURES,
  DELAY_START_MIN_FAILURES,
  DELAY_CAP_SECONDS,
} from "./loginPolicy.js";

describe("loginPolicy", () => {
  describe("computeLoginDelaySeconds", () => {
    it("returns 0 for failures below the delay threshold", () => {
      expect(computeLoginDelaySeconds(0)).toBe(0);
      expect(computeLoginDelaySeconds(DELAY_START_MIN_FAILURES - 1)).toBe(0);
    });

    it("starts at 1s at the delay threshold and doubles", () => {
      expect(computeLoginDelaySeconds(DELAY_START_MIN_FAILURES)).toBe(1);
      expect(computeLoginDelaySeconds(DELAY_START_MIN_FAILURES + 1)).toBe(2);
      expect(computeLoginDelaySeconds(DELAY_START_MIN_FAILURES + 2)).toBe(4);
    });

    it("caps the delay", () => {
      // 2^5 = 32 > cap 30
      expect(computeLoginDelaySeconds(DELAY_START_MIN_FAILURES + 5)).toBe(DELAY_CAP_SECONDS);
      expect(computeLoginDelaySeconds(100)).toBe(DELAY_CAP_SECONDS);
    });
  });

  describe("isCaptchaRequired", () => {
    it("requires captcha at or above the threshold", () => {
      expect(isCaptchaRequired(CAPTCHA_REQUIRED_MIN_FAILURES - 1)).toBe(false);
      expect(isCaptchaRequired(CAPTCHA_REQUIRED_MIN_FAILURES)).toBe(true);
      expect(isCaptchaRequired(10)).toBe(true);
    });
  });
});
