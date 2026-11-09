import { describe, expect, it } from "vitest";
import { ARGON2ID_PARAMETERS, hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("produces a self-describing argon2id hash with the recorded parameters", async () => {
    const stored = await hashPassword("purple-monorail-tuesday-42");
    expect(stored.algorithm).toBe("argon2id");
    expect(stored.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(stored.parameters).toEqual({ ...ARGON2ID_PARAMETERS });
  });

  it("salts: the same password hashes differently every time", async () => {
    const a = await hashPassword("purple-monorail-tuesday-42");
    const b = await hashPassword("purple-monorail-tuesday-42");
    expect(a.passwordHash).not.toBe(b.passwordHash);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password and rejects the wrong one", async () => {
    const stored = await hashPassword("purple-monorail-tuesday-42");
    await expect(verifyPassword("purple-monorail-tuesday-42", stored)).resolves.toBe(true);
    await expect(verifyPassword("purple-monorail-tuesday-43", stored)).resolves.toBe(false);
  });

  it("rejects everything for a credential with no hash (invited user)", async () => {
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
    await expect(verifyPassword("anything", undefined)).resolves.toBe(false);
    await expect(verifyPassword("anything", { passwordHash: "" })).resolves.toBe(false);
  });

  it("treats a corrupt hash as a failure, not an exception", async () => {
    await expect(
      verifyPassword("anything", { passwordHash: "$argon2id$not-a-real-hash" }),
    ).resolves.toBe(false);
  });
});
