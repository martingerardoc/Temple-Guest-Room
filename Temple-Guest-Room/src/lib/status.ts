import { AppError } from "./errors";

export const RESERVATION_STATUSES = [
  "pending",
  "info_requested",
  "approved",
  "declined",
  "cancelled",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Allowed status changes, from the Sprint 2 reservation business rules. */
export const ALLOWED_TRANSITIONS: Record<ReservationStatus, readonly ReservationStatus[]> = {
  pending: ["approved", "declined", "info_requested", "cancelled"],
  info_requested: ["pending", "declined", "cancelled"],
  approved: ["cancelled"],
  declined: [], // final
  cancelled: [], // final
};

/** The database keeps "declined"; the interface can show "Rejected". */
export const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "Pending",
  info_requested: "Information requested",
  approved: "Approved",
  declined: "Rejected",
  cancelled: "Cancelled",
};

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Throws a 400 error for an invalid status change. Use before every status update. */
export function assertTransition(from: ReservationStatus, to: ReservationStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError(400, `A ${from} reservation cannot change to ${to}.`);
  }
}