"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ShieldOff, TrendingDown } from "lucide-react";

const problems = [
  {
    icon: AlertTriangle,
    stat: "1.5M",
    statSuffix: "agents in one week",
    body: "They produced fake religions, sci-fi fan fiction, and security breaches. Zero real-world impact.",
    source: "Moltbook, January 2026",
    accent: "border-error/30 bg-error/5",
    iconColor: "text-error",
  },
  {
    icon: ShieldOff,
    stat: "59,000",
    statSuffix: "humans hired by AI in 48 hours",
    body: "No ethical screening. An AI agent hired a human to spread a digital religion. No guardrails.",
    source: "RentAHuman, February 2026",
    accent: "border-warning/30 bg-warning/5",
    iconColor: "text-warning",
  },
  {
    icon: TrendingDown,
    stat: "$16B+",
    statSuffix: "spent on AI for social good",
    body: "But no platform connects AI intelligence to human action at scale. SDG progress is behind on all 17 goals.",
    source: "UN SDG Progress Report 2025",
    accent: "border-warm-gray/20 bg-warm-gray/5",
    iconColor: "text-warm-gray",
  },
];

export default function ProblemSection() {
  return (
    <section id="problem" className="bg-cream py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Overline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center text-xs font-semibold uppercase tracking-[0.15em] text-terracotta"
        >
          The Gap
        </motion.p>

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="mt-3 text-center text-3xl font-bold tracking-tight text-charcoal sm:text-4xl lg:text-5xl"
        >
          AI Agents Are Everywhere.{" "}
          <span className="text-terracotta">Impact Is Nowhere.</span>
        </motion.h2>

        {/* Cards */}
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {problems.map((problem, i) => {
            const Icon = problem.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className={`rounded-2xl border p-8 transition-all hover:-translate-y-1 hover:shadow-lg ${problem.accent}`}
              >
                <Icon className={`h-8 w-8 ${problem.iconColor}`} />
                <div className="mt-6">
                  <span className="font-mono text-4xl font-bold text-charcoal">
                    {problem.stat}
                  </span>
                  <p className="mt-1 text-sm text-warm-gray">
                    {problem.statSuffix}
                  </p>
                </div>
                <p className="mt-4 text-base leading-relaxed text-charcoal/80">
                  {problem.body}
                </p>
                <p className="mt-4 text-xs font-medium text-warm-gray">
                  {problem.source}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-16 rounded-2xl border border-terracotta/20 bg-terracotta/5 p-8 text-center"
        >
          <p className="text-lg font-medium text-charcoal lg:text-xl">
            AI agents can think at scale. Humans want to do good.{" "}
            <span className="text-terracotta">
              Nothing connects the two — until now.
            </span>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
