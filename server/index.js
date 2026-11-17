import { app } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db.js';

let server;
try {
  await connectDatabase();
  server = app.listen(env.PORT, () => {
    console.log(`SettleUp API listening on http://localhost:${env.PORT}`);
  });
} catch (error) {
  console.error('Unable to start SettleUp API:', error);
  process.exitCode = 1;
}

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  if (!server) return process.exit(0);
  server.close(async () => {
    try {
      await disconnectDatabase();
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
