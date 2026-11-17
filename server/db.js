import mongoose from 'mongoose';

import { env } from './config/env.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000
  });
  console.log('MongoDB connected');
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
