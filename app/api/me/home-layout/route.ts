import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { WIDGET_IDS } from "@/lib/widgets";

// PUT /api/me/home-layout — 내 홈 위젯 배치 저장 (순서·크기)
export async function PUT(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const list = Array.isArray(body?.layout) ? body.layout : null;
  if (!list || list.length > 12) return json({ error: "잘못된 요청입니다." }, 400);

  const seen = new Set<string>();
  const layout: { id: string; size: number }[] = [];
  for (const w of list) {
    if (!w || typeof w.id !== "string" || !(WIDGET_IDS as readonly string[]).includes(w.id) || seen.has(w.id)) {
      return json({ error: "잘못된 위젯 구성입니다." }, 400);
    }
    seen.add(w.id);
    layout.push({ id: w.id, size: w.size === 2 ? 2 : 1 });
  }

  await connectDB();
  await User.updateOne({ _id: user.id }, { $set: { homeLayout: layout } });
  return json({ layout });
}
