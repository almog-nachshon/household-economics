"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export async function dismissAlert(formData) {
  await db.alert.update({ where: { id: Number(formData.get("id")) }, data: { dismissed: true } });
  revalidatePath("/");
  revalidatePath("/invest");
}
