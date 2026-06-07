import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isHyperdriveConnectionString,
  resolveDatabaseConnectionString,
} from "@/lib/db/resolve-connection-string";

describe("resolveDatabaseConnectionString", () => {
  it("prefers explicit DATABASE_URL", () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://user:pass@example.com:5432/db";
    try {
      assert.equal(
        resolveDatabaseConnectionString(),
        "postgresql://user:pass@example.com:5432/db",
      );
    } finally {
      if (original === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = original;
      }
    }
  });

  it("detects Hyperdrive proxy hostnames", () => {
    assert.equal(isHyperdriveConnectionString("postgresql://user:pass@localhost:5432/db"), true);
    assert.equal(
      isHyperdriveConnectionString(
        "postgresql://user:pass@ep-xxx-pooler.aws.neon.tech/neondb?sslmode=require",
      ),
      false,
    );
  });
});
