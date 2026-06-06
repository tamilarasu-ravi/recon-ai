import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertPermission, roleHasPermission } from "@/lib/auth/rbac";

describe("rbac", () => {
  it("viewer can read but not ingest", () => {
    assert.equal(roleHasPermission("viewer", "tenant:read"), true);
    assert.equal(roleHasPermission("viewer", "ingest:write"), false);
  });

  it("accountant can review and ingest", () => {
    assert.equal(roleHasPermission("accountant", "review:write"), true);
    assert.equal(roleHasPermission("accountant", "policy:admin"), false);
  });

  it("admin has platform permissions", () => {
    assert.equal(roleHasPermission("admin", "platform:admin"), true);
    assert.equal(roleHasPermission("admin", "policy:admin"), true);
  });

  it("open dev mode (null role) allows all", () => {
    assert.equal(roleHasPermission(null, "platform:admin"), true);
    assert.doesNotThrow(() => assertPermission(null, "platform:admin"));
  });

  it("assertPermission throws for viewer writing ingest", () => {
    assert.throws(
      () => assertPermission("viewer", "ingest:write"),
      /Forbidden: ingest:write/,
    );
  });
});
