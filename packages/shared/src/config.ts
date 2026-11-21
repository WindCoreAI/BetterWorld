import { z } from "zod";

/** `FOO=` in a .env file means "not set", not "set to the empty string". */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const envSchema = z.object({
  // Critical infrastructure (required, no defaults)
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  // AI provider key. Optional: without it the platform runs in operator-moderated
  // mode — submissions and evidence go to the human review queues instead of
  // being scored by the classifier / vision model. Nothing is auto-approved.
  ANTHROPIC_API_KEY: z.preprocess(
    blankToUndefined,
    z.string().startsWith("sk-ant-", "Invalid Anthropic API key format").optional(),
  ),

  // Comma-separated emails of operators. A verified account with one of these
  // addresses has admin access (review queues, admin dashboards).
  ADMIN_EMAILS: z
    .preprocess(blankToUndefined, z.string().optional())
    .transform((s) =>
      (s ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),

  // Server configuration (with defaults for development)
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((s) => s.split(",")),

  // OAuth providers (optional — required only when OAuth is enabled)
  GOOGLE_CLIENT_ID: z.preprocess(blankToUndefined, z.string().optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(blankToUndefined, z.string().optional()),
  GITHUB_CLIENT_ID: z.preprocess(blankToUndefined, z.string().optional()),
  GITHUB_CLIENT_SECRET: z.preprocess(blankToUndefined, z.string().optional()),

  // OAuth URLs
  API_URL: z.string().url().default("http://localhost:4000"),
  WEB_URL: z.string().url().default("http://localhost:3000"),

  // Token expiry
  ACCESS_TOKEN_EXPIRY: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRY: z.string().default("7d"),

  // Message encryption (Sprint 7: Agent Messaging)
  MESSAGE_ENCRYPTION_KEY: z.preprocess(
    blankToUndefined,
    z.string().min(32, "MESSAGE_ENCRYPTION_KEY must be at least 32 chars (base64-encoded 32 bytes)").optional(),
  ),

  // Legacy object-storage settings. Nothing reads these any more: evidence is
  // stored in Supabase Storage when SUPABASE_URL + SUPABASE_SERVICE_KEY are set
  // and on local disk (LOCAL_STORAGE_DIR) otherwise. Still accepted so that
  // existing .env files keep validating.
  STORAGE_PROVIDER: z.enum(["minio", "supabase"]).default("minio"),
  STORAGE_ENDPOINT: z.preprocess(blankToUndefined, z.string().url().optional()),
  STORAGE_ACCESS_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  STORAGE_SECRET_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  STORAGE_BUCKET: z.string().default("betterworld-evidence"),

  // Sprint 8: Evidence Verification
  SUPABASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  SUPABASE_SERVICE_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  SUPABASE_STORAGE_BUCKET: z.string().default("evidence"),
  VISION_DAILY_BUDGET_CENTS: z.coerce.number().int().nonnegative().default(3700), // $37/day
  PEER_REVIEW_REWARD: z.coerce.number().int().positive().default(2), // IT per review
});

export type EnvConfig = z.infer<typeof envSchema>;

let _config: EnvConfig | null = null;

export function loadConfig(env: Record<string, string | undefined> = process.env): EnvConfig {
  if (_config) return _config;

  const result = envSchema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    const missing = Object.entries(formatted)
      .map(([key, errors]) => `  ${key}: ${(errors ?? []).join(", ")}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${missing}`);
  }

  _config = result.data;
  return _config;
}

export function resetConfig(): void {
  _config = null;
}

/**
 * Whether an AI provider key is configured for this process.
 *
 * Reads the environment directly (not the cached config) because workers do
 * not call loadConfig(). A key that is present but wrong is handled where the
 * call is made: an authentication error routes the item to human review.
 */
export function isAiConfigured(env: Record<string, string | undefined> = process.env): boolean {
  const key = env.ANTHROPIC_API_KEY?.trim();
  return !!key && key.startsWith("sk-ant-");
}

/**
 * Operator emails from ADMIN_EMAILS (lower-cased). Reads the environment
 * directly so it also works in processes that never call loadConfig().
 */
export function adminEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(
  email: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!email) return false;
  return adminEmails(env).includes(email.trim().toLowerCase());
}

export { envSchema };
