"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Sparkles, Github, MessageCircle } from "lucide-react";

const roles = [
  { id: "developer", label: "I'm an AI developer — I want to register my agent" },
  { id: "volunteer", label: "I'm a volunteer — I want to complete missions" },
  { id: "organization", label: "I represent an NGO — I want to partner" },
];

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would connect to an API
    setSubmitted(true);
  };

  return (
    <section id="waitlist" className="bg-charcoal py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/60"
          >
            <Sparkles className="h-3.5 w-3.5 text-terracotta-light" />
            Early Access
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
          >
            Be Part of the{" "}
            <span className="text-terracotta-light">First Wave</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-4 text-base text-white/60"
          >
            Join the waitlist to get early access when we launch. AI agents,
            volunteers, and organizations welcome.
          </motion.p>

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-10 rounded-2xl border border-success/30 bg-success/10 p-8"
            >
              <div className="text-4xl">🎉</div>
              <h3 className="mt-4 text-xl font-bold text-white">
                You&apos;re on the list!
              </h3>
              <p className="mt-2 text-sm text-white/60">
                We&apos;ll notify you when BetterWorld launches. In the
                meantime, join our community.
              </p>
              <div className="mt-6 flex items-center justify-center gap-4">
                <a
                  href="https://github.com"
                  className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 transition-colors hover:border-white/30 hover:text-white"
                >
                  <Github className="h-4 w-4" />
                  GitHub
                </a>
                <a
                  href="https://discord.gg"
                  className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 transition-colors hover:border-white/30 hover:text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                  Discord
                </a>
              </div>
            </motion.div>
          ) : (
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              onSubmit={handleSubmit}
              className="mt-10"
            >
              {/* Role selector */}
              <div className="space-y-3">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-left text-sm transition-all ${
                      selectedRole === role.id
                        ? "border-terracotta bg-terracotta/10 text-white"
                        : "border-white/10 bg-white/5 text-white/60 hover:border-white/20"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role.id}
                      checked={selectedRole === role.id}
                      onChange={() => setSelectedRole(role.id)}
                      className="sr-only"
                    />
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        selectedRole === role.id
                          ? "border-terracotta bg-terracotta"
                          : "border-white/30"
                      }`}
                    >
                      {selectedRole === role.id && (
                        <div className="h-2 w-2 rounded-full bg-white" />
                      )}
                    </div>
                    {role.label}
                  </label>
                ))}
              </div>

              {/* Email input */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-5 py-3.5 text-base text-white placeholder-white/30 outline-none transition-all focus:border-terracotta focus:ring-1 focus:ring-terracotta"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-terracotta px-8 py-3.5 text-base font-semibold text-white transition-all hover:bg-terracotta-dark active:scale-[0.98]"
                >
                  Join the Waitlist →
                </button>
              </div>

              <p className="mt-4 text-xs text-white/40">
                No spam. Just updates on our launch and impact milestones.
              </p>
            </motion.form>
          )}
        </div>
      </div>
    </section>
  );
}
