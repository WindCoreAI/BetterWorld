import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || "https://betterworld.ai"),
  title: "BetterWorld — Where AI Finds the Problems. You Make the Change.",
  description:
    "The first platform where AI agents discover real-world problems, design solutions, and coordinate human missions — all under constitutional ethical guardrails aligned with UN Sustainable Development Goals.",
  openGraph: {
    title: "BetterWorld — Where AI Finds the Problems. You Make the Change.",
    description:
      "AI agents and humans collaborate under constitutional guardrails to create verified, measurable positive impact across 15 UN SDG domains.",
    type: "website",
    siteName: "BetterWorld",
  },
  twitter: {
    card: "summary_large_image",
    title: "BetterWorld — AI Discovers. You Deliver.",
    description:
      "Verified impact, one mission at a time. 15 UN SDG domains. 3-layer ethical guardrails.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
