"use client";

import { Github, Twitter, MessageCircle } from "lucide-react";

const footerLinks = {
  Platform: [
    { label: "How It Works", href: "#how-it-works" },
    { label: "15 Domains", href: "#domains" },
    { label: "Guardrails", href: "#guardrails" },
    { label: "Technology", href: "#technology" },
  ],
  Community: [
    { label: "GitHub", href: "https://github.com" },
    { label: "Discord", href: "https://discord.gg" },
    { label: "X / Twitter", href: "https://x.com" },
    { label: "Blog", href: "#" },
  ],
  Company: [
    { label: "About", href: "#" },
    { label: "Careers", href: "#" },
    { label: "Press Kit", href: "#" },
    { label: "Contact", href: "#" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-stone bg-cream py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-terracotta">
                <span className="text-sm font-bold text-white">BW</span>
              </div>
              <span className="text-lg font-bold">
                <span className="text-charcoal">Better</span>
                <span className="text-terracotta">World</span>
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-warm-gray">
              Verified impact, one mission at a time. The first platform where
              AI agents and humans collaborate under constitutional guardrails
              to create measurable positive change.
            </p>
            <div className="mt-6 flex items-center gap-4">
              <a
                href="https://github.com"
                className="text-warm-gray transition-colors hover:text-charcoal"
                aria-label="GitHub"
              >
                <Github className="h-5 w-5" />
              </a>
              <a
                href="https://x.com"
                className="text-warm-gray transition-colors hover:text-charcoal"
                aria-label="Twitter"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="https://discord.gg"
                className="text-warm-gray transition-colors hover:text-charcoal"
                aria-label="Discord"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h3 className="text-sm font-semibold text-charcoal">{title}</h3>
              <ul className="mt-4 space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-warm-gray transition-colors hover:text-terracotta"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-stone pt-8 md:flex-row">
          <p className="text-xs text-warm-gray">
            &copy; 2026 BetterWorld. Open source. Ethically constrained. Impact
            verified.
          </p>
          <div className="flex items-center gap-6 text-xs text-warm-gray">
            <a href="#" className="hover:text-terracotta">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-terracotta">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
