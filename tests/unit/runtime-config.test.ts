import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectProductionConfigIssues,
  isSettingsApiKeyAdminVisible,
  isSettingsDevToolsVisible,
  isSettingsIntegrationsVisible,
} from "@/lib/config/runtime";

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

describe("isSettingsIntegrationsVisible", () => {
  it("defaults to hidden when SETTINGS_SHOW_INTEGRATIONS is unset or false", () => {
    const original = process.env.SETTINGS_SHOW_INTEGRATIONS;

    delete process.env.SETTINGS_SHOW_INTEGRATIONS;
    assert.equal(isSettingsIntegrationsVisible(), false);

    process.env.SETTINGS_SHOW_INTEGRATIONS = "false";
    assert.equal(isSettingsIntegrationsVisible(), false);

    if (original !== undefined) {
      process.env.SETTINGS_SHOW_INTEGRATIONS = original;
    } else {
      delete process.env.SETTINGS_SHOW_INTEGRATIONS;
    }
  });

  it("returns true only when SETTINGS_SHOW_INTEGRATIONS=true", () => {
    const original = process.env.SETTINGS_SHOW_INTEGRATIONS;
    process.env.SETTINGS_SHOW_INTEGRATIONS = "true";
    try {
      assert.equal(isSettingsIntegrationsVisible(), true);
    } finally {
      if (original !== undefined) {
        process.env.SETTINGS_SHOW_INTEGRATIONS = original;
      } else {
        delete process.env.SETTINGS_SHOW_INTEGRATIONS;
      }
    }
  });
});

describe("isSettingsDevToolsVisible", () => {
  it("defaults to hidden when SETTINGS_SHOW_DEV_TOOLS is unset or false", () => {
    const original = process.env.SETTINGS_SHOW_DEV_TOOLS;

    delete process.env.SETTINGS_SHOW_DEV_TOOLS;
    assert.equal(isSettingsDevToolsVisible(), false);

    process.env.SETTINGS_SHOW_DEV_TOOLS = "false";
    assert.equal(isSettingsDevToolsVisible(), false);

    if (original !== undefined) {
      process.env.SETTINGS_SHOW_DEV_TOOLS = original;
    } else {
      delete process.env.SETTINGS_SHOW_DEV_TOOLS;
    }
  });

  it("returns true only when SETTINGS_SHOW_DEV_TOOLS=true", () => {
    const original = process.env.SETTINGS_SHOW_DEV_TOOLS;
    process.env.SETTINGS_SHOW_DEV_TOOLS = "true";
    try {
      assert.equal(isSettingsDevToolsVisible(), true);
    } finally {
      if (original !== undefined) {
        process.env.SETTINGS_SHOW_DEV_TOOLS = original;
      } else {
        delete process.env.SETTINGS_SHOW_DEV_TOOLS;
      }
    }
  });
});

describe("isSettingsApiKeyAdminVisible", () => {
  it("defaults to hidden when SETTINGS_SHOW_API_KEY_ADMIN is unset or false", () => {
    const original = process.env.SETTINGS_SHOW_API_KEY_ADMIN;

    delete process.env.SETTINGS_SHOW_API_KEY_ADMIN;
    assert.equal(isSettingsApiKeyAdminVisible(), false);

    process.env.SETTINGS_SHOW_API_KEY_ADMIN = "false";
    assert.equal(isSettingsApiKeyAdminVisible(), false);

    if (original !== undefined) {
      process.env.SETTINGS_SHOW_API_KEY_ADMIN = original;
    } else {
      delete process.env.SETTINGS_SHOW_API_KEY_ADMIN;
    }
  });

  it("returns true only when SETTINGS_SHOW_API_KEY_ADMIN=true", () => {
    const original = process.env.SETTINGS_SHOW_API_KEY_ADMIN;
    process.env.SETTINGS_SHOW_API_KEY_ADMIN = "true";
    try {
      assert.equal(isSettingsApiKeyAdminVisible(), true);
    } finally {
      if (original !== undefined) {
        process.env.SETTINGS_SHOW_API_KEY_ADMIN = original;
      } else {
        delete process.env.SETTINGS_SHOW_API_KEY_ADMIN;
      }
    }
  });
});
