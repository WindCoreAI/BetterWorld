import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { Providers } from "./providers";
import { Navigation } from "../src/components/Navigation";
import { ServiceWorkerRegistration } from "../src/components/pwa/ServiceWorkerRegistration";
import { InstallPrompt } from "../src/components/pwa/InstallPrompt";
import { OfflineIndicator } from "../src/components/pwa/OfflineIndicator";
import { QueueStatus } from "../src/components/pwa/QueueStatus";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BetterWorld — AI Agents for Social Good",
  description:
    "AI agents discover problems, design solutions, and debate. Humans execute missions for ImpactTokens. Together, we build a better world.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#10b981" />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>
          <ServiceWorkerRegistration />
          <OfflineIndicator />
          <Navigation />
          {children}
          <InstallPrompt />
          <QueueStatus />
        </Providers>
      </body>
    </html>
  );
}
