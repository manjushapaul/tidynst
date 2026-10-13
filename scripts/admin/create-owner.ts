/**
 * Creates the first owner account. There is no public registration; every other account is
 * created by an owner inside the admin. Refuses to run if an owner already exists.
 *
 *   npm run admin:create-owner -- --target=development --email=you@example.com --name="Your Name"
 *   echo "$PASSWORD" | npm run admin:create-owner -- --target=qa --email=... --name=... --password-stdin
 *
 * The password is read from a hidden prompt (or stdin) and is never accepted as an argument, so
 * it does not end up in shell history or process listings.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  assertDatabaseTarget,
  DATABASE_NAMES,
  DatabaseConfigError,
  type DatabaseTarget,
} from "../../src/db/config";
import * as schema from "../../src/db/schema";
import { passwordProblem } from "../../src/server/auth/password";
import { createFirstOwner, UserInputError } from "../../src/server/users";
import { parseArgs } from "../lib/args";

function readHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) throw new UserInputError("No terminal available. Use --password-stdin.");
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          cleanup();
          stdout.write("\n");
          reject(new UserInputError("Cancelled."));
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = args.target as DatabaseTarget | undefined;
  if (!target || !(target in DATABASE_NAMES)) {
    throw new DatabaseConfigError("Pass --target=development, --target=qa or --target=production.");
  }
  if (target === "production") {
    if (process.env.CI) throw new DatabaseConfigError("Owner accounts are never created from CI.");
    if (args.confirm !== DATABASE_NAMES.production) {
      throw new DatabaseConfigError(
        `Creating the production owner requires --confirm=${DATABASE_NAMES.production}.`,
      );
    }
  }
  if (!args.email || !args.name) throw new UserInputError("Pass --email=... and --name=...");
  if (args.password) throw new UserInputError("Passwords are not accepted as arguments. Omit --password.");

  const parsed = assertDatabaseTarget(process.env.DATABASE_URL, [target]);

  let password: string;
  if (args["password-stdin"]) {
    password = await readStdin();
  } else {
    password = await readHidden("Password (hidden): ");
    const problem = passwordProblem(password, { email: args.email, name: args.name });
    if (problem) throw new UserInputError(problem);
    if ((await readHidden("Repeat password: ")) !== password)
      throw new UserInputError("Passwords do not match.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await createFirstOwner(drizzle(pool, { schema }), { email: args.email, name: args.name, password });
    console.log(`Owner account created in ${parsed.databaseName}. Sign in at /admin/login.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof DatabaseConfigError || error instanceof UserInputError) {
    console.error(error.message);
  } else if (error instanceof Error && error.name === "ZodError") {
    console.error("Invalid email or name.");
  } else {
    console.error("Could not create the owner account.");
    if (error instanceof Error) console.error((error as Error & { code?: string }).code ?? "", error.message);
  }
  process.exit(1);
});
