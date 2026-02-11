import { z } from "zod";

const envSchema = z.object({
  // Critical infrastructure (required, no defaults)
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-", "Invalid Anthropic API key format"),

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
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // OAuth URLs
  API_URL: z.string().url().default("http://localhost:4000"),
  WEB_URL: z.string().url().default("http://localhost:3000"),

  // Token expiry
  ACCESS_TOKEN_EXPIRY: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRY: z.string().default("7d"),

  // Message encryption (Sprint 7: Agent Messaging)
  MESSAGE_ENCRYPTION_KEY: z.string().min(32, "MESSAGE_ENCRYPTION_KEY must be at least 32 chars (base64-encoded 32 bytes)").optional(),

  // Storage (optional for development, minio defaults)
  STORAGE_PROVIDER: z.enum(["minio", "supabase"]).default("minio"),
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().default("betterworld-evidence"),
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

export { envSchema };
