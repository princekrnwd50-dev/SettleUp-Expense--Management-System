import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import expenseRoutes from './routes/expenses.js';
import groupRoutes from './routes/groups.js';
import settlementRoutes from './routes/settlements.js';
import { errorHandler, notFound } from './middleware/error.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
const allowedOrigins = env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim());
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
  credentials: true
}));
app.use(express.json({ limit: '8mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'settleup-api' }));
app.use('/api/auth', authRoutes);
app.use('/api/groups/:groupId/expenses', (req, res, next) => {
  if (req.method === 'POST') req.body = { ...(req.body || {}), groupId: req.params.groupId };
  if (req.method === 'GET') req.query.groupId = req.params.groupId;
  next();
}, expenseRoutes);
app.use('/api/groups/:groupId/settlements', (req, res, next) => {
  if (req.method === 'POST') req.body = { ...(req.body || {}), groupId: req.params.groupId };
  if (req.method === 'GET') req.query.groupId = req.params.groupId;
  next();
}, settlementRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/settlements', settlementRoutes);

app.use(notFound);
app.use(errorHandler);
