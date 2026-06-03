"use client";

import { useCallback, useEffect, useState } from "react";

import { PageLayout } from "@/app/components/page-layout";
import { useTenant } from "@/app/components/tenant-provider";
import type { ActivePolicyPackDto, PolicyRuleDto } from "@/lib/data/policy-admin";
import { apiFetch } from "@/lib/ui/api-fetch";

type RuleType = "receipt_required" | "banned_mcc" | "single_transaction_cap";

/**
 * Policy admin — view and manage compiled rules on the active policy pack.
 *
 * @returns Policy administration page.
 */
export function PolicyAdminClient(): React.ReactElement {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [pack, setPack] = useState<ActivePolicyPackDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [ruleType, setRuleType] = useState<RuleType>("receipt_required");
  const [minAmount, setMinAmount] = useState("75");
  const [maxAmount, setMaxAmount] = useState("5000");
  const [mccs, setMccs] = useState("7995,7996");
  const [nlPolicyText, setNlPolicyText] = useState(
    "Require receipts for card purchases over $75.",
  );
  const [compilePreview, setCompilePreview] = useState<{
    rule_type: string;
    rule_config: Record<string, unknown>;
    summary: string;
  } | null>(null);
  const [compileLoading, setCompileLoading] = useState(false);

  const loadPolicy = useCallback(async (): Promise<void> => {
    if (!tenantId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/policies?tenant_id=${encodeURIComponent(tenantId)}`);
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { policy: ActivePolicyPackDto | null };
      setPack(data.policy);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load policy");
      setPack(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantLoading && tenantId) {
      void loadPolicy();
    }
  }, [tenantLoading, tenantId, loadPolicy]);

  function buildRuleConfig(): Record<string, unknown> {
    if (ruleType === "receipt_required") {
      return { min_amount: Number.parseFloat(minAmount) };
    }
    if (ruleType === "single_transaction_cap") {
      return { max_amount: Number.parseFloat(maxAmount) };
    }
    return { mccs: mccs.split(",").map((value) => value.trim()).filter(Boolean) };
  }

  async function submitAddRule(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!tenantId) {
      return;
    }

    setMessage(null);
    setLoading(true);

    try {
      const response = await apiFetch("/api/policies/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          rule_type: ruleType,
          rule_config: buildRuleConfig(),
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      setMessage("Rule added — new transactions will evaluate against the updated pack.");
      await loadPolicy();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add rule");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Compiles natural-language policy via LLM (preview or persist).
   *
   * @param persist - When true, inserts the compiled rule into the active pack.
   */
  async function submitCompilePolicy(persist: boolean): Promise<void> {
    if (!tenantId) {
      return;
    }

    setCompileLoading(true);
    setError(null);
    setMessage(null);
    setCompilePreview(null);

    try {
      const response = await apiFetch("/api/policies/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          natural_language: nlPolicyText,
          persist,
        }),
      });

      const body = (await response.json()) as {
        error?: string;
        compiled?: {
          rule_type: string;
          rule_config: Record<string, unknown>;
          summary: string;
        };
        persisted?: { ruleId: string } | null;
      };

      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      if (body.compiled) {
        setCompilePreview(body.compiled);
      }

      if (persist && body.persisted) {
        setMessage("Compiled rule added to active policy pack.");
        await loadPolicy();
      } else {
        setMessage("Preview ready — review below, then Add to policy pack.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Policy compile failed");
    } finally {
      setCompileLoading(false);
    }
  }

  async function removeRule(rule: PolicyRuleDto): Promise<void> {
    if (!tenantId) {
      return;
    }

    setMessage(null);
    setLoading(true);

    try {
      const response = await apiFetch(
        `/api/policies/rules/${rule.id}?tenant_id=${encodeURIComponent(tenantId)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      setMessage(`Removed ${rule.ruleType} rule.`);
      await loadPolicy();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rule");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout
      title="Policy admin"
      subtitle="Compiled rules on the active policy pack — caps AUTO_TAG via receipt and review gates."
      loading={loading || compileLoading}
      blocking={loading || compileLoading}
      blockingLabel={compileLoading ? "Compiling policy…" : "Updating policy…"}
    >
      {error ? <p className="alert alert--error">{error}</p> : null}
      {message ? <p className="alert alert--success">{message}</p> : null}

      {pack ? (
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
          Active pack <code>{pack.policyVersion}</code> · {pack.rules.length} rule
          {pack.rules.length === 1 ? "" : "s"}
        </p>
      ) : (
        <p className="alert alert--warning">No active policy — run pnpm db:seed.</p>
      )}

      <section className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 className="panel__title">Natural language compiler</h2>
        <p className="panel__desc">
          Describe a policy in plain English. The LLM compiles it to a deterministic rule (offline
          admin only). Requires <code>LLM_ENABLE_LIVE_CALLS=true</code> and an API key.
        </p>
        <div className="form-field" style={{ marginBottom: "0.75rem" }}>
          <label className="form-label" htmlFor="nl-policy">
            Policy statement
          </label>
          <textarea
            id="nl-policy"
            className="input"
            rows={3}
            value={nlPolicyText}
            onChange={(e) => setNlPolicyText(e.target.value)}
            disabled={!tenantId || compileLoading}
          />
        </div>
        <div className="btn-group">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={!tenantId || compileLoading}
            onClick={() => void submitCompilePolicy(false)}
          >
            Preview compile
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!tenantId || compileLoading}
            onClick={() => void submitCompilePolicy(true)}
          >
            Add to policy pack
          </button>
        </div>
        {compilePreview ? (
          <div style={{ marginTop: "1rem" }}>
            <p style={{ fontSize: "0.875rem" }}>
              <strong>{compilePreview.rule_type}</strong> — {compilePreview.summary}
            </p>
            <pre className="code-block" style={{ marginTop: "0.5rem" }}>
              {JSON.stringify(compilePreview.rule_config, null, 2)}
            </pre>
          </div>
        ) : null}
      </section>

      <section className="panel panel--muted" style={{ marginBottom: "1.5rem" }}>
        <h2 className="panel__title">Add rule (manual)</h2>
        <form onSubmit={(e) => void submitAddRule(e)} className="form-row">
          <div className="form-field">
            <label className="form-label" htmlFor="rule-type">
              Rule type
            </label>
            <select
              id="rule-type"
              className="select"
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value as RuleType)}
            >
              <option value="receipt_required">receipt_required</option>
              <option value="single_transaction_cap">single_transaction_cap</option>
              <option value="banned_mcc">banned_mcc</option>
            </select>
          </div>

          {ruleType === "receipt_required" ? (
            <div className="form-field">
              <label className="form-label" htmlFor="min-amount">
                Min amount
              </label>
              <input
                id="min-amount"
                className="input"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </div>
          ) : null}

          {ruleType === "single_transaction_cap" ? (
            <div className="form-field">
              <label className="form-label" htmlFor="max-amount">
                Max amount
              </label>
              <input
                id="max-amount"
                className="input"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </div>
          ) : null}

          {ruleType === "banned_mcc" ? (
            <div className="form-field">
              <label className="form-label" htmlFor="mccs">
                MCC codes (comma-separated)
              </label>
              <input id="mccs" className="input" value={mccs} onChange={(e) => setMccs(e.target.value)} />
            </div>
          ) : null}

          <button type="submit" className="btn btn--primary" disabled={loading}>
            Add rule
          </button>
        </form>
      </section>

      <ul className="queue-list">
        {pack?.rules.map((rule) => (
          <li key={rule.id} className="queue-item">
            <div className="queue-item__header">
              <span className="queue-item__vendor">{rule.ruleType}</span>
              <button
                type="button"
                className="btn btn--danger"
                style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                disabled={loading}
                onClick={() => void removeRule(rule)}
              >
                Remove
              </button>
            </div>
            <pre className="code-block" style={{ marginTop: "0.5rem" }}>
              {JSON.stringify(rule.ruleConfig, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
    </PageLayout>
  );
}
