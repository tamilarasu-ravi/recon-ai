"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ObservabilitySloPanel } from "@/app/components/observability-slo-panel";
import { BulkImportPanel } from "@/app/settings/bulk-import-panel";
import { DevIngestPanel } from "@/app/settings/dev-ingest-panel";
import { PageLayout } from "@/app/components/page-layout";
import { useTenant } from "@/app/components/tenant-provider";
import {
  apiFetch,
  clearClientApiKey,
  getClientApiKey,
  setClientApiKey,
} from "@/lib/ui/api-fetch";

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
  const { tenantId, loading: tenantLoading, error: tenantError, reloadTenants } = useTenant();
  const [keys, setKeys] = useState<ApiKeyListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState(getClientApiKey() ?? "");
  const [newKeyName, setNewKeyName] = useState("integration");
  const [bootstrapSlug, setBootstrapSlug] = useState("tenant-a");
  const [bootstrapSlugs, setBootstrapSlugs] = useState<string[]>(["tenant-a", "tenant-b"]);
  const [requireApiAuth, setRequireApiAuth] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showDevTools, setShowDevTools] = useState(false);
  const [showApiKeyAdmin, setShowApiKeyAdmin] = useState(false);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [webhookSecrets, setWebhookSecrets] = useState<WebhookSecretListItem[]>([]);
  const [newWebhookName, setNewWebhookName] = useState("card-processor");
  const [createdRawWebhookSecret, setCreatedRawWebhookSecret] = useState<string | null>(null);
  const [erpProvider, setErpProvider] = useState("mock");
  const [quickbooksConfigured, setQuickbooksConfigured] = useState(false);
  const [qbConnection, setQbConnection] = useState<{
    realmId: string | null;
    connectedAt: string;
  } | null>(null);
  const searchParams = useSearchParams();

  const needsBootstrap = requireApiAuth && !tenantId && !getClientApiKey();

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/settings/public");
        if (response.ok) {
          const data = (await response.json()) as {
            erp_provider: string;
            require_api_auth: boolean;
            show_integrations?: boolean;
            show_dev_tools?: boolean;
            show_api_key_admin?: boolean;
            quickbooks_oauth_configured?: boolean;
          };
          setErpProvider(data.erp_provider);
          setRequireApiAuth(data.require_api_auth);
          setShowIntegrations(data.show_integrations ?? false);
          setShowDevTools(data.show_dev_tools ?? false);
          setShowApiKeyAdmin(data.show_api_key_admin ?? false);
          setQuickbooksConfigured(data.quickbooks_oauth_configured ?? false);
        }
      } catch {
        setErpProvider("mock");
      }
    })();
  }, []);

  useEffect(() => {
    if (!needsBootstrap) {
      return;
    }

    void (async () => {
      try {
        const response = await fetch("/api/tenants/bootstrap-slugs");
        if (response.ok) {
          const data = (await response.json()) as { slugs: string[] };
          if (data.slugs.length > 0) {
            setBootstrapSlugs(data.slugs);
            setBootstrapSlug(data.slugs[0] ?? "tenant-a");
          }
        }
      } catch {
        // keep defaults
      }
    })();
  }, [needsBootstrap]);

  const loadKeys = useCallback(async (): Promise<void> => {
    if (!tenantId || !showApiKeyAdmin) {
      return;
    }

    setListLoading(true);
    setError(null);

    try {
      const keysResponse = await apiFetch(`/api/api-keys?tenant_id=${encodeURIComponent(tenantId)}`);

      if (!keysResponse.ok) {
        const body = (await keysResponse.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${keysResponse.status}`);
      }

      const keysData = (await keysResponse.json()) as { keys: ApiKeyListItem[] };
      setKeys(keysData.keys);

      if (showIntegrations) {
        const webhookResponse = await apiFetch(
          `/api/webhook-secrets?tenant_id=${encodeURIComponent(tenantId)}`,
        );
        if (webhookResponse.ok) {
          const webhookData = (await webhookResponse.json()) as { secrets: WebhookSecretListItem[] };
          setWebhookSecrets(webhookData.secrets);
        } else {
          setWebhookSecrets([]);
        }
      } else {
        setWebhookSecrets([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
      setKeys([]);
      setWebhookSecrets([]);
    } finally {
      setListLoading(false);
    }
  }, [tenantId, showIntegrations, showApiKeyAdmin]);

  const loadErpConnections = useCallback(async (): Promise<void> => {
    if (!tenantId) {
      return;
    }

    try {
      const response = await apiFetch(
        `/api/erp/connections?tenant_id=${encodeURIComponent(tenantId)}`,
      );
      if (!response.ok) {
        if (response.status === 401) {
          setError("Save your API key above and select a tenant to manage ERP connections.");
        }
        return;
      }

      const data = (await response.json()) as {
        connections: Array<{ provider: string; realmId: string | null; connectedAt: string }>;
        quickbooks_oauth_configured: boolean;
        erp_provider: string;
      };

      setErpProvider(data.erp_provider);
      setQuickbooksConfigured(data.quickbooks_oauth_configured);
      const qb = data.connections.find((row) => row.provider === "quickbooks_sandbox");
      setQbConnection(
        qb ? { realmId: qb.realmId, connectedAt: qb.connectedAt } : null,
      );
    } catch {
      setQbConnection(null);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantLoading && tenantId) {
      if (showApiKeyAdmin) {
        void loadKeys();
      } else {
        setKeys([]);
        setWebhookSecrets([]);
      }
      if (showIntegrations) {
        void loadErpConnections();
      } else {
        setQbConnection(null);
      }
    }
  }, [tenantLoading, tenantId, showIntegrations, showApiKeyAdmin, loadKeys, loadErpConnections]);

  useEffect(() => {
    if (!showIntegrations) {
      return;
    }

    const qbStatus = searchParams.get("qb");
    const qbError = searchParams.get("qb_error");
    if (qbStatus === "connected") {
      setMessage("QuickBooks connected successfully.");
      void loadErpConnections();
    } else if (qbError) {
      setError(`QuickBooks connect failed: ${decodeURIComponent(qbError)}`);
    }
  }, [searchParams, loadErpConnections, showIntegrations]);

  /**
   * Starts QuickBooks OAuth using an authenticated fetch (plain links omit the API key).
   */
  async function startQuickBooksConnect(): Promise<void> {
    if (!tenantId) {
      setError("Select a tenant in the header before connecting QuickBooks.");
      return;
    }

    setError(null);
    setActionLoading(true);

    try {
      const response = await apiFetch(
        `/api/erp/connect/quickbooks?tenant_id=${encodeURIComponent(tenantId)}`,
        { redirect: "manual" },
      );

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("Location");
        if (location) {
          window.location.href = location;
          return;
        }
      }

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "QuickBooks connect failed");
    } finally {
      setActionLoading(false);
    }
  }

  function saveBrowserKey(): void {
    setClientApiKey(apiKeyInput);
    setError(null);
    void reloadTenants();
  }

  function clearSavedBrowserKey(): void {
    clearClientApiKey();
    setApiKeyInput("");
    setError(null);
    setCreatedRawKey(null);
  }

  async function createWebhookSecret(): Promise<void> {
    if (!tenantId) {
      setError("Select a tenant first — save an API key and reload, or use Generate key below.");
      return;
    }

    setActionLoading(true);
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
      setActionLoading(false);
    }
  }

  async function createKey(): Promise<void> {
    setActionLoading(true);
    setCreatedRawKey(null);
    setError(null);

    try {
      const payload = tenantId
        ? { tenant_id: tenantId, name: newKeyName }
        : { tenant_slug: bootstrapSlug, name: newKeyName };

      const response = await apiFetch(
        "/api/api-keys",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        { omitApiKey: !tenantId },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        const message = body.error ?? `HTTP ${response.status}`;
        if (response.status === 401) {
          throw new Error(
            `${message} Run in terminal: pnpm auth:reset-keys — then paste the new recon_… key here and Save.`,
          );
        }
        throw new Error(message);
      }

      const data = (await response.json()) as { raw_key: string };
      setCreatedRawKey(data.raw_key);
      setApiKeyInput(data.raw_key);
      setClientApiKey(data.raw_key);
      await reloadTenants();
      if (tenantId) {
        await loadKeys();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setActionLoading(false);
    }
  }

  const canGenerateKey = Boolean(tenantId ?? bootstrapSlug) && !actionLoading;

  return (
    <PageLayout
      title="Settings"
      subtitle={
        showIntegrations
          ? "API keys, browser session, and integration configuration."
          : showDevTools || showApiKeyAdmin
            ? "Developer tools and observability."
            : "Quality and performance settings for your company."
      }
      loading={tenantLoading || listLoading}
      blocking={actionLoading}
      blockingLabel="Working…"
    >
      {tenantError ? <p className="alert alert--error">{tenantError}</p> : null}
      {error ? <p className="alert alert--error">{error}</p> : null}
      {message ? <p className="alert alert--success">{message}</p> : null}

      {needsBootstrap ? (
        <p className="alert alert--info" style={{ marginBottom: "1rem" }}>
          API auth is on and no key is saved yet.{" "}
          {showApiKeyAdmin ? (
            <>
              Generate your first key below (no existing key required), then click{" "}
              <strong>Save for this browser</strong> if needed and reload.
            </>
          ) : (
            <>
              Paste a key from your administrator below and click{" "}
              <strong>Save for this browser</strong>, or run{" "}
              <code>pnpm auth:reset-keys</code> locally.
            </>
          )}
        </p>
      ) : null}

      {requireApiAuth ? (
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
          <div className="btn-group">
            <button
              type="button"
              className="btn btn--secondary"
              disabled={actionLoading}
              onClick={saveBrowserKey}
            >
              Save for this browser
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={actionLoading}
              onClick={clearSavedBrowserKey}
            >
              Clear saved key
            </button>
          </div>
          <p className="panel__desc" style={{ marginTop: "0.75rem" }}>
            Stuck on &quot;Invalid or inactive API key&quot;? In the project folder run{" "}
            <code>pnpm auth:reset-keys</code>, copy the printed <code>recon_…</code> value, paste
            above, and Save.
          </p>
        </section>
      ) : null}

      {showDevTools ? (
        <>
          <DevIngestPanel tenantId={tenantId} disabled={actionLoading} />
          <BulkImportPanel tenantId={tenantId} disabled={actionLoading} />
        </>
      ) : null}

      {showApiKeyAdmin ? (
        <section className="panel panel--muted" style={{ marginBottom: "1.5rem" }}>
          <h2 className="panel__title">Create tenant API key</h2>
          {!tenantId ? (
            <div className="form-field" style={{ marginBottom: "0.75rem" }}>
              <label className="form-label" htmlFor="bootstrap-tenant">
                Tenant
              </label>
              <select
                id="bootstrap-tenant"
                className="input"
                value={bootstrapSlug}
                onChange={(e) => setBootstrapSlug(e.target.value)}
              >
                {bootstrapSlugs.map((slug) => (
                  <option key={slug} value={slug}>
                    {slug}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
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
            <button
              type="button"
              className="btn btn--primary"
              disabled={!canGenerateKey}
              onClick={() => void createKey()}
            >
              Generate key
            </button>
          </div>
          {!canGenerateKey ? (
            <p className="panel__desc" style={{ marginTop: "0.5rem" }}>
              Waiting for tenant context…
            </p>
          ) : null}
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
      ) : null}

      {showIntegrations ? (
        <section className="panel panel--muted" style={{ marginBottom: "1.5rem" }}>
          <h2 className="panel__title">Webhook signing secrets</h2>
          <p className="panel__desc">
            HMAC-signed ingest at{" "}
            <code>POST /api/webhooks/transactions?tenant_slug=…</code>. Requires a saved API key when
            auth is enabled.
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
                disabled={!tenantId}
              />
            </div>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!tenantId || actionLoading}
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
      ) : null}

      {showIntegrations ? (
        <section className="panel">
          <h2 className="panel__title">ERP integration</h2>
          <p className="panel__desc">
            AUTO_TAG transactions post to the configured adapter. Connect QuickBooks sandbox OAuth
            for tenant-scoped posting (set <code>ERP_PROVIDER=quickbooks_sandbox</code>).
          </p>
          <p style={{ fontSize: "0.875rem" }}>
            Provider: <strong>{erpProvider}</strong>
          </p>
          {qbConnection ? (
            <p className="alert alert--success" style={{ marginTop: "0.75rem" }}>
              QuickBooks connected
              {qbConnection.realmId ? (
                <>
                  {" "}
                  · realm <code>{qbConnection.realmId}</code>
                </>
              ) : null}{" "}
              · since {new Date(qbConnection.connectedAt).toLocaleString()}
            </p>
          ) : (
            <p className="panel__desc" style={{ marginTop: "0.5rem" }}>
              QuickBooks not connected for this tenant.
            </p>
          )}
          {!quickbooksConfigured ? (
            <p className="alert alert--info" style={{ marginTop: "0.75rem" }}>
              Add <code>QUICKBOOKS_CLIENT_ID</code>, <code>QUICKBOOKS_CLIENT_SECRET</code>, and{" "}
              <code>QUICKBOOKS_REDIRECT_URI</code> to server env, then <strong>restart</strong>{" "}
              <code>pnpm dev</code> (see <code>.env.example</code>).
            </p>
          ) : !tenantId ? (
            <p className="alert alert--info" style={{ marginTop: "0.75rem" }}>
              Select a tenant in the header, save your API key if auth is on, then connect.
            </p>
          ) : (
            <div className="btn-group" style={{ marginTop: "0.75rem" }}>
              <button
                type="button"
                className="btn btn--primary"
                disabled={actionLoading}
                onClick={() => void startQuickBooksConnect()}
              >
                Connect QuickBooks sandbox
              </button>
            </div>
          )}
        </section>
      ) : null}

      <ObservabilitySloPanel />
    </PageLayout>
  );
}
