import { PrismaClient } from "@prisma/client";

const g = globalThis;
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;
