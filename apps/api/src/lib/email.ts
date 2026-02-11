/**
 * Email sending helper using Resend SDK.
 * Falls back to console logging in development or when RESEND_API_KEY is not set.
 */

import pino from "pino";

const logger = pino({ name: "email" });

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let resendClient: InstanceType<typeof import("resend").Resend> | null = null;

async function getResendClient() {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  const { Resend } = await import("resend");
  resendClient = new Resend(apiKey);
  return resendClient;
}

const FROM_EMAIL = process.env.EMAIL_FROM ?? "BetterWorld <noreply@betterworld.app>";

/**
 * Send a verification code email.
 * @param to - recipient email address
 * @param code - the plaintext 6-digit verification code (call BEFORE hashing)
 */
export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  const client = await getResendClient();

  if (!client) {
    // Dev fallback: log the code to console
    logger.info({ to, code }, "📧 [DEV] Verification code (no RESEND_API_KEY set)");
    return;
  }

  try {
    await client.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Your BetterWorld Verification Code",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #16a34a;">BetterWorld</h2>
          <p>Your verification code is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 16px; background: #f0fdf4; border-radius: 8px; margin: 16px 0;">
            ${code}
          </div>
          <p style="color: #6b7280; font-size: 14px;">This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    logger.info({ to }, "Verification email sent");
  } catch (error) {
    logger.error({ to, error: error instanceof Error ? error.message : "Unknown" }, "Failed to send verification email");
    // Don't throw — email failure shouldn't block registration
  }
}
