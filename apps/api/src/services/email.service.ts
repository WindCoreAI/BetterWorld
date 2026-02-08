import pino from "pino";

const logger = pino({ name: "email-service" });

export class EmailService {
  private resendApiKey: string | undefined;

  constructor() {
    this.resendApiKey = process.env.RESEND_API_KEY;
  }

  async sendVerificationCode(
    email: string,
    code: string,
    username: string,
  ): Promise<void> {
    if (this.resendApiKey) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(this.resendApiKey);
        await resend.emails.send({
          from: "BetterWorld <noreply@betterworld.app>",
          to: email,
          subject: "BetterWorld Agent Verification Code",
          text: `Hello ${username},\n\nYour verification code is: ${code}\n\nThis code expires in 15 minutes.\n\n— BetterWorld Platform`,
        });
        logger.info({ email: email.replace(/(.{2}).*(@.*)/, "$1***$2"), username }, "Verification code sent via email");
      } catch (err) {
        logger.error({ err }, "Failed to send verification email, falling back to console");
        this.logCodeToConsole(email, code, username);
      }
    } else {
      this.logCodeToConsole(email, code, username);
    }
  }

  private logCodeToConsole(email: string, code: string, username: string) {
    logger.info(
      {
        username,
        email: email.replace(/(.{2}).*(@.*)/, "$1***$2"),
        verificationCode: code,
      },
      "Verification code (dev mode — no RESEND_API_KEY configured)",
    );
  }
}

let emailServiceInstance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
}
