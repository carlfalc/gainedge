import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const config = readFileSync(resolve(here, "../../supabase/config.toml"), "utf8");
const source = readFileSync(
  resolve(here, "../../supabase/functions/ron-post-v4-data-readiness/index.ts"),
  "utf8",
);

describe("2D.2y — post-freeze data-readiness auth config", () => {
  it("pins the function gateway to its internal fail-closed authorization boundary", () => {
    expect(config).toMatch(
      /\[functions\.ron-post-v4-data-readiness\]\s*\nverify_jwt\s*=\s*false/,
    );
  });

  it("retains explicit service-role or cron-token authorization in the endpoint", () => {
    expect(source).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).toContain("ron_verify_cron_token");
    expect(source).toContain('if (!authorized) return json({ error: "unauthorized" }, 401)');
  });
});
