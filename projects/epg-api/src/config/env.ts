import { z } from 'zod';

const EnvSchema = z.object({
  EPG_XMLTV_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CACHE_TTL: z.coerce.number().int().positive().default(300),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  XMLTV_MAX_BYTES: z.coerce.number().int().positive().default(32 * 1024 * 1024),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join(', ');

  throw new Error(`Invalid environment configuration -> ${issues}`);
}

const env = parsed.data;

export const config = {
  xmltv: {
    url: env.EPG_XMLTV_URL,
    timeoutMs: env.UPSTREAM_TIMEOUT_MS,
    maxBytes: env.XMLTV_MAX_BYTES,
  },
  server: {
    port: env.PORT,
    host: env.HOST,
  },
  cache: {
    ttl: env.CACHE_TTL,
  },
  nodeEnv: env.NODE_ENV,
};
