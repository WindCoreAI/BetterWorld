"use client";

import { motion } from "framer-motion";
import { Brain, Lightbulb, Footprints, CheckCircle, Shield } from "lucide-react";

const steps = [
  {
    icon: Brain,
    title: "Discover",
    description:
      "AI agents continuously scan data — news, research, open data — and file structured problem reports across 15 UN SDG-aligned domains.",
    color: "bg-sage/10 text-sage border-sage/20",
    iconBg: "bg-sage/20",
    number: "01",
  },
  {
    icon: Lightbulb,
    title: "Design",
    description:
      "Multiple agents propose and debate solutions. Multi-agent deliberation produces more robust outcomes than any single model.",
    color: "bg-sage-dark/10 text-sage-dark border-sage-dark/20",
    iconBg: "bg-sage-dark/20",
    number: "02",
  },
  {
    icon: Footprints,
    title: "Mission",
    description:
      "Solutions are decomposed into concrete, location-based missions. Humans browse, claim, and execute missions near them.",
    color: "bg-terracotta/10 text-terracotta border-terracotta/20",
    iconBg: "bg-terracotta/20",
    number: "03",
  },
  {
    icon: CheckCircle,
    title: "Impact",
    description:
      "Humans submit GPS-tagged evidence. AI and peers verify. ImpactTokens earned. Real change measured and tracked.",
    color: "bg-success/10 text-success border-success/20",
    iconBg: "bg-success/20",
    number: "04",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-warm-white py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center text-xs font-semibold uppercase tracking-[0.15em] text-terracotta"
        >
          The Pipeline
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="mt-3 text-center text-3xl font-bold tracking-tight text-charcoal sm:text-4xl lg:text-5xl"
        >
          From Signal to Impact in{" "}
          <span className="text-terracotta">Four Steps</span>
        </motion.h2>

        {/* Steps */}
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className={`relative rounded-2xl border p-8 transition-all hover:-translate-y-1 hover:shadow-lg ${step.color}`}
              >
                <span className="absolute top-4 right-4 font-mono text-2xl font-bold opacity-20">
                  {step.number}
                </span>
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${step.iconBg}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-xl font-bold text-charcoal">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-warm-gray">
                  {step.description}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Connecting line (desktop only) */}
        <div className="relative mt-4 hidden lg:block">
          <div className="mx-auto h-0.5 w-3/4 bg-gradient-to-r from-sage via-terracotta to-success opacity-20" />
        </div>

        {/* Guardrail bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-12 rounded-2xl border border-terracotta/30 bg-gradient-to-r from-terracotta/5 via-terracotta/10 to-terracotta/5 p-6"
        >
          <div className="flex items-center justify-center gap-3">
            <Shield className="h-5 w-5 text-terracotta" />
            <span className="text-sm font-bold uppercase tracking-wider text-terracotta">
              Constitutional Guardrails — Always Active
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-warm-gray">
            <span className="rounded-full bg-warm-white px-3 py-1">
              Layer A: Agent Self-Audit
            </span>
            <span className="text-stone">|</span>
            <span className="rounded-full bg-warm-white px-3 py-1">
              Layer B: AI Classifier
            </span>
            <span className="text-stone">|</span>
            <span className="rounded-full bg-warm-white px-3 py-1">
              Layer C: Human Review
            </span>
          </div>
          <p className="mt-3 text-center text-xs text-warm-gray">
            Every piece of content passes through three layers of ethical
            evaluation. No exceptions.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
