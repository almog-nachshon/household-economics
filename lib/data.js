import { db } from "@/lib/db";

// Created on first run so a fresh server DB works without the dummy seed.
const DEFAULT_SETTINGS = {
  targetHomePrice: 3000000,
  equityRatio: 0.3,
  targetDate: new Date("2030-06-01"),
  emergencyTarget: 90000,
  monthlyInvest: 2500,
  checkingBuffer: 2000,
  allocations: "[]",
  monthlyIncome: 0,
  savingsGoal: 5000,
  riskProfile: "balanced",
};

export async function getSettings() {
  return db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, ...DEFAULT_SETTINGS } });
}

export async function loadData() {
  const [snapshots, settings] = await Promise.all([db.snapshot.findMany({ orderBy: { month: "asc" } }), getSettings()]);
  return { snapshots, settings, last: snapshots[snapshots.length - 1] };
}
