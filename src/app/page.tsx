import Link from "next/link";

import {PageLayout} from "@/app/components/page-layout";
import {TenantMetricsPanel} from "@/app/components/tenant-metrics-panel";

/**
 * Product home hub — navigation and at-a-glance metrics for finance operators.
 *
 * @returns Home page.
 */
export default function HomePage(): React.ReactElement {
  return (
    <PageLayout
      title="Financial operations"
      subtitle="Auto-code card spend, enforce policy, and route exceptions to your review queue — with a full audit trail."
    >
      <section className="hero hero--banner">
        <span className="hero__eyebrow">CFO operations platform</span>
        <div className="hero__pipelines">
          <span className="hero__pipe">Auto-code spend</span>
          <span className="hero__pipe">Policy checks</span>
          <span className="hero__pipe">Review &amp; approve</span>
        </div>
        <p
          style={{
            margin: "1rem 0 0",
            fontSize: "0.9375rem",
            color: "var(--color-text-muted)",
            maxWidth: "42rem",
          }}
        >
          New here?{" "}
          <Link href="/review-queue/new">Add a sample transaction</Link> to see
          tagging and review in action.
        </p>
      </section>

      <TenantMetricsPanel />

      <div className="card-grid">
        <Link href="/review-queue" className="card card--link">
          <h2 className="card__title">Review queue</h2>
          <p className="card__desc">
            Transactions that need an accountant — see why each was flagged and
            apply an override.
          </p>
        </Link>
        <Link href="/ap" className="card card--link">
          <h2 className="card__title">AP inbox</h2>
          <p className="card__desc">
            Incoming invoices, recommended pay dates, and duplicate detection —
            recommendations only, no payments executed.
          </p>
        </Link>
        <Link href="/policy" className="card card--link">
          <h2 className="card__title">Policy admin</h2>
          <p className="card__desc">
            Receipt requirements, spend caps, and category rules that can block
            auto-coding.
          </p>
        </Link>
        <Link href="/review-queue/new" className="card card--link">
          <h2 className="card__title">Add transaction</h2>
          <p className="card__desc">
            Submit a card expense — try common scenarios like receipt required,
            new vendor, or unknown merchant.
          </p>
        </Link>
        <Link href="/settings" className="card card--link">
          <h2 className="card__title">Settings</h2>
          <p className="card__desc">
            Company preferences, API access, and system health.
          </p>
        </Link>
      </div>
    </PageLayout>
  );
}
