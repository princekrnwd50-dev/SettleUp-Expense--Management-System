import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import { User } from '../models/User.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const credentials = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});
const loginSchema = credentials.pick({ email: true, password: true });
const emailSchema = z.object({ email: z.string().trim().email().transform((value) => value.toLowerCase()) });
const codeSchema = z.object({ code: z.string().trim().min(6).max(12) });

router.post('/register', validate(credentials), asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, passwordHash });
  res.status(201).json({ user: user.toSafeJSON(), token: signToken(user) });
}));

router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
    throw new AppError('Invalid email or password', 401);
  }
  res.json({ user: user.toSafeJSON(), token: signToken(user) });
}));

// These endpoints intentionally return a safe MVP response until an email provider
// is configured. They keep the web client API-compatible with a production flow.
router.post('/forgot-password', validate(emailSchema), asyncHandler(async (req, res) => {
  res.json({ message: 'If an account exists, a password reset link has been sent.', email: req.body.email });
}));

router.post('/verify-email', requireAuth, validate(codeSchema), asyncHandler(async (req, res) => {
  res.json({ verified: req.body.code === '123456', message: 'Email verification code checked.' });
}));

router.post('/2fa/enable', requireAuth, validate(codeSchema), asyncHandler(async (req, res) => {
  res.json({ enabled: req.body.code === '246810', message: 'Two-factor code checked.' });
}));

router.get('/profile', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
}));

export default router;
