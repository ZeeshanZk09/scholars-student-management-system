/**
 * The persisted shape of a credential — the three `user_credentials` columns taken together
 * (`src/db/schema/identity.ts`).
 *
 * Lives in `domain/` because it is a pure data shape: the application layer must be able to
 * say "here is the hash to store" without importing the Argon2 adapter that produced it.
 */
export interface StoredPassword {
  readonly passwordHash: string;
  readonly algorithm: "argon2id";
  readonly parameters: Readonly<Record<string, number>>;
}
