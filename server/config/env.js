import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/settleup'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').default('development-only-change-me-development-only'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173')
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

if (env.NODE_ENV === 'production' && env.JWT_SECRET === 'development-only-change-me-development-only') {
  throw new Error('JWT_SECRET must be explicitly configured in production');
}
