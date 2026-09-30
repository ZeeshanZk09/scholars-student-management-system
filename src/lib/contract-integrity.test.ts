import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { afterAll, describe, expect, it } from "vitest"

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url))
const readPrismaFile = (name: string) =>
  readFileSync(join(REPO_ROOT, "src", "prisma", name), "utf8")

/**
 * Prisma 8 emits `contract.json` and `contract.d.ts` from `contract.prisma`.
 * `tsc` type-checks happily against *stale* artifacts, so editing the contract
 * without re-running `pnpm contract:emit` fails silently at runtime instead of
 * at build time. Emitting to a temp directory and comparing hashes turns that
 * silent drift into a failing test.
 */
describe("Prisma contract artifacts are in sync with the contract source", () => {
  const outDir = mkdtempSync(join(tmpdir(), "contract-emit-"))

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true })
  })

  it("re-emits the committed storage hash", () => {
    execFileSync("pnpm", ["prisma", "contract", "emit", "--output-path", outDir], {
      cwd: REPO_ROOT,
      stdio: "ignore",
    })

    const emitted = JSON.parse(
      readFileSync(join(outDir, "contract.json"), "utf8"),
    ) as { storage: { storageHash: string } }
    const committed = JSON.parse(readPrismaFile("contract.json")) as {
      storage: { storageHash: string }
    }

    expect(emitted.storage.storageHash).toBe(committed.storage.storageHash)
  })

  it("has a contract source file for the artifacts to come from", () => {
    expect(readPrismaFile("contract.prisma").trim().length).toBeGreaterThan(0)
  })
})