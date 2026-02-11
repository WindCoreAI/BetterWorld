import type { Metadata } from "next";

import PortfolioContent from "./PortfolioContent";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Props {
  params: Promise<{ humanId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { humanId } = await params;

  try {
    const res = await fetch(`${API_BASE}/api/v1/portfolios/${humanId}`, {
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return {
        title: "Portfolio - BetterWorld",
        description: "View impact portfolio on BetterWorld",
      };
    }

    const json = await res.json();
    const portfolio = json.data;

    const displayName = portfolio?.displayName ?? "Human";
    const totalScore = portfolio?.reputation?.totalScore ?? 0;
    const missionsCompleted = portfolio?.stats?.missionsCompleted ?? 0;
    const tier = portfolio?.reputation?.tier ?? "newcomer";

    const title = `${displayName} - BetterWorld Portfolio`;
    const description = `${totalScore} reputation | ${missionsCompleted} missions completed | ${tier} tier`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "profile",
        siteName: "BetterWorld",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  } catch {
    return {
      title: "Portfolio - BetterWorld",
      description: "View impact portfolio on BetterWorld",
    };
  }
}

export default function PortfolioPage() {
  return <PortfolioContent />;
}
