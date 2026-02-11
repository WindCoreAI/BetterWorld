import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "BetterWorld Portfolio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const TIER_COLORS: Record<string, string> = {
  newcomer: "#9CA3AF",
  contributor: "#3B82F6",
  advocate: "#8B5CF6",
  leader: "#F59E0B",
  champion: "#EF4444",
};

export default async function Image({
  params,
}: {
  params: Promise<{ humanId: string }>;
}) {
  const { humanId } = await params;

  let displayName = "Human";
  let totalScore = 0;
  let tier = "newcomer";
  let missionsCompleted = 0;
  let topDomain = "";

  try {
    const res = await fetch(`${API_BASE}/api/v1/portfolios/${humanId}`, {
      next: { revalidate: 300 },
    });

    if (res.ok) {
      const json = await res.json();
      const portfolio = json.data;
      displayName = portfolio?.displayName ?? "Human";
      totalScore = portfolio?.reputation?.totalScore ?? 0;
      tier = portfolio?.reputation?.tier ?? "newcomer";
      missionsCompleted = portfolio?.stats?.missionsCompleted ?? 0;
      topDomain = portfolio?.stats?.domainsContributed?.[0] ?? "";
    }
  } catch {
    // Use defaults on fetch failure
  }

  const tierColor = TIER_COLORS[tier] ?? "#9CA3AF";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #F5F0EB 0%, #E8E0D8 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
          }}
        >
          {/* Avatar circle */}
          <div
            style={{
              width: "120px",
              height: "120px",
              borderRadius: "60px",
              background: tierColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "48px",
              color: "white",
              fontWeight: "bold",
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>

          {/* Name */}
          <div
            style={{
              fontSize: "48px",
              fontWeight: "bold",
              color: "#2D2D2D",
            }}
          >
            {displayName}
          </div>

          {/* Tier badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                padding: "8px 24px",
                borderRadius: "24px",
                background: tierColor,
                color: "white",
                fontSize: "24px",
                fontWeight: "600",
                textTransform: "capitalize",
              }}
            >
              {tier}
            </div>
          </div>

          {/* Stats row */}
          <div
            style={{
              display: "flex",
              gap: "48px",
              marginTop: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: "36px", fontWeight: "bold", color: "#2D2D2D" }}>
                {totalScore}
              </div>
              <div style={{ fontSize: "18px", color: "#6B7280" }}>Reputation</div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: "36px", fontWeight: "bold", color: "#2D2D2D" }}>
                {missionsCompleted}
              </div>
              <div style={{ fontSize: "18px", color: "#6B7280" }}>Missions</div>
            </div>
            {topDomain && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: "36px", fontWeight: "bold", color: "#2D2D2D" }}>
                  {topDomain.replace(/_/g, " ")}
                </div>
                <div style={{ fontSize: "18px", color: "#6B7280" }}>Top Domain</div>
              </div>
            )}
          </div>

          {/* Branding */}
          <div
            style={{
              marginTop: "24px",
              fontSize: "20px",
              color: "#9CA3AF",
              fontWeight: "500",
            }}
          >
            BetterWorld Impact Portfolio
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
