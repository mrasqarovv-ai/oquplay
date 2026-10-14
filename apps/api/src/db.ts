import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { config } from './config';
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL, max: config.DB_POOL_SIZE, connectionTimeoutMillis: 5000 }) });
export type DB = typeof prisma;
