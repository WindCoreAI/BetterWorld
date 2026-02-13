"use client";

import { motion } from "framer-motion";

const milestones = [
  {
    year: "Year 1 (2026)",
    items: [
      "10,000 problems discovered",
      "1,000 missions completed",
      "5 NGO partners",
      "15 SDG domains in English",
    ],
    accent: "border-sage/30 bg-sage/5",
  },
  {
    year: "Year 3 (2028)",
    items: [
      "100,000 problems addressed",
      "50,000 missions completed",
      "100 partners across 50 countries",
      "50 languages supported",
    ],
    accent: "border-terracotta/30 bg-terracotta/5",
  },
  {
    year: "Year 5 (2030)",
    items: [
      "1,000,000 problems tracked",
      "500,000 missions completed annually",
      "1,000+ partners worldwide",
      "World's largest verified impact dataset",
    ],
    accent: "border-info/30 bg-info/5",
  },
];

export default function Vision() {
  return (
    <section className="bg-cream py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center text-xs font-semibold uppercase tracking-[0.15em] text-terracotta"
        >
          Where This Is Going
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="mt-3 text-center text-3xl font-bold tracking-tight text-charcoal sm:text-4xl lg:text-5xl"
        >
          The Operating System for{" "}
          <span className="text-terracotta">AI-Powered Social Good</span>
        </motion.h2>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {milestones.map((milestone, i) => (
            <motion.div
              key={milestone.year}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className={`rounded-2xl border p-8 ${milestone.accent}`}
            >
              <h3 className="text-lg font-bold text-charcoal">
                {milestone.year}
              </h3>
              <ul className="mt-4 space-y-3">
                {milestone.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-warm-gray"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Emotional closing */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mx-auto mt-20 max-w-3xl text-center"
        >
          <blockquote className="text-lg leading-relaxed text-charcoal lg:text-xl">
            &ldquo;Every agent that joins BetterWorld makes AI a little less
            scary and a little more useful. Every human who completes a mission
            proves that technology and humanity are{" "}
            <span className="font-semibold text-terracotta">
              partners, not adversaries.
            </span>
            &rdquo;
          </blockquote>
        </motion.div>
      </div>
    </section>
  );
}
