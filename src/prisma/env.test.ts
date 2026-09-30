import { describe, expect, it } from "vitest";
import { ConfigurationError, readDatabaseUrl } from "./env";

const URL = "postgresql://scholars:secret@db.internal:5432/scholars";

describe("readDatabaseUrl", () => {
  it("returns a valid postgres:// URL", () => {
    expect(readDatabaseUrl({ DATABASE_URL: URL })).toBe(URL);
  });

  it("accepts the postgresql:// spelling", () => {
    expect(readDatabaseUrl({ DATABASE_URL: "postgresql://localhost/scholars" })).toBe(
      "postgresql://localhost/scholars",
    );
  });

  it("names the missing variable when it is absent", () => {
    expect(() => readDatabaseUrl({})).toThrow(/DATABASE_URL is required/);
  });

  it("rejects an empty value rather than passing it to the driver", () => {
    expect(() => readDatabaseUrl({ DATABASE_URL: "" })).toThrow(/DATABASE_URL is required/);
  });

  it("rejects a URL that is not a PostgreSQL connection string", () => {
    for (const bad of ["file:./dev.db", "https://db.example.com", "mysql://u:p@h:3306/d"]) {
      expect(() => readDatabaseUrl({ DATABASE_URL: bad }), bad).toThrow(
        /must be a PostgreSQL connection string/,
      );
    }
  });

  it("carries the variable name as structured detail, not in the message", () => {
    try {
      readDatabaseUrl({});
      expect.unreachable("expected a configuration failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).details).toEqual({ variable: "DATABASE_URL" });
    }
  });

  it("never puts the connection string into the error, since it carries a password", () => {
    try {
      readDatabaseUrl({ DATABASE_URL: `${URL}/extra?sslmode=require` });
      expect.unreachable("expected a configuration failure");
    } catch (error) {
      // A bad value is reported without echoing it back.
      expect(() => readDatabaseUrl({ DATABASE_URL: "sqlite://x" })).toThrow(ConfigurationError);
      const serialized = JSON.stringify({
        message: (error as Error).message,
        details: (error as ConfigurationError).details,
      });
      expect(serialized).not.toContain("secret");
    }
  });
});
