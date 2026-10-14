import { buildApp } from './app';
import { config } from './config';
import { prisma } from './db';
const app = await buildApp();
await app.listen({ port: config.PORT, host: config.HOST });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, async () => { await app.close(); await prisma.$disconnect(); process.exit(0); });
