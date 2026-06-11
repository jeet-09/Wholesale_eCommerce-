import { buildApp } from './app';
import { loadEnv } from './config/env';
import { disconnectPrisma, getPrismaClient } from './database/prisma';

/**
 * Process entrypoint: load+validate env (fail fast), connect Prisma, build the
 * app, bind the port, and install graceful-shutdown handlers so in-flight
 * requests drain and the DB pool closes cleanly (TECHNICAL-DETAILS.MD §10).
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const db = getPrismaClient(env.LOG_LEVEL);

  // Verify connectivity early so a bad DATABASE_URL fails the boot, not requests.
  await db.$connect();

  const app = await buildApp({ env, db });

  const closeGracefully = (signal: NodeJS.Signals): void => {
    app.log.info({ signal }, 'shutting down gracefully');
    void (async () => {
      try {
        await app.close();
        await disconnectPrisma();
        app.log.info('shutdown complete');
        process.exit(0);
      } catch (error) {
        app.log.error({ err: error }, 'error during shutdown');
        process.exit(1);
      }
    })();
  };

  process.on('SIGTERM', closeGracefully);
  process.on('SIGINT', closeGracefully);

  // Never leave the process in an undefined state on a programming error.
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'unhandled promise rejection');
    process.exit(1);
  });
  process.on('uncaughtException', (error) => {
    app.log.error({ err: error }, 'uncaught exception');
    process.exit(1);
  });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`API listening on http://${env.HOST}:${env.PORT} (env: ${env.NODE_ENV})`);
  } catch (error) {
    app.log.error({ err: error }, 'failed to start server');
    await disconnectPrisma();
    process.exit(1);
  }
}

void main();
