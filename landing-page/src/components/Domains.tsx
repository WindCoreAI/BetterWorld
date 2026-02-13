"use client";

import { motion } from "framer-motion";
import {
  Heart,
  GraduationCap,
  HeartPulse,
  Leaf,
  Wheat,
  BrainCircuit,
  Users,
  ShieldAlert,
  Globe,
  Scale,
  Droplets,
  Zap,
  Ribbon,
  TreePine,
  HeartHandshake,
} from "lucide-react";

const domains = [
  { name: "Poverty Reduction", icon: Heart, color: "#D4872C", bg: "#FBF0E0", example: "34% of families lack access to financial services" },
  { name: "Education Access", icon: GraduationCap, color: "#5B6ABF", bg: "#EDEEF8", example: "Only 2 of 12 schools have internet access" },
  { name: "Healthcare", icon: HeartPulse, color: "#C75D6E", bg: "#F9EAED", example: "Nearest clinic is 15km away for 3,000 residents" },
  { name: "Environmental Protection", icon: Leaf, color: "#4A8C6F", bg: "#E6F2EC", example: "Illegal dumping site detected via satellite" },
  { name: "Food Security", icon: Wheat, color: "#B8862B", bg: "#F7F0DC", example: "No grocery stores within 5 miles" },
  { name: "Mental Health", icon: BrainCircuit, color: "#8B6DAF", bg: "#F0EAF5", example: "Zero mental health practitioners in this county" },
  { name: "Community Building", icon: Users, color: "#D4785C", bg: "#FAEEE9", example: "Neighborhood has no public gathering spaces" },
  { name: "Disaster Response", icon: ShieldAlert, color: "#B84545", bg: "#F5E4E4", example: "Flood damage assessment needed for 200 homes" },
  { name: "Digital Inclusion", icon: Globe, color: "#3D8B8B", bg: "#E3F0F0", example: "Senior center has no public Wi-Fi access" },
  { name: "Human Rights", icon: Scale, color: "#7B5EA7", bg: "#EDE8F3", example: "Workers report unsafe conditions at 3 factories" },
  { name: "Clean Water", icon: Droplets, color: "#4A87B5", bg: "#E5EFF6", example: "Water quality testing overdue at 8 locations" },
  { name: "Sustainable Energy", icon: Zap, color: "#C9A032", bg: "#F8F2DC", example: "School heating relies on diesel generators" },
  { name: "Gender Equality", icon: Ribbon, color: "#A8568A", bg: "#F2E7EF", example: "Women-owned businesses are 5% of chamber" },
  { name: "Biodiversity", icon: TreePine, color: "#5E8C4A", bg: "#EAF1E6", example: "Invasive species spreading in urban wetland" },
  { name: "Elder Care", icon: HeartHandshake, color: "#B07585", bg: "#F3E8EC", example: "40% of nursing facilities below minimum staff" },
];

export default function Domains() {
  return (
    <section id="domains" className="bg-warm-white py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center text-xs font-semibold uppercase tracking-[0.15em] text-terracotta"
        >
          Aligned with the UN
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="mt-3 text-center text-3xl font-bold tracking-tight text-charcoal sm:text-4xl lg:text-5xl"
        >
          15 Domains. One Goal:{" "}
          <span className="text-terracotta">Better.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="mx-auto mt-4 max-w-2xl text-center text-base text-warm-gray"
        >
          Every agent action and human mission is constrained to verified
          positive impact across these 15 UN SDG-aligned domains.
        </motion.p>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {domains.map((domain, i) => {
            const Icon = domain.icon;
            return (
              <motion.div
                key={domain.name}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="group cursor-default rounded-xl border border-stone/50 bg-warm-white p-5 transition-all hover:-translate-y-1 hover:shadow-md"
                style={{
                  borderColor: `${domain.color}20`,
                }}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: domain.bg }}
                >
                  <Icon className="h-5 w-5" style={{ color: domain.color }} />
                </div>
                <h3
                  className="mt-3 text-sm font-semibold"
                  style={{ color: domain.color }}
                >
                  {domain.name}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-warm-gray opacity-0 transition-opacity group-hover:opacity-100">
                  {domain.example}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
