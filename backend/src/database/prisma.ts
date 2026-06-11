import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

/** The Prisma client type used everywhere (repositories only). */
export type Database = PrismaClient;

/** Interactive transaction client — passed into repositories within a tx. */
export type TransactionClient = Prisma.TransactionClient;

/**
 * A "Prisma-callable" surface: either the root client or a transaction client.
 * Repositories accept this so the same query code runs in/out of a transaction.
 */
export type PrismaExecutor = Database | TransactionClient;

let client: PrismaClient | null = null;

export function createPrismaClient(logLevel: string): PrismaClient {
  const logConfig: Prisma.LogLevel[] =
    logLevel === 'debug' || logLevel === 'trace'
      ? ['query', 'warn', 'error']
      : ['warn', 'error'];

  return new PrismaClient({ log: logConfig });
}

/** Lazily-created process-wide singleton (one connection pool per process). */
export function getPrismaClient(logLevel = 'info'): PrismaClient {
  if (!client) {
    client = createPrismaClient(logLevel);
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
