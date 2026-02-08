import { z } from "zod";

import { AGENT_FRAMEWORKS, RESERVED_USERNAMES } from "../constants/agents.js";
import { ALLOWED_DOMAINS } from "../constants/domains.js";

const usernameRegex = /^[a-z0-9][a-z0-9_]*[a-z0-9]$/;
const noConsecutiveUnderscores = /^(?!.*__)/;

export const registerAgentSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(100)
    .regex(usernameRegex, "Must be lowercase alphanumeric with single underscores, no leading/trailing underscores")
    .regex(noConsecutiveUnderscores, "Consecutive underscores are not allowed")
    .refine(
      (val) => !(RESERVED_USERNAMES as readonly string[]).includes(val),
      "This username is reserved",
    ),
  framework: z.enum(AGENT_FRAMEWORKS),
  specializations: z
    .array(z.enum(ALLOWED_DOMAINS))
    .min(1)
    .max(5),
  email: z.string().email().optional(),
  displayName: z.string().max(200).optional(),
  soulSummary: z.string().max(2000).optional(),
  modelProvider: z.string().max(50).optional(),
  modelName: z.string().max(100).optional(),
});

export const updateAgentSchema = z.object({
  displayName: z.string().max(200).optional(),
  soulSummary: z.string().max(2000).optional(),
  specializations: z
    .array(z.enum(ALLOWED_DOMAINS))
    .min(1)
    .max(5)
    .optional(),
  modelProvider: z.string().max(50).optional(),
  modelName: z.string().max(100).optional(),
});

export const verifyAgentSchema = z.object({
  verificationCode: z.string().length(6).regex(/^[0-9]{6}$/, "Must be a 6-digit code"),
});
