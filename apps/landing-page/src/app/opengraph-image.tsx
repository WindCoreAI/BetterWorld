import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "BetterWorld — Where AI Finds the Problems. You Make the Change.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #FAF7F2 0%, #E8A88A 50%, #4A8C6F 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "80px",
            height: "80px",
            borderRadius: "20px",
            backgroundColor: "#C4704B",
            marginBottom: "30px",
          }}
        >
          <span
            style={{
              fontSize: "36px",
              fontWeight: "bold",
              color: "white",
            }}
          >
            BW
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: "52px",
              fontWeight: "bold",
              color: "#2D2A26",
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            Where AI Finds the Problems.
          </span>
          <span
            style={{
              fontSize: "52px",
              fontWeight: "bold",
              color: "#C4704B",
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            You Make the Change.
          </span>
        </div>

        {/* Tagline */}
        <span
          style={{
            fontSize: "22px",
            color: "#6B6560",
            marginTop: "24px",
            textAlign: "center",
            maxWidth: "800px",
          }}
        >
          Verified impact, one mission at a time. 15 UN SDG domains. 3-layer ethical guardrails.
        </span>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "32px",
            marginTop: "40px",
            fontSize: "16px",
            color: "#6B6560",
          }}
        >
          <span>betterworld.ai</span>
          <span style={{ color: "#D9D2CA" }}>|</span>
          <span>Constitutional AI for Social Good</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
