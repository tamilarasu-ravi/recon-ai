"use client";

import {useCallback, useEffect, useState} from "react";

import {PageLayout} from "@/app/components/page-layout";
import {useTenant} from "@/app/components/tenant-provider";
import type {ActivePolicyPackDto, PolicyRuleDto} from "@/lib/data/policy-admin";
import {apiFetch} from "@/lib/ui/api-fetch";
import {
  formatPolicyRuleConfigSummary,
  formatPolicyRuleCreatedAt,
  formatPolicyRuleTypeLabel,
} from "@/lib/ui/format-policy-rule";
import {
  CUSTOM_RULE_CONFIG_EXAMPLE,
  isEvaluatedPolicyRuleType,
  parseManualPolicyRuleInput,
} from "@/lib/ui/parse-policy-rule-form";

type RuleType = "receipt_required" | "banned_mcc" | "single_transaction_cap";
type RuleFormSelection = RuleType | "add_new";

const ADD_NEW_SELECTION = "add_new" as const;

const RULE_TYPE_OPTIONS: Array<{ value: RuleType; label: string }> = [
  { value: "receipt_required", label: "Receipt required" },
  { value: "single_transaction_cap", label: "Transaction cap" },
  { value: "banned_mcc", label: "Banned MCC" },
];

const DEFAULT_FORM_BY_TYPE: Record<
  RuleType,
  { minAmount: string; maxAmount: string; mccs: string }
> = {
  receipt_required: { minAmount: "75", maxAmount: "5000", mccs: "7995,7996" },
  single_transaction_cap: { minAmount: "75", maxAmount: "5000", mccs: "7995,7996" },
  banned_mcc: { minAmount: "75", maxAmount: "5000", mccs: "7995,7996" },
};

/**
 * Writes an existing policy rule config into manual form field state.
 *
 * @param rule - Active rule row for the selected type.
 * @param setMinAmount - Receipt threshold setter.
 * @param setMaxAmount - Cap threshold setter.
 * @param setMccs - Banned MCC list setter.
 */
function applyRuleToFormFields(
  rule: PolicyRuleDto,
  setMinAmount: (value: string) => void,
  setMaxAmount: (value: string) => void,
  setMccs: (value: string) => void,
): void {
  if (rule.ruleType === "receipt_required") {
    const minAmount = rule.ruleConfig.min_amount;
    if (typeof minAmount === "number") {
      setMinAmount(String(minAmount));
    }
    return;
  }

  if (rule.ruleType === "single_transaction_cap") {
    const maxAmount = rule.ruleConfig.max_amount;
    if (typeof maxAmount === "number") {
      setMaxAmount(String(maxAmount));
    }
    return;
  }

  const mccs = rule.ruleConfig.mccs;
  if (Array.isArray(mccs) && mccs.length > 0) {
    setMccs(mccs.map(String).join(", "));
  }
}

/**
 * Resets manual form fields to defaults for a rule type with no active row.
 *
 * @param ruleType - Selected rule type.
 * @param setMinAmount - Receipt threshold setter.
 * @param setMaxAmount - Cap threshold setter.
 * @param setMccs - Banned MCC list setter.
 */
function applyDefaultFormFields(
  ruleType: RuleType,
  setMinAmount: (value: string) => void,
  setMaxAmount: (value: string) => void,
  setMccs: (value: string) => void,
): void {
  const defaults = DEFAULT_FORM_BY_TYPE[ruleType];
  setMinAmount(defaults.minAmount);
  setMaxAmount(defaults.maxAmount);
  setMccs(defaults.mccs);
}

/**
 * Policy admin — view and manage compiled rules on the active policy pack.
 *
 * @returns Policy administration page.
 */
export function PolicyAdminClient(): React.ReactElement {
  const {tenantId, loading: tenantLoading} = useTenant();
  const [pack, setPack] = useState<ActivePolicyPackDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [formSelection, setFormSelection] = useState<RuleFormSelection>("receipt_required");
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleConfig, setNewRuleConfig] = useState(CUSTOM_RULE_CONFIG_EXAMPLE);
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
      const response = await apiFetch(
        `/api/policies?tenant_id=${encodeURIComponent(tenantId)}`,
      );
      if (!response.ok) {
        const body = (await response.json()) as {error?: string};
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        policy: ActivePolicyPackDto | null;
      };
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

  const isAddNewMode = formSelection === ADD_NEW_SELECTION;
  const ruleType = isAddNewMode ? null : formSelection;
  const existingRuleForType =
    ruleType !== null
      ? (pack?.rules.find((rule) => rule.ruleType === ruleType) ?? null)
      : null;
  const isUpdatingExistingRule = !isAddNewMode && existingRuleForType !== null;
  const addNewTargetExists =
    isAddNewMode && newRuleName.trim()
      ? (() => {
          try {
            const parsed = parseManualPolicyRuleInput(newRuleName, newRuleConfig);
            return pack?.rules.some((rule) => rule.ruleType === parsed.ruleType) ?? false;
          } catch {
            return false;
          }
        })()
      : false;
  const missingRuleTypes = RULE_TYPE_OPTIONS.filter(
    (option) => !pack?.rules.some((rule) => rule.ruleType === option.value),
  );
  const allCategoriesConfigured = Boolean(pack) && missingRuleTypes.length === 0;

  useEffect(() => {
    if (!pack || isAddNewMode || ruleType === null) {
      return;
    }

    if (existingRuleForType) {
      applyRuleToFormFields(existingRuleForType, setMinAmount, setMaxAmount, setMccs);
      return;
    }

    applyDefaultFormFields(ruleType, setMinAmount, setMaxAmount, setMccs);
  }, [pack, ruleType, existingRuleForType, isAddNewMode]);

  /**
   * Resolves rule type and config from either category fields or add-new inputs.
   *
   * @returns Payload for POST /api/policies/rules.
   * @throws Error when add-new inputs are invalid.
   */
  function buildSavePayload(): { ruleType: string; ruleConfig: Record<string, unknown> } {
    if (isAddNewMode) {
      return parseManualPolicyRuleInput(newRuleName, newRuleConfig);
    }

    if (ruleType === null) {
      throw new Error("Select a rule category.");
    }

    return {
      ruleType,
      ruleConfig: buildRuleConfigForType(ruleType),
    };
  }

  function buildRuleConfigForType(selectedType: RuleType): Record<string, unknown> {
    if (selectedType === "receipt_required") {
      return {min_amount: Number.parseFloat(minAmount)};
    }
    if (selectedType === "single_transaction_cap") {
      return {max_amount: Number.parseFloat(maxAmount)};
    }
    return {
      mccs: mccs
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }

  async function submitSaveRule(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!tenantId) {
      return;
    }

    setMessage(null);
    setError(null);
    setLoading(true);

    try {
      const payload = buildSavePayload();
      const response = await apiFetch("/api/policies/rules", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          tenant_id: tenantId,
          rule_type: payload.ruleType,
          rule_config: payload.ruleConfig,
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as {error?: string};
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const body = (await response.json()) as {replaced?: boolean};
      const label = formatPolicyRuleTypeLabel(payload.ruleType);
      const wasUpdate =
        body.replaced ||
        (!isAddNewMode && isUpdatingExistingRule) ||
        (isAddNewMode && addNewTargetExists);
      setMessage(
        wasUpdate
          ? `${label} rule updated — new transactions will use the new configuration.`
          : `${label} rule added to the active policy pack.`,
      );
      if (isAddNewMode) {
        setFormSelection(
          isEvaluatedPolicyRuleType(payload.ruleType)
            ? (payload.ruleType as RuleType)
            : ADD_NEW_SELECTION,
        );
        setNewRuleName("");
        setNewRuleConfig(CUSTOM_RULE_CONFIG_EXAMPLE);
      }
      await loadPolicy();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rule");
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
        headers: {"Content-Type": "application/json"},
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
        persisted?: {ruleId: string; replaced?: boolean} | null;
      };

      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      if (body.compiled) {
        setCompilePreview(body.compiled);
      }

      if (persist && body.persisted) {
        setMessage(
          body.persisted.replaced
            ? "Compiled rule updated the existing rule of this type."
            : "Compiled rule added to active policy pack.",
        );
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
        {method: "DELETE"},
      );

      if (!response.ok) {
        const body = (await response.json()) as {error?: string};
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      setMessage(`Removed ${formatPolicyRuleTypeLabel(rule.ruleType)} rule.`);
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
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--color-text-muted)",
            marginBottom: "1.25rem",
          }}
        >
          Active pack <code>{pack.policyVersion}</code> · {pack.rules.length}{" "}
          rule
          {pack.rules.length === 1 ? "" : "s"}
        </p>
      ) : (
        <p className="alert alert--warning">
          No active policy — contact your administrator to configure rules.
        </p>
      )}

      <section className="panel" style={{marginBottom: "1.5rem"}}>
        <h2 className="panel__title">Active rules</h2>
        <p className="panel__desc">
          Built-in categories are evaluated on every expense. Custom rules can be added with any
          name — they are stored for admin and future evaluators; only built-in types affect
          auto-coding today.
        </p>

        {pack && pack.rules.length > 0 ? (
          <div className="policy-rules-table-wrap">
            <table className="policy-rules-table">
              <thead>
                <tr>
                  <th scope="col">Rule</th>
                  <th scope="col">Configuration</th>
                  <th scope="col">Added</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pack.rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="policy-rules-table__type">
                      {formatPolicyRuleTypeLabel(rule.ruleType)}
                    </td>
                    <td className="policy-rules-table__config">
                      {formatPolicyRuleConfigSummary(rule.ruleType, rule.ruleConfig)}
                      {!isEvaluatedPolicyRuleType(rule.ruleType) ? (
                        <span
                          className="badge badge--reason"
                          style={{marginLeft: "0.5rem", fontSize: "0.6875rem"}}
                        >
                          Stored only
                        </span>
                      ) : null}
                    </td>
                    <td className="policy-rules-table__date">
                      {formatPolicyRuleCreatedAt(rule.createdAt)}
                    </td>
                    <td className="policy-rules-table__actions">
                      <button
                        type="button"
                        className="btn btn--danger"
                        style={{padding: "0.25rem 0.6rem", fontSize: "0.75rem"}}
                        disabled={loading}
                        onClick={() => void removeRule(rule)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="policy-rules-empty">
            {pack ? "No rules yet — add one below." : "Load a policy pack to manage rules."}
          </p>
        )}
      </section>

      <section className="panel" style={{marginBottom: "1.5rem"}}>
        <h2 className="panel__title">Natural language compiler</h2>
        <p className="panel__desc">
          Describe a policy in plain English. The LLM compiles it to a
          deterministic rule (offline admin only). Requires and an API key.
        </p>
        <div className="form-field" style={{marginBottom: "0.75rem"}}>
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
          <div style={{marginTop: "1rem"}}>
            <p style={{fontSize: "0.875rem"}}>
              <strong>{compilePreview.rule_type}</strong> —{" "}
              {compilePreview.summary}
            </p>
            <pre className="code-block" style={{marginTop: "0.5rem"}}>
              {JSON.stringify(compilePreview.rule_config, null, 2)}
            </pre>
          </div>
        ) : null}
      </section>

      <section className="panel panel--muted" style={{marginBottom: "1.5rem"}}>
        <h2 className="panel__title">Add or update rule (manual)</h2>
        <p className="panel__desc">
          Pick a rule category, set its values, then save. If that category already exists in the
          table above, you are updating it. If it was removed, you are adding it back.
        </p>

        {pack && missingRuleTypes.length > 0 ? (
          <div style={{marginBottom: "1rem"}}>
            <p
              style={{
                fontSize: "0.8125rem",
                fontWeight: 500,
                margin: "0 0 0.5rem",
              }}
            >
              Categories available to add ({missingRuleTypes.length})
            </p>
            <div className="btn-group" style={{flexWrap: "wrap"}}>
              {missingRuleTypes.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`btn btn--secondary${formSelection === option.value ? " segmented__btn--active" : ""}`}
                  style={{fontSize: "0.8125rem"}}
                  disabled={loading}
                  onClick={() => setFormSelection(option.value)}
                >
                  Add {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {allCategoriesConfigured && !isAddNewMode ? (
          <p className="alert alert--info" style={{marginBottom: "1rem"}}>
            All built-in categories are configured. Use <strong>Add…</strong> in the dropdown to
            create a custom rule with any name and JSON config, or pick a category to update its
            fields.
          </p>
        ) : null}

        {isAddNewMode ? (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-text-muted)",
              margin: "0 0 1rem",
            }}
          >
            Choose any rule name (e.g. <code>weekend_spending_cap</code>) and a JSON config object.
            Built-in names like <code>receipt_required</code> use strict validation; custom names
            accept any JSON fields.
          </p>
        ) : isUpdatingExistingRule && existingRuleForType ? (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-text-muted)",
              margin: "0 0 1rem",
            }}
          >
            Updating {formatPolicyRuleTypeLabel(existingRuleForType.ruleType)} — current:{" "}
            {formatPolicyRuleConfigSummary(
              existingRuleForType.ruleType,
              existingRuleForType.ruleConfig,
            )}
          </p>
        ) : !isUpdatingExistingRule && pack && ruleType !== null ? (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-text-muted)",
              margin: "0 0 1rem",
            }}
          >
            Adding {formatPolicyRuleTypeLabel(ruleType)} — this category is not in the active pack
            yet.
          </p>
        ) : null}
        <form onSubmit={(e) => void submitSaveRule(e)} className="form-row">
          <div className="form-field">
            <label className="form-label" htmlFor="rule-type">
              Rule category
            </label>
            <select
              id="rule-type"
              className="select"
              value={formSelection}
              onChange={(e) => setFormSelection(e.target.value as RuleFormSelection)}
            >
              {RULE_TYPE_OPTIONS.map((option) => {
                const isConfigured = pack?.rules.some(
                  (rule) => rule.ruleType === option.value,
                );
                return (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {isConfigured ? " (configured — updates)" : " (not configured — adds)"}
                  </option>
                );
              })}
              <option value={ADD_NEW_SELECTION}>Add…</option>
            </select>
          </div>

          {isAddNewMode ? (
            <>
              <div className="form-field">
                <label className="form-label" htmlFor="new-rule-name">
                  Rule name
                </label>
                <input
                  id="new-rule-name"
                  className="input"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  placeholder="weekend_spending_cap"
                  autoComplete="off"
                />
              </div>
              <div className="form-field" style={{minWidth: "16rem", flex: 1}}>
                <label className="form-label" htmlFor="new-rule-config">
                  Configuration (JSON)
                </label>
                <textarea
                  id="new-rule-config"
                  className="input"
                  rows={4}
                  value={newRuleConfig}
                  onChange={(e) => setNewRuleConfig(e.target.value)}
                  placeholder={CUSTOM_RULE_CONFIG_EXAMPLE}
                  spellCheck={false}
                />
              </div>
            </>
          ) : null}

          {!isAddNewMode && ruleType === "receipt_required" ? (
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

          {!isAddNewMode && ruleType === "single_transaction_cap" ? (
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

          {!isAddNewMode && ruleType === "banned_mcc" ? (
            <div className="form-field">
              <label className="form-label" htmlFor="mccs">
                MCC codes (comma-separated)
              </label>
              <input
                id="mccs"
                className="input"
                value={mccs}
                onChange={(e) => setMccs(e.target.value)}
              />
            </div>
          ) : null}

          <button type="submit" className="btn btn--primary" disabled={loading}>
            {isAddNewMode
              ? addNewTargetExists
                ? "Update rule"
                : "Add rule"
              : isUpdatingExistingRule
                ? "Update rule"
                : "Add rule"}
          </button>
        </form>
      </section>
    </PageLayout>
  );
}
