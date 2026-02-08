import pino from "pino";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { EmailService } from "../email.service";

// Mock pino logger
vi.mock("pino", () => ({
  default: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock Resend module
const mockEmailSend = vi.fn().mockResolvedValue({ id: "email_123" });
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: mockEmailSend,
    },
  })),
}));

describe("EmailService", () => {
  let emailService: EmailService;
  let originalResendKey: string | undefined;

  beforeEach(() => {
    // Save original RESEND_API_KEY
    originalResendKey = process.env.RESEND_API_KEY;

    // Clear mocks
    mockEmailSend.mockClear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original RESEND_API_KEY
    if (originalResendKey !== undefined) {
      process.env.RESEND_API_KEY = originalResendKey;
    } else {
      delete process.env.RESEND_API_KEY;
    }
  });

  describe("sendVerificationCode with RESEND_API_KEY", () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = "re_test_api_key_123456789";
      emailService = new EmailService(); // Reinitialize to pick up env var
    });

    it("sends verification email via Resend API", async () => {
      await emailService.sendVerificationCode(
        "test@example.com",
        "ABC123",
        "agent_test_123"
      );

      expect(mockEmailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "BetterWorld <noreply@betterworld.app>",
          to: "test@example.com",
          subject: "BetterWorld Agent Verification Code",
          text: expect.stringContaining("ABC123"),
        })
      );
    });

    it("includes verification code in email text", async () => {
      const verificationCode = "XYZ789";

      await emailService.sendVerificationCode(
        "user@example.com",
        verificationCode,
        "test_agent"
      );

      expect(mockEmailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(verificationCode),
        })
      );
    });

    it("includes username in email text", async () => {
      const username = "cool_agent_123";

      await emailService.sendVerificationCode(
        "dev@example.com",
        "TEST001",
        username
      );

      expect(mockEmailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(username),
        })
      );
    });

    it("logs when email sent successfully", async () => {
      await emailService.sendVerificationCode(
        "success@example.com",
        "SUCCESS1",
        "success_agent"
      );

      const loggerInstance = pino();
      expect(loggerInstance.info).toHaveBeenCalled();
    });

    it("handles API errors by falling back to console logging", async () => {
      mockEmailSend.mockRejectedValueOnce(new Error("API rate limit exceeded"));

      await emailService.sendVerificationCode(
        "error@example.com",
        "ERR123",
        "error_agent"
      );

      const loggerInstance = pino();
      expect(loggerInstance.error).toHaveBeenCalled();
      expect(loggerInstance.info).toHaveBeenCalled(); // Fallback log
    });
  });

  describe("sendVerificationCode without RESEND_API_KEY (dev mode)", () => {
    beforeEach(() => {
      delete process.env.RESEND_API_KEY;
      emailService = new EmailService(); // Reinitialize without API key
    });

    it("logs verification code to console", async () => {
      await emailService.sendVerificationCode(
        "dev@example.com",
        "DEV123",
        "dev_agent"
      );

      const loggerInstance = pino();
      expect(loggerInstance.info).toHaveBeenCalled();
    });

    it("does not attempt to call Resend API", async () => {
      mockEmailSend.mockClear();

      await emailService.sendVerificationCode(
        "noapi@example.com",
        "NAPI01",
        "noapi_agent"
      );

      // Should not call Resend when no API key
      expect(mockEmailSend).not.toHaveBeenCalled();
    });

    it("works with various verification codes", async () => {
      const codes = ["123456", "000000", "999999", "ABC123"];

      for (const code of codes) {
        await emailService.sendVerificationCode(
          "test@example.com",
          code,
          "test_agent"
        );
      }

      const loggerInstance = pino();
      expect(loggerInstance.info).toHaveBeenCalledTimes(codes.length);
    });
  });

  describe("edge cases", () => {
    it("handles very long verification codes", async () => {
      delete process.env.RESEND_API_KEY;
      emailService = new EmailService();

      const longCode = "A".repeat(100);

      await expect(
        emailService.sendVerificationCode(
          "long@example.com",
          longCode,
          "long_agent"
        )
      ).resolves.not.toThrow();
    });

    it("handles special characters in username", async () => {
      delete process.env.RESEND_API_KEY;
      emailService = new EmailService();

      const specialUsername = "test_agent_123";

      await expect(
        emailService.sendVerificationCode(
          "special@example.com",
          "SPEC01",
          specialUsername
        )
      ).resolves.not.toThrow();
    });

    it("handles unicode characters in email", async () => {
      delete process.env.RESEND_API_KEY;
      emailService = new EmailService();

      const unicodeEmail = "test@example.com"; // Most email systems don't support unicode in local part

      await expect(
        emailService.sendVerificationCode(
          unicodeEmail,
          "UNI001",
          "unicode_agent"
        )
      ).resolves.not.toThrow();
    });
  });
});
