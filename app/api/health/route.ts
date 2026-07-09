import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    return json({ ok: true, db: mongoose.connection.name });
  } catch (e: any) {
    return json({ ok: false, error: e.message }, 500);
  }
}
