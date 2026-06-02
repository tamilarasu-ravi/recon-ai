"use client";

import { useCallback, useEffect, useState } from "react";

import { PageLayout } from "@/app/components/page-layout";
import { useTenant } from "@/app/components/tenant-provider";
import { apiFetch, getClientApiKey, setClientApiKey } from "@/lib/ui/api-fetch";

interface ApiKeyListItem {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: string;
}

interface WebhookSecretListItem {
  id: string;
  name: string;
  secretPrefix: string;
  isActive: boolean;
  createdAt: string;
}

/**
 * Settings — API keys for programmatic access and ERP integration status.
 *
 * @returns Settings page.
 */
export function SettingsClient(): React.ReactElement {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [keys, setKeys] = useState<ApiKeyListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState(getClientApiKey() ?? "");
  const [newKeyName, setNewKeyName] = useState("integration");
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [webhookSecrets, setWebhookSecrets] = useState<WebhookSecretListItem[]>([]);
  const [newWebhookName, setNewWebhookName] = useState("card-processor");
  const [createdRawWebhookSecret, setCreatedRawWebhookSecret] = useState<string | null>(null);

  const loadKeys = useCallback(async (): Promise<void> => {
    if (!tenantId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [keysResponse, webhookResponse] = await Promise.all([
        apiFetch(`/api/api-keys?tenant_id=${encodeURIComponent(tenantId)}`),
        apiFetch(`/api/webhook-secrets?tenant_id=${encodeURIComponent(tenantId)}`),
      ]);

      if (!keysResponse.ok) {
        const body = (await keysResponse.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${keysResponse.status}`);
      }

      const keysData = (await keysResponse.json()) as { keys: ApiKeyListItem[] };
      setKeys(keysData.keys);

      if (webhookResponse.ok) {
        const webhookData = (await webhookResponse.json()) as { secrets: WebhookSecretListItem[] };
        setWebhookSecrets(webhookData.secrets);
      } else {
        setWebhookSecrets([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
      setKeys([]);
      setWebhookSecrets([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantLoading && tenantId) {
      void loadKeys();
    }
  }, [tenantLoading, tenantId, loadKeys]);

  function saveBrowserKey(): void {
    setClientApiKey(apiKeyInput);
    setError(null);
  }

  async function createWebhookSecret(): Promise<void> {
    if (!tenantId) {
      return;
    }

    setLoading(true);
    setCreatedRawWebhookSecret(null);

    try {
      const response = await apiFetch("/api/webhook-secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, name: newWebhookName }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { raw_secret: string };
      setCreatedRawWebhookSecret(data.raw_secret);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create webhook secret");
    } finally {
      setLoading(false);
    }
  }

  async function createKey(): Promise<void> {
    if (!tenantId) {
      return;
    }

    setLoading(true);
    setCreatedRawKey(null);

    try {
      const response = await apiFetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, name: newKeyName }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { raw_key: string };
      setCreatedRawKey(data.raw_key);
      setApiKeyInput(data.raw_key);
      setClientApiKey(data.raw_key);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setLoading(false);
    }
  }

  const erpProvider = process.env.NEXT_PUBLIC_ERP_PROVIDER ?? "mock (server ERP_PROVIDER)";

  return (
    <PageLayout
      title="Settings"
      subtitle="API keys, browser session, and integration configuration."
      loading={loading}
      blocking={loading}
      blockingLabel="Working…"
    >
      {error ? <p className="alert alert--error">{error}</p> : null}

      <section className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 className="panel__title">Browser API key</h2>
        <p className="panel__desc">
          Stored in sessionStorage and sent as <code>Authorization: Bearer</code> on API calls.
          Required when <code>REQUIRE_API_AUTH=true</code>.
        </p>
        <div className="form-field" style={{ marginBottom: "0.75rem" }}>
          <input
            className="input"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="recon_…"
            aria-label="API key"
          />
        </div>
        <button type="button" className="btn btn--secondary" onClick={saveBrowserKey}>
          Save for this browser
        </button>
      </section>

      <section className="panel panel--muted" style={{ marginBottom: "1.5rem" }}>
        <h2 className="panel__title">Create tenant API key</h2>
        <div className="form-row">
          <div className="form-field">
            <label className="form-label" htmlFor="key-name">
              Label
            </label>
            <input
              id="key-name"
              className="input"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn--primary" disabled={loading} onClick={() => void createKey()}>
            Generate key
          </button>
        </div>
        {createdRawKey ? (
          <p className="alert alert--warning" style={{ marginTop: "0.75rem" }}>
            Copy now — shown once: <code>{createdRawKey}</code>
          </p>
        ) : null}

        <ul className="api-list" style={{ marginTop: "1rem" }}>
          {keys.map((key) => (
            <li key={key.id}>
              {key.name} · <code>{key.keyPrefix}…</code> ·{" "}
              {key.isActive ? "active" : "inactive"}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel panel--muted" style={{ marginBottom: "1.5rem" }}>
        <h2 className="panel__title">Webhook signing secrets</h2>
        <p className="panel__desc">
          HMAC-signed ingest at{" "}
          <code>POST /api/webhooks/transactions?tenant_slug=…</code>. See{" "}
          <code>docs/webhook-ingest.md</code>.
        </p>
        <div className="form-row">
          <div className="form-field">
            <label className="form-label" htmlFor="webhook-name">
              Label
            </label>
            <input
              id="webhook-name"
              className="input"
              value={newWebhookName}
              onChange={(e) => setNewWebhookName(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn--primary"
            disabled={loading}
            onClick={() => void createWebhookSecret()}
          >
            Generate webhook secret
          </button>
        </div>
        {createdRawWebhookSecret ? (
          <p className="alert alert--warning" style={{ marginTop: "0.75rem" }}>
            Copy now — shown once: <code>{createdRawWebhookSecret}</code>
          </p>
        ) : null}
        <ul className="api-list" style={{ marginTop: "1rem" }}>
          {webhookSecrets.map((secret) => (
            <li key={secret.id}>
              {secret.name} · <code>{secret.secretPrefix}…</code> ·{" "}
              {secret.isActive ? "active" : "inactive"}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="panel__title">ERP integration</h2>
        <p className="panel__desc">
          AUTO_TAG transactions post to the configured adapter after orchestrator persist. Sandbox
          mock provider is default.
        </p>
        <p style={{ fontSize: "0.875rem" }}>
          Provider: <strong>{erpProvider}</strong>
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "0.5rem" }}>
          Set <code>ERP_PROVIDER=mock</code> in server env. QuickBooks/Xero sandbox adapters reuse mock
          until OAuth ships.
        </p>
      </section>
    </PageLayout>
  );
}
