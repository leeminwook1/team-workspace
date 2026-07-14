import { Schema, models, model } from "mongoose";

// 설계 4.6 — 자원 예약 (중복 충돌 방지 → API에서 409)
const ReservationSchema = new Schema(
  {
    resourceId: { type: Schema.Types.ObjectId, ref: "Resource", required: true },
    reservedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    relatedTaskId: { type: Schema.Types.ObjectId, ref: "Task", default: null },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    note: { type: String, default: "" },
    status: { type: String, enum: ["booked", "returned", "cancelled"], default: "booked" },
    returnedAt: { type: Date, default: null }, // 반납 처리 시각
    returnedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, // 반납 처리자
  },
  { timestamps: true }
);

// 겹침 검사용 인덱스 (설계 4.7)
ReservationSchema.index({ resourceId: 1, startAt: 1, endAt: 1 });
ReservationSchema.index({ relatedTaskId: 1, status: 1 }); // 업무 연동 예약 조회용
ReservationSchema.index({ status: 1, endAt: 1 }); // 크론 미반납 조회용
ReservationSchema.index({ teamId: 1, status: 1, startAt: 1 }); // 팀 그룹방 브리핑 조회용

export const Reservation = models.Reservation || model("Reservation", ReservationSchema);
