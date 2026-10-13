import { describe, expect, it } from "vitest";
import { allowedTargetsForRuntime, assertDatabaseTarget, parseDatabaseUrl } from "@/db/config";

const secret = "s3cr3t-password";
const remote = (db: string) => `postgresql://user:${secret}@ep-example.aws.neon.tech/${db}?sslmode=require`;

describe("database target validation", () => {
  it("rejects a missing or malformed URL without echoing it", () => {
    expect(() => parseDatabaseUrl(undefined)).toThrow("DATABASE_URL is not set.");
    expect(() => parseDatabaseUrl("not a url")).toThrow("not a valid URL");
    expect(() => parseDatabaseUrl(`mysql://u:${secret}@h/db`)).toThrow(/scheme/);
  });

  it("requires TLS for remote databases", () => {
    expect(() => parseDatabaseUrl(`postgresql://u:${secret}@ep.neon.tech/tidynest_cms_dev`)).toThrow(/TLS/);
    expect(parseDatabaseUrl(remote("tidynest_cms_dev")).isLocal).toBe(false);
    expect(parseDatabaseUrl("postgresql://u@localhost:5432/tidynest_cms_qa").isLocal).toBe(true);
  });

  it("only allows the production database in a Vercel production deployment", () => {
    expect(allowedTargetsForRuntime({ VERCEL_ENV: "production" })).toEqual(["production"]);
    expect(allowedTargetsForRuntime({ VERCEL_ENV: "preview" })).toEqual(["development", "qa"]);
    expect(allowedTargetsForRuntime({})).toEqual(["development", "qa"]);
    expect(() => assertDatabaseTarget(remote("tidynest_cms_prod"), ["development", "qa"])).toThrow(
      /tidynest_cms_dev or tidynest_cms_qa/,
    );
  });

  it("rejects databases belonging to other projects, including the previous TidyNest site", () => {
    for (const name of ["tidynest_dev", "tidynest_prod", "neondb", "postgres"]) {
      expect(() => assertDatabaseTarget(remote(name), ["development", "qa"])).toThrow();
    }
  });

  it("requires the QA database to be local", () => {
    expect(() => assertDatabaseTarget(remote("tidynest_cms_qa"), ["development", "qa"])).toThrow(/local/);
  });

  it("never includes credentials in error messages", () => {
    const attempts = [
      () => assertDatabaseTarget(remote("tidynest_prod"), ["development"]),
      () => parseDatabaseUrl(`postgresql://u:${secret}@ep.neon.tech/x`),
    ];
    for (const attempt of attempts) {
      try {
        attempt();
      } catch (error) {
        expect(String(error)).not.toContain(secret);
        expect(String(error)).not.toContain("neon.tech");
      }
    }
  });
});
