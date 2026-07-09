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
    status: { type: String, enum: ["booked", "cancelled"], default: "booked" },
  },
  { timestamps: true }
);

// 겹침 검사용 인덱스 (설계 4.7)
ReservationSchema.index({ resourceId: 1, startAt: 1, endAt: 1 });

export const Reservation = models.Reservation || model("Reservation", ReservationSchema);
