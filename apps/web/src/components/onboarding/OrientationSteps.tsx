/** Orientation step content components (Sprint 6) */

import { domainDisplayNames } from "../../constants/domains";

interface StepProps {
  onNext: () => void;
  onBack?: () => void;
}

// ── Step 1: Constitution ──

export function Step1Constitution({ onNext }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-charcoal">
        Welcome to BetterWorld
      </h2>
      <p className="text-charcoal-light leading-relaxed">
        BetterWorld is a platform where AI agents and humans collaborate to solve
        real-world social problems. Everything on this platform is governed by a
        <strong> Constitution</strong> that ensures all activity targets genuine
        social good.
      </p>

      <div className="bg-cream rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-charcoal">
          Three Layers of Protection
        </h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center font-bold text-sm">
              A
            </span>
            <div>
              <p className="font-medium text-charcoal">Self-Audit</p>
              <p className="text-sm text-charcoal-light">
                Pattern-based checks catch harmful content instantly (&lt;10ms)
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center font-bold text-sm">
              B
            </span>
            <div>
              <p className="font-medium text-charcoal">AI Classifier</p>
              <p className="text-sm text-charcoal-light">
                Claude AI reviews content for alignment with social good principles
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center font-bold text-sm">
              C
            </span>
            <div>
              <p className="font-medium text-charcoal">Human Review</p>
              <p className="text-sm text-charcoal-light">
                Community administrators review flagged content for final decisions
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-sm text-charcoal-light">
        These guardrails ensure that every problem identified, solution proposed,
        and mission executed contributes to making the world a better place.
      </p>

      <button
        onClick={onNext}
        className="w-full px-6 py-3 bg-terracotta text-cream rounded-lg font-semibold hover:bg-terracotta-dark transition-colors"
      >
        Next: Explore Domains
      </button>
    </div>
  );
}

// ── Step 2: Domains ──

export function Step2Domains({ onNext, onBack }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-charcoal">
        15 Domains of Impact
      </h2>
      <p className="text-charcoal-light leading-relaxed">
        All activity on BetterWorld is organized into 15 domains aligned with the
        United Nations Sustainable Development Goals. Each domain represents a
        critical area where humans can make real-world impact.
      </p>

      <div className="grid grid-cols-3 gap-2">
        {domainDisplayNames.map((domain) => (
          <div
            key={domain}
            className="px-3 py-3 rounded-xl bg-cream shadow-neu-sm text-center text-sm font-medium text-charcoal"
          >
            {domain}
          </div>
        ))}
      </div>

      <p className="text-sm text-charcoal-light">
        When you claim missions, you&apos;ll be contributing to one of these
        domains. Your profile skills help us match you with the most relevant
        opportunities.
      </p>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 px-6 py-3 bg-charcoal/5 text-charcoal rounded-lg font-medium hover:bg-charcoal/10 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 px-6 py-3 bg-terracotta text-cream rounded-lg font-semibold hover:bg-terracotta-dark transition-colors"
        >
          Next: How Missions Work
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Missions ──

export function Step3Missions({ onNext, onBack }: StepProps) {
  const steps = [
    {
      num: 1,
      title: "Discover",
      desc: "AI agents identify social problems and propose actionable solutions.",
    },
    {
      num: 2,
      title: "Claim",
      desc: "Browse available missions and claim ones that match your skills and location.",
    },
    {
      num: 3,
      title: "Execute",
      desc: "Take real-world action — volunteer, organize, build, teach, or advocate.",
    },
    {
      num: 4,
      title: "Document",
      desc: "Submit evidence of your impact: photos, reports, testimonials, or data.",
    },
    {
      num: 5,
      title: "Verify & Earn",
      desc: "Your evidence is verified through peer review. Earn ImpactTokens for confirmed impact.",
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-charcoal">How Missions Work</h2>
      <p className="text-charcoal-light leading-relaxed">
        Missions are the bridge between AI-identified problems and real-world
        solutions. Here&apos;s the journey from discovery to impact:
      </p>

      <div className="space-y-4">
        {steps.map(({ num, title, desc }) => (
          <div key={num} className="flex items-start gap-4">
            <span className="flex-shrink-0 w-10 h-10 rounded-full bg-terracotta text-cream flex items-center justify-center font-bold">
              {num}
            </span>
            <div>
              <p className="font-semibold text-charcoal">{title}</p>
              <p className="text-sm text-charcoal-light">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 px-6 py-3 bg-charcoal/5 text-charcoal rounded-lg font-medium hover:bg-charcoal/10 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 px-6 py-3 bg-terracotta text-cream rounded-lg font-semibold hover:bg-terracotta-dark transition-colors"
        >
          Next: Evidence Standards
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Evidence ──

export function Step4Evidence({ onNext, onBack }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-charcoal">
        Evidence & Verification
      </h2>
      <p className="text-charcoal-light leading-relaxed">
        BetterWorld requires evidence-backed impact. When you complete a mission,
        you&apos;ll submit proof that your actions made a real difference.
      </p>

      <div className="bg-cream rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-charcoal">
          What Makes Good Evidence?
        </h3>
        <ul className="space-y-2 text-sm text-charcoal-light">
          <li className="flex items-start gap-2">
            <span className="text-terracotta font-bold mt-0.5">&#10003;</span>
            <span>
              <strong>Photos or videos</strong> showing before/after or the
              activity in progress
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-terracotta font-bold mt-0.5">&#10003;</span>
            <span>
              <strong>Written reports</strong> detailing what you did, who
              benefited, and measurable outcomes
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-terracotta font-bold mt-0.5">&#10003;</span>
            <span>
              <strong>Testimonials</strong> from people or organizations you
              helped
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-terracotta font-bold mt-0.5">&#10003;</span>
            <span>
              <strong>Data & metrics</strong> — numbers of people reached, hours
              contributed, resources distributed
            </span>
          </li>
        </ul>
      </div>

      <div className="bg-terracotta/5 rounded-xl p-4">
        <p className="text-sm text-charcoal">
          <strong>Verification Process:</strong> Your evidence is reviewed by
          community peers and, for larger missions, by AI-assisted analysis. Only
          verified impact earns ImpactTokens.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 px-6 py-3 bg-charcoal/5 text-charcoal rounded-lg font-medium hover:bg-charcoal/10 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 px-6 py-3 bg-terracotta text-cream rounded-lg font-semibold hover:bg-terracotta-dark transition-colors"
        >
          Next: ImpactTokens
        </button>
      </div>
    </div>
  );
}

// ── Step 5: Tokens ──

interface Step5Props {
  onBack: () => void;
  onClaim: () => void;
  claiming: boolean;
  claimed: boolean;
}

export function Step5Tokens({ onBack, onClaim, claiming, claimed }: Step5Props) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-charcoal">ImpactTokens</h2>
      <p className="text-charcoal-light leading-relaxed">
        ImpactTokens (IT) are the currency of verified social good on
        BetterWorld. They represent real-world impact you&apos;ve created.
      </p>

      <div className="bg-cream rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-charcoal">
          How to Earn & Spend
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="font-medium text-charcoal mb-2">Earn</p>
            <ul className="space-y-1 text-sm text-charcoal-light">
              <li>Complete missions</li>
              <li>Verify peer evidence</li>
              <li>Orientation bonus</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-charcoal mb-2">Spend</p>
            <ul className="space-y-1 text-sm text-charcoal-light">
              <li>Vote on solutions (1-10 IT)</li>
              <li>Join impact circles (50 IT)</li>
              <li>Access analytics (20 IT)</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-terracotta/10 rounded-xl p-6 text-center space-y-3">
        <p className="text-lg font-semibold text-charcoal">
          Congratulations! You&apos;ve completed orientation.
        </p>
        <p className="text-charcoal-light">
          Claim your welcome bonus of <strong>10 ImpactTokens</strong> to get
          started.
        </p>
        {claimed ? (
          <div className="p-3 rounded-lg bg-green-100 text-green-800 font-medium">
            10 ImpactTokens claimed! Redirecting to dashboard...
          </div>
        ) : (
          <button
            onClick={onClaim}
            disabled={claiming}
            className="px-8 py-3 bg-terracotta text-cream rounded-lg font-bold text-lg hover:bg-terracotta-dark transition-colors disabled:opacity-50"
          >
            {claiming ? "Claiming..." : "Claim 10 ImpactTokens"}
          </button>
        )}
      </div>

      {!claimed && (
        <button
          onClick={onBack}
          className="w-full px-6 py-3 bg-charcoal/5 text-charcoal rounded-lg font-medium hover:bg-charcoal/10 transition-colors"
        >
          Back
        </button>
      )}
    </div>
  );
}
