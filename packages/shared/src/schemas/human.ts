/**
 * Human Onboarding Zod Schemas (Sprint 6)
 */

import { z } from "zod";

// ============================================================
// Registration & Auth Schemas
// ============================================================

export const RegisterSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain uppercase, lowercase, and number",
    ),
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters")
    .max(200, "Display name must be at most 200 characters"),
});

export const VerifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, "Verification code must be 6 digits").regex(/^\d{6}$/, "Code must be numeric"),
});

export const ResendCodeSchema = z.object({
  email: z.string().email(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// ============================================================
// Profile Schemas
// ============================================================

export const ProfileCreateSchema = z.object({
  skills: z
    .array(z.string().min(1).max(100))
    .min(1, "At least one skill is required")
    .max(50, "Maximum 50 skills allowed"),
  city: z.string().min(1).max(200),
  country: z.string().min(1).max(100),
  serviceRadius: z.number().int().min(5).max(50).default(10), // km
  languages: z
    .array(z.string().length(2, "Language code must be ISO 639-1 format"))
    .min(1, "At least one language is required")
    .max(20, "Maximum 20 languages allowed"),
  availability: z
    .object({
      weekdays: z.array(z.string()).optional(),
      weekends: z.array(z.string()).optional(),
      timezone: z.string().optional(),
    })
    .optional(),
  bio: z.string().max(500, "Bio must be at most 500 characters").optional(),
  walletAddress: z
    .string()
    .max(100, "Wallet address must be at most 100 characters")
    .optional(),
  certifications: z
    .array(z.string().min(1).max(200))
    .max(20, "Maximum 20 certifications allowed")
    .optional(),
});

export const ProfileUpdateSchema = ProfileCreateSchema.partial();

// ============================================================
// Token Schemas
// ============================================================

export const SpendTokensSchema = z.object({
  amount: z.number().int().positive("Amount must be positive"),
  type: z.enum([
    "spend_vote",
    "spend_circle",
    "spend_analytics",
    "spend_custom",
  ]),
  referenceId: z.string().uuid().optional(),
  referenceType: z
    .enum(["problem", "solution", "mission", "circle"])
    .optional(),
  description: z.string().max(500).optional(),
  idempotencyKey: z.string().max(64).optional(), // Will be generated if not provided
});

// ============================================================
// Orientation Schemas
// ============================================================

export const OrientationProgressSchema = z.object({
  step: z.number().int().min(1).max(5), // 5 steps total
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================
// Type Exports (inferred from Zod schemas)
// ============================================================

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;
export type ResendCodeInput = z.infer<typeof ResendCodeSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
export type ProfileCreateInput = z.infer<typeof ProfileCreateSchema>;
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;
export type SpendTokensInput = z.infer<typeof SpendTokensSchema>;
export type OrientationProgressInput = z.infer<typeof OrientationProgressSchema>;
