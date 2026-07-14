import { connectDB } from "@/lib/mongodb";
import { Absence } from "@/models/Absence";
import { User } from "@/models/User";
import "@/models/Team";
import { requireActiveUser, json } from "@/lib/api";
import { visibleTeamIds, canManageAbsence } from "@/lib/permissions";
import { absenceSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { ABSENCE_LABEL, type AbsenceType } from "@/lib/absenceTypes";

// GET /api/absences?from=&to=&team= — 부재 조회 (조회 범위는 역할에 따름 + 본인 것은 항상)
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const team = url.searchParams.get("team");

  await connectDB();
  const q: any = {};
  if (from && to) {
    q.startDate = { $lte: new Date(to) };
    q.endDate = { $gte: new Date(from) };
  } else {
    // 기간 미지정 — 최근 30일 ~ 1년 뒤
    q.startDate = { $lte: new Date(Date.now() + 365 * 86_400_000) };
    q.endDate = { $gte: new Date(Date.now() - 30 * 86_400_000) };
  }

  const scope = visibleTeamIds(user);
  if (scope === "all") {
    if (team) q.teamId = team;
  } else {
    const teamCond = team && scope.includes(team) ? team : { $in: scope };
    // 팀 범위 + 본인 것 (팀 이동 등으로 teamId가 어긋나도 본인 부재는 보이게)
    q.$or = [{ teamId: teamCond }, { userId: user.id }];
  }

  const rows: any[] = await Absence.find(q)
    .populate("userId", "name")
    .populate("teamId", "name color")
    .sort({ startDate: 1 })
    .limit(300)
    .lean();

  return json({
    absences: rows.map((a) => ({
      id: String(a._id),
      user: a.userId ? { id: String(a.userId._id), name: a.userId.name } : null,
      team: a.teamId ? { id: String(a.teamId._id), name: a.teamId.name, color: a.teamId.color } : null,
      type: a.type,
      typeLabel: ABSENCE_LABEL[a.type as AbsenceType] ?? a.type,
      startDate: a.startDate,
      endDate: a.endDate,
      note: a.note ?? "",
    })),
  });
}

// POST /api/absences — 부재 등록 (본인 / 팀장·부팀장은 자기 팀원 / 전사 편집자는 전체)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = absenceSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
  const d = parsed.data;
  if (d.endDate < d.startDate) return json({ error: "종료일이 시작일보다 빠를 수 없어요." }, 400);

  await connectDB();
  const target: any = await User.findById(d.userId).select("name teamId status").lean();
  if (!target || target.status !== "active") return json({ error: "대상을 찾을 수 없습니다." }, 404);
  if (!canManageAbsence(user, { id: String(target._id), teamId: target.teamId ? String(target.teamId) : null })) {
    return json({ error: "부재 등록 권한이 없습니다. (본인·팀장·과장단)" }, 403);
  }

  // 반차는 하루짜리로 고정
  const isHalf = d.type === "half_am" || d.type === "half_pm";
  const endDate = isHalf ? d.startDate : d.endDate;

  // 같은 사람의 겹치는 부재는 중복 등록 방지
  const dup = await Absence.findOne({
    userId: target._id,
    startDate: { $lte: new Date(endDate) },
    endDate: { $gte: new Date(d.startDate) },
  }).lean();
  if (dup) return json({ error: "그 기간에 이미 등록된 부재가 있어요." }, 409);

  const a = await Absence.create({
    userId: target._id,
    teamId: target.teamId ?? null,
    type: d.type,
    startDate: new Date(d.startDate),
    endDate: new Date(endDate),
    note: d.note,
    createdBy: user.id,
  });

  await logActivity({
    actorId: user.id, actorName: user.name, action: "create", targetType: "absence",
    targetTitle: `${target.name} ${ABSENCE_LABEL[d.type]} (${d.startDate}~${endDate})`,
  });
  return json({ id: String(a._id) }, 201);
}
