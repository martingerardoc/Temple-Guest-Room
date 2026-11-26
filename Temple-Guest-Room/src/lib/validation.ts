import { z } from "zod";
import { isRealDate, nightsBetween, todayInTemple } from "./dates";

export const MAX_STAY_NIGHTS = 90;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .refine(isRealDate, "Not a real date");

/** Shared date rules: arrival not in the past, departure after arrival, stay not too long. */
function checkDates(
  value: { arrival_date: string; departure_date: string },
  ctx: z.RefinementCtx,
) {
  if (value.arrival_date < todayInTemple()) {
    ctx.addIssue({ code: "custom", path: ["arrival_date"], message: "Arrival cannot be in the past" });
  }
  if (value.departure_date <= value.arrival_date) {
    ctx.addIssue({ code: "custom", path: ["departure_date"], message: "Departure must be after arrival" });
  } else if (nightsBetween(value.arrival_date, value.departure_date) > MAX_STAY_NIGHTS) {
    ctx.addIssue({
      code: "custom",
      path: ["departure_date"],
      message: `Stay cannot be longer than ${MAX_STAY_NIGHTS} nights`,
    });
  }
}

export const reservationInput = z
  .object({
    full_name: z.string().trim().min(2, "Full name is required").max(120),
    email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
    phone: z
      .string()
      .trim()
      .min(5, "Phone number is required")
      .max(30)
      .regex(/^[+\d][\d\s().-]*$/, "Enter a valid phone number"),
    category_id: z.string().uuid("Choose a room category"),
    arrival_date: isoDate,
    departure_date: isoDate,
    male_count: z.number().int().min(0).max(100),
    female_count: z.number().int().min(0).max(100),
    guest_notes: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.male_count + value.female_count < 1) {
      ctx.addIssue({ code: "custom", path: ["male_count"], message: "At least one guest is required" });
    }
    checkDates(value, ctx);
  });

export type ReservationInput = z.infer<typeof reservationInput>;

export const availabilityQuery = z
  .object({
    arrival: isoDate,
    departure: isoDate,
    category_id: z.string().uuid().optional(),
    guests: z.coerce.number().int().min(1).max(200).optional(),
  })
  .superRefine((value, ctx) =>
    checkDates({ arrival_date: value.arrival, departure_date: value.departure }, ctx),
  );

export const calendarQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the format YYYY-MM"),
  category_id: z.string().uuid().optional(),
});

export const lookupQuery = z.object({
  reference_code: z.string().trim().toUpperCase().min(4).max(20),
  email: z.string().trim().toLowerCase().email(),
});