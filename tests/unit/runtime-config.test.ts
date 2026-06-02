import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { collectProductionConfigIssues } from "@/lib/config/runtime";

describe("collectProductionConfigIssues", () => {
  it("flags missing DATABASE_URL and disabled API auth", () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalAuth = process.env.REQUIRE_API_AUTH;

    delete process.env.DATABASE_URL;
    process.env.REQUIRE_API_AUTH = "false";

    try {
      const issues = collectProductionConfigIssues();
      const codes = issues.map((issue) => issue.code);
      assert.ok(codes.includes("database_url_missing"));
      assert.ok(codes.includes("api_auth_disabled"));
    } finally {
      if (originalDatabaseUrl !== undefined) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
      if (originalAuth !== undefined) {
        process.env.REQUIRE_API_AUTH = originalAuth;
      }
    }
  });
});
