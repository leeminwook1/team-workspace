import { connectDB } from "@/lib/mongodb";
import { Event } from "@/models/Event";
import "@/models/Team";
import "@/models/User";
import mongoose from "mongoose";
import { requireActiveUser, json, badId } from "@/lib/api";
import { canManageEvents, canDeleteEvent } from "@/lib/permissions";
import { eventUpdateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { touchChanged } from "@/lib/changes";
import { getDeptId } from "@/lib/dept";

function serializeFull(e: any) {
  return {
    id: String(e._id),
    title: e.title,
    description: e.description,
    teams: (e.teamIds ?? []).filter(Boolean).map((tm: any) => ({ id: String(tm._id ?? tm), name: tm.name ?? "", color: tm.color ?? "#8b95a1" })),
    eventDate: e.eventDate,
    location: e.location,
    meetTime: e.meetTime ?? "",
    meetPlace: e.meetPlace ?? "",
    brief: {
      dress: e.brief?.dress ?? "", caution: e.brief?.caution ?? "",
      delivery: e.brief?.delivery ?? "", contact: e.brief?.contact ?? "",
    },
    positions: (e.positions ?? []).map((p: any) => ({
      id: String(p._id),
      name: p.name,
      note: p.note ?? "",
      people: (p.userIds ?? []).filter((u: any) => u?.name).map((u: any) => ({ id: String(u._id), name: u.name })),
    })),
    createdBy: e.createdBy ? String(e.createdBy._id ?? e.createdBy) : null,
    items: (e.items ?? []).map((it: any) => ({
      id: String(it._id),
      title: it.title,
      status: it.status,
      assignee: it.assigneeId?.name ? { id: String(it.assigneeId._id ?? it.assigneeId), name: it.assigneeId.name } : null,
      dueDate: it.dueDate ?? null,
      note: it.note ?? "",
    })),
    program: (e.program ?? []).map((p: any) => ({
      id: String(p._id),
      time: p.time ?? "",
      title: p.title,
      note: p.note ?? "",
      must: !!p.must,
    })),
    createdAt: e.createdAt,
    closedAt: e.closedAt ?? null,
  };
}

// GET /api/events/:id — 행사 + 투두(items) 상세
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const ev: any = await Event.findById(params.id)
    .populate("teamIds", "name color")
    .populate("items.assigneeId", "name")
    .populate("positions.userIds", "name")
    .lean();
  if (!ev || ev.deletedAt) return json({ error: "행사를 찾을 수 없습니다." }, 404);
  return json({ event: serializeFull(ev) });
}

// PATCH /api/events/:id — 행사 수정 + 투두(items) 갱신 (편집자 역할)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageEvents(user)) return json({ error: "행사를 수정할 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = eventUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const ev: any = await Event.findById(params.id);
  if (!ev || ev.deletedAt) return json({ error: "행사를 찾을 수 없습니다." }, 404);

  const d = parsed.data;
  // 행사 종료(보관) / 재개
  if (d.closed !== undefined) {
    ev.closedAt = d.closed ? new Date() : null;
    await logActivity({
      actorId: user.id, actorName: user.name, action: "status", targetType: "event",
      targetTitle: ev.title, meta: { detail: d.closed ? "행사 종료" : "행사 재개" },
    });
  }
  if (d.title !== undefined) ev.title = d.title;
  if (d.description !== undefined) ev.description = d.description;
  // 사진과 전용 — 참여 팀 변경 무시
  // 사진과 전용 — 행사 담당자·우선순위는 쓰지 않음 (할 일에만 담당자)
  if (d.eventDate !== undefined) ev.eventDate = d.eventDate ? new Date(d.eventDate) : null;
  if (d.location !== undefined) ev.location = d.location;
  if (d.meetTime !== undefined) ev.meetTime = d.meetTime;
  if (d.meetPlace !== undefined) ev.meetPlace = d.meetPlace;
  if (d.brief !== undefined) ev.brief = d.brief;

  // 포지션 — 새로 배정된 사람에게 알림 (본인 제외)
  const newlyPlaced = new Map<string, string[]>();
  if (d.positions !== undefined) {
    const before = new Set<string>();
    for (const p of ev.positions ?? []) for (const u of p.userIds ?? []) before.add(`${String(p._id)}:${String(u)}`);
    ev.positions = d.positions.map((p) => ({
      ...(p.id && mongoose.isValidObjectId(p.id) ? { _id: p.id } : {}),
      name: p.name,
      userIds: Array.from(new Set(p.userIds ?? [])),
      note: p.note ?? "",
    }));
    for (const p of d.positions) {
      for (const u of Array.from(new Set(p.userIds ?? []))) {
        if (u === user.id || (p.id && before.has(`${p.id}:${u}`))) continue;
        if (!newlyPlaced.has(u)) newlyPlaced.set(u, []);
        newlyPlaced.get(u)!.push(p.name);
      }
    }
  }

  // 할 일 담당자가 새로 지정된 사람 수집 (본인 제외) — 저장 후 알림
  const newlyAssigned = new Map<string, string[]>();
  if (d.items !== undefined) {
    // 할 일 전체 비우기(N>0 → 0)는 행사 삭제 권한이 있는 사람만 — 편집권한만으로 전체 파괴 방지
    if ((ev.items ?? []).length > 0 && d.items.length === 0 && !canDeleteEvent(user, String(ev.createdBy))) {
      return json({ error: "행사 할 일 전체를 비우려면 행사 삭제 권한이 필요합니다." }, 403);
    }
    const before = new Map((ev.items ?? []).map((it: any) => [String(it._id), it.assigneeId ? String(it.assigneeId) : ""]));
    // 기존 _id는 유지하고, 새 항목만 생성 (id 안정성)
    ev.items = d.items.map((it) => ({
      ...(it.id && mongoose.isValidObjectId(it.id) ? { _id: it.id } : {}),
      title: it.title,
      status: it.status ?? "todo",
      teamId: null,
      assigneeId: it.assigneeId || null,
      dueDate: it.dueDate ? new Date(it.dueDate) : null,
      note: it.note ?? "",
    }));
    for (const it of d.items) {
      const a = it.assigneeId ? String(it.assigneeId) : "";
      if (!a || a === user.id) continue;
      const prev = it.id ? (before.get(String(it.id)) ?? "") : "";
      if (a !== prev) {
        if (!newlyAssigned.has(a)) newlyAssigned.set(a, []);
        newlyAssigned.get(a)!.push(it.title);
      }
    }
  }

  // 식순·타임테이블 — items와 동일하게 _id 유지하며 통째로 갱신
  if (d.program !== undefined) {
    ev.program = d.program.map((p) => ({
      ...(p.id && mongoose.isValidObjectId(p.id) ? { _id: p.id } : {}),
      time: p.time ?? "",
      title: p.title,
      note: p.note ?? "",
      must: !!p.must,
    }));
  }

  await ev.save();

  // 알림 — 포지션 배정 + 할 일 담당자 신규 지정
  const dateLabel = ev.eventDate ? (() => { const k = new Date(new Date(ev.eventDate).getTime() + 9 * 3600_000); return ` (${k.getUTCMonth() + 1}/${k.getUTCDate()})`; })() : "";
  for (const [uid, names] of Array.from(newlyPlaced.entries())) {
    await notify([uid], {
      type: "event_assigned",
      title: `🎯 행사 포지션이 정해졌어요 — ${names.join(", ")}`,
      body: `${ev.title}${dateLabel}`,
      link: `/events/${String(ev._id)}`,
    });
  }
  for (const [uid, titles] of Array.from(newlyAssigned.entries())) {
    await notify([uid], {
      type: "event_assigned",
      title: "행사 할 일 담당자로 지정됐어요",
      body: `${ev.title} — ${titles.slice(0, 3).join(", ")}${titles.length > 3 ? ` 외 ${titles.length - 3}건` : ""}`,
      link: `/events/${String(ev._id)}`,
    });
  }

  // 행사 필드 수정만 로그 (투두·식순 편집만 있는 경우는 로그 스팸 방지)
  const keys = Object.keys(d);
  const itemsOnly = keys.length >= 1 && keys.every((k) => k === "items" || k === "program" || k === "positions");
  if (!itemsOnly) {
    await logActivity({ actorId: user.id, actorName: user.name, action: "update", targetType: "event", targetTitle: ev.title });
  } else {
    await touchChanged("event"); // 투두 이동도 다른 사람 화면에 즉시 반영
  }
  return json({ id: String(ev._id) });
}

// DELETE /api/events/:id — admin·과장·부과장 또는 등록자 본인
// 소프트 삭제: 30일간 DB에 남아 있어 복구 가능, 이후 크론이 완전 삭제
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const ev: any = await Event.findById(params.id).lean();
  if (!ev || ev.deletedAt) return json({ error: "행사를 찾을 수 없습니다." }, 404);
  if (!canDeleteEvent(user, String(ev.createdBy))) {
    return json({ error: "행사 삭제 권한이 없습니다." }, 403);
  }

  await Event.updateOne({ _id: params.id }, { $set: { deletedAt: new Date() } });
  await logActivity({ actorId: user.id, actorName: user.name, action: "delete", targetType: "event", targetTitle: ev.title });
  return json({ deleted: true });
}
