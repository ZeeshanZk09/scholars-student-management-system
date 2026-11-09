import { describe, expect, it } from "vitest";
import { generateToken, hashToken, TOKEN_BYTES } from "./security-token";

describe("generateToken", () => {
  it("is URL-safe and long enough for 256 bits", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // base64url of 32 bytes is 43 characters without padding.
    expect(token).toHaveLength(Math.ceil((TOKEN_BYTES * 8) / 6));
  });

  it("does not repeat", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) seen.add(generateToken());
    expect(seen.size).toBe(100);
  });
});

describe("hashToken", () => {
  it("is the lowercase hex SHA-256 of the token", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic and distinct for distinct tokens", () => {
    const a = generateToken();
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(generateToken()));
  });

  it("never returns the token itself", () => {
    const token = generateToken();
    expect(hashToken(token)).not.toContain(token);
  });
});
