import { describe, expect, it } from "vitest";
import {
  buildCertificateHash,
  decryptSecret,
  encryptSecret,
  generateVerificationCode,
  hashPassword,
  verifyPassword,
} from "../crypto";

describe("crypto utilities", () => {
  it("hashes and verifies passwords with Argon2id", async () => {
    const hash = await hashPassword("FrateliSecure2026!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "FrateliSecure2026!")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("encrypts and decrypts Google OAuth tokens with AES-256-GCM", () => {
    const token = "1//0g_sample_refresh_token_xyz";
    const encrypted = encryptSecret(token);
    expect(encrypted).not.toContain(token);
    expect(decryptSecret(encrypted)).toBe(token);
  });

  it("generates valid FRT verification codes and deterministic SHA-256 hashes", () => {
    const code = generateVerificationCode(2026);
    expect(code).toMatch(/^FRT-2026-[A-HJ-NP-Z2-9]{8}$/);

    const h1 = buildCertificateHash({
      certificateId: "c1",
      courseId: "k1",
      finalGradePct: "95.00",
      issuedAt: "2026-11-23T00:00:00.000Z",
      studentId: "s1",
    });
    const h2 = buildCertificateHash({
      certificateId: "c1",
      courseId: "k1",
      finalGradePct: "95.00",
      issuedAt: "2026-11-23T00:00:00.000Z",
      studentId: "s1",
    });
    expect(h1).toHaveLength(64);
    expect(h1).toBe(h2);
  });
});
