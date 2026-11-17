import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from './error.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError('Authentication required', 401);
    const payload = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) throw new AppError('User no longer exists', 401);
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired token', 401));
    }
    next(error);
  }
}

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}
