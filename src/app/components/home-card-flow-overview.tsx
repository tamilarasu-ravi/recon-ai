import Link from "next/link";

import {DecisionBadge} from "@/app/components/ui/decision-badge";

const FLOW_STEPS = [
  {
    order: 1,
    title: "Policy checks",
    href: "/policy",
    linkLabel: "Policy admin",
    description:
      "Every card expense is evaluated against your rules — receipt thresholds, spend caps, banned categories.",
    example: "AWS over $75 → receipt required before auto-code can proceed.",
    outcomes: null,
  },
  {
    order: 2,
    title: "Auto-code spend",
    href: "/review-queue/new",
    linkLabel: "Add transaction",
    description:
      "The tagging agent assigns a GL code using vendor rules, similar past expenses (RAG), and one structured LLM call when needed.",
    example: "Slack with a saved vendor rule → high confidence, LLM skipped.",
    outcomes: ["AUTO_TAG"] as const,
  },
  {
    order: 3,
    title: "Review & approve",
    href: "/review-queue",
    linkLabel: "Review queue",
    description:
      "When the system will not guess, an accountant reviews, overrides GL, and teaches a vendor rule for next time.",
    example:
      "Unknown vendor or low confidence → queue or refuse — never silent wrong GL.",
    outcomes: ["QUEUE_REVIEW", "REFUSE"] as const,
  },
] as const;

/**
 * Explains the card-transaction pipeline on the home hero — policy, tagging, human review.
 *
 * @returns Static overview with step cards and tri-state outcome legend.
 */
export function HomeCardFlowOverview(): React.ReactElement {
  return (
    <div className="hero-flow">
      <p className="hero-flow__lead">
        When a card expense is ingested, the orchestrator runs these steps in
        order. Each step is audited with a <code>run_id</code> you can replay in
        transaction detail.
      </p>

      <ol className="hero-flow__steps" aria-label="Card transaction pipeline">
        {FLOW_STEPS.map((step, index) => (
          <li key={step.title} className="hero-flow__step-wrap">
            {index > 0 ? (
              <span className="hero-flow__arrow" aria-hidden>
                →
              </span>
            ) : null}
            <article className="hero-flow__step">
              <span className="hero-flow__step-num">{step.order}</span>
              <h2 className="hero-flow__step-title">{step.title}</h2>
              <p className="hero-flow__step-desc">{step.description}</p>
              <p className="hero-flow__step-example">
                <span className="hero-flow__example-label">Example</span>{" "}
                {step.example}
              </p>
              {step.outcomes ? (
                <div className="hero-flow__outcomes">
                  {step.outcomes.map((decision) => (
                    <DecisionBadge key={decision} decision={decision} />
                  ))}
                </div>
              ) : null}
              <Link href={step.href} className="hero-flow__link">
                {step.linkLabel} →
              </Link>
            </article>
          </li>
        ))}
      </ol>

      <div className="hero-flow__legend panel panel--info">
        <h3 className="hero-flow__legend-title">
          Tri-state decisions (tagging outcomes)
        </h3>
        <ul className="hero-flow__legend-list">
          <li>
            <DecisionBadge decision="AUTO_TAG" />
            <span>
              Confident enough to auto-code (vendor rule or strong evidence +
              policy allows).
            </span>
          </li>
          <li>
            <DecisionBadge decision="QUEUE_REVIEW" />
            <span>
              New vendor, receipt gate, or mid confidence — accountant decides.
            </span>
          </li>
          <li>
            <DecisionBadge decision="REFUSE" />
            <span>
              Unknown merchant or invalid GL — we refuse rather than miscoding
              silently.
            </span>
          </li>
        </ul>
        <p className="hero-flow__try">
          Try all three on{" "}
          <Link href="/review-queue/new">Add transaction</Link>{" "}
        </p>
      </div>
    </div>
  );
}
