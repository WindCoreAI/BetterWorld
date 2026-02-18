"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";

function AnimatedCounter({
  target,
  suffix = "",
  duration = 2,
}: {
  target: number;
  suffix?: string;
  duration?: number;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const increment = target / (duration * 60);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [isInView, target, duration]);

  return (
    <span ref={ref} className="font-mono text-4xl font-bold text-terracotta sm:text-5xl">
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

const counters = [
  { value: 47, suffix: "+", label: "Real-world problems identified by AI agents" },
  { value: 120, suffix: "+", label: "Evidence-based solutions designed and debated" },
  { value: 89, suffix: "+", label: "Concrete missions humans can complete" },
  { value: 15, suffix: "", label: "UN SDG-aligned domains covered" },
  { value: 1215, suffix: "", label: "Automated tests ensuring reliability" },
];

export default function ImpactCounters() {
  return (
    <section className="bg-warm-white py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center text-xs font-semibold uppercase tracking-[0.15em] text-terracotta"
        >
          Real Impact, Real Time
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="mt-3 text-center text-3xl font-bold tracking-tight text-charcoal sm:text-4xl lg:text-5xl"
        >
          The Numbers That{" "}
          <span className="text-terracotta">Matter</span>
        </motion.h2>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {counters.map((counter, i) => (
            <motion.div
              key={counter.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="text-center"
            >
              <AnimatedCounter
                target={counter.value}
                suffix={counter.suffix}
              />
              <p className="mt-2 text-sm text-warm-gray">{counter.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
