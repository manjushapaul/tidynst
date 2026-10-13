import "server-only";
import { type Algorithm, hash, verify } from "@node-rs/argon2";

/** `Algorithm.Argon2id`; the enum is an ambient const enum, which isolatedModules cannot read. */
const ARGON2ID = 2 as Algorithm;

/** argon2id with OWASP's recommended minimum parameters (19 MiB memory, 2 iterations, 1 lane). */
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Spends the same time as a real verification when the account does not exist, so response
 * timing does not reveal which email addresses have accounts.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("tidynest-dummy-password-for-timing");
  await verifyPassword(await dummyHash, password);
  return false;
}

/** Returns a problem description, or null if the password is acceptable. */
export function passwordProblem(
  password: string,
  context: { email?: string; name?: string } = {},
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  if (/^(.)\1+$/.test(password)) return "Do not repeat a single character.";
  const lower = password.toLowerCase();
  const localPart = context.email?.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart))
    return "Do not include your email address.";
  if (
    ["password", "tidynest", "qwerty", "123456"].some((word) => lower.includes(word)) &&
    password.length < 20
  ) {
    return "Avoid common words such as “password” unless the password is much longer.";
  }
  return null;
}
