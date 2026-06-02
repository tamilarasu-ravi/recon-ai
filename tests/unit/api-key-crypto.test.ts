import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateApiKeyMaterial, hashApiKey } from "../../src/lib/auth/api-key-crypto";

describe("api-key-crypto", () => {
  it("hashes keys deterministically", () => {
    const hashA = hashApiKey("recon_test_key");
    const hashB = hashApiKey("recon_test_key");
    assert.equal(hashA, hashB);
  });

  it("generates recon-prefixed material", () => {
    const material = generateApiKeyMaterial();
    assert.ok(material.rawKey.startsWith("recon_"));
    assert.equal(hashApiKey(material.rawKey), material.keyHash);
  });
});
