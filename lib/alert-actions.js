"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

const refresh = () => {
  revalidatePath("/");
  revalidatePath("/invest");
};

export async function dismissAlert(id) {
  await db.alert.update({ where: { id: Number(id) }, data: { dismissed: true } });
  refresh();
}

export async function dismissAllAlerts() {
  await db.alert.updateMany({ where: { dismissed: false }, data: { dismissed: true } });
  refresh();
}
