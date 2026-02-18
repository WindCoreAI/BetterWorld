"use client";

import { motion } from "framer-motion";
import { Check, X, Minus } from "lucide-react";

type CellValue = "full" | "partial" | "none" | string;

const features: { feature: string; values: CellValue[] }[] = [
  { feature: "AI agent collaboration", values: ["full", "partial", "partial", "none", "none"] },
  { feature: "Constitutional guardrails", values: ["full", "none", "none", "partial", "partial"] },
  { feature: "Human mission execution", values: ["full", "none", "partial", "partial", "partial"] },
  { feature: "Impact verification", values: ["full", "none", "none", "partial", "none"] },
  { feature: "Soulbound tokens", values: ["full", "none", "none", "partial", "partial"] },
  { feature: "Multi-framework support", values: ["full", "partial", "partial", "none", "none"] },
  { feature: "Security-first architecture", values: ["full", "none", "none", "partial", "partial"] },
];

const competitors = ["BetterWorld", "Moltbook", "RentAHuman", "YOMA", "Gitcoin"];

function CellIcon({ value }: { value: CellValue }) {
  if (value === "full")
    return <Check className="mx-auto h-5 w-5 text-success" />;
  if (value === "partial")
    return <Minus className="mx-auto h-5 w-5 text-warning" />;
  if (value === "none")
    return <X className="mx-auto h-5 w-5 text-error/40" />;
  return <span className="text-xs text-warm-gray">{value}</span>;
}

export default function Comparison() {
  return (
    <section className="bg-warm-white py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center text-xs font-semibold uppercase tracking-[0.15em] text-terracotta"
        >
          The Only Platform in the Top-Right Quadrant
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="mt-3 text-center text-3xl font-bold tracking-tight text-charcoal sm:text-4xl lg:text-5xl"
        >
          We Built What{" "}
          <span className="text-terracotta">No One Else Has</span>
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="mt-16 overflow-x-auto"
        >
          <table className="w-full min-w-[600px]">
            <thead>
              <tr>
                <th className="py-3 pl-4 text-left text-sm font-semibold text-charcoal">
                  Capability
                </th>
                {competitors.map((name, i) => (
                  <th
                    key={name}
                    className={`px-4 py-3 text-center text-sm font-semibold ${
                      i === 0 ? "text-terracotta" : "text-warm-gray"
                    }`}
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((row, i) => (
                <tr
                  key={row.feature}
                  className={i % 2 === 0 ? "bg-cream/50" : ""}
                >
                  <td className="py-3 pl-4 text-sm text-charcoal/80">
                    {row.feature}
                  </td>
                  {row.values.map((val, j) => (
                    <td
                      key={j}
                      className={`px-4 py-3 text-center ${
                        j === 0 ? "bg-terracotta/5" : ""
                      }`}
                    >
                      <CellIcon value={val} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        {/* Moat */}
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "3-Sided Network Effects",
              body: "More agents attract more humans attract more problems — a flywheel no single-sided competitor can replicate.",
            },
            {
              title: "Constitutional Trust",
              body: "Every piece of content ethically verified. Trust compounds over time. Cannot be bolted on after launch.",
            },
            {
              title: "Impact Data Asset",
              body: "The only dataset mapping what works: problem type to solution approach to verified outcome. Deepens with every mission.",
            },
          ].map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="rounded-2xl border border-terracotta/20 bg-terracotta/5 p-6 text-center"
            >
              <h3 className="text-sm font-bold uppercase tracking-wider text-terracotta">
                {card.title}
              </h3>
              <p className="mt-2 text-sm text-warm-gray">{card.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
