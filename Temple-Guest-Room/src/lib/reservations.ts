import { randomBytes } from "node:crypto";
import type { Queryable } from "./db";
import { AppError } from "./errors";
import { getAvailability, roomsNeeded } from "./availability";
import { reservationInput } from "./validation";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid mix-ups

export function generateReferenceCode(): string {
  const bytes = randomBytes(8);
  let code = "TR-";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

export async function listRoomCategories(db: Queryable) {
  const { rows } = await db.query(
    `SELECT id, name, gender_restriction, capacity_per_room, total_rooms
     FROM room_categories WHERE is_active ORDER BY name`,
  );
  return rows;
}

/**
 * Validates and saves a guest request as "pending". Call inside a transaction.
 * The request is saved even when rooms are not free: it is flagged for the manager
 * (is_available_on_submit = false) so alternatives can be offered. Only approval is blocked.
 */
export async function createReservation(db: Queryable, raw: unknown) {
  const input = reservationInput.parse(raw); // throws ZodError on invalid input

  const { rows: categories } = await db.query(
    `SELECT id, name, gender_restriction, capacity_per_room, total_rooms
     FROM room_categories WHERE id = $1 AND is_active`,
    [input.category_id],
  );
  const category = categories[0];
  if (!category) throw new AppError(404, "Room category not found.");

  if (category.gender_restriction === "male" && input.female_count > 0) {
    throw new AppError(400, `${category.name} are for men only. Submit a separate request for women.`);
  }
  if (category.gender_restriction === "female" && input.male_count > 0) {
    throw new AppError(400, `${category.name} are for women only. Submit a separate request for men.`);
  }

  const guestCount = input.male_count + input.female_count;
  if (guestCount > category.total_rooms * category.capacity_per_room) {
    throw new AppError(400, "The number of guests is more than this category can ever hold.");
  }

  const needed = roomsNeeded(guestCount, category.capacity_per_room);
  const [availability] = await getAvailability(db, {
    arrival: input.arrival_date,
    departure: input.departure_date,
    categoryId: input.category_id,
    guests: guestCount,
  });
  const isAvailable = availability ? availability.available : false;

  const { rows: guestRows } = await db.query(
    `INSERT INTO guests (full_name, email, phone) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone
     RETURNING id`,
    [input.full_name, input.email, input.phone],
  );
  const guestId = guestRows[0].id;

  // ON CONFLICT DO NOTHING (instead of catching an error) keeps the transaction usable on a code clash
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferenceCode();
    const { rows } = await db.query(
      `INSERT INTO reservations
         (reference_code, guest_id, room_category_id, arrival_date, departure_date,
          male_count, female_count, rooms_needed, status, is_available_on_submit, guest_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
       ON CONFLICT (reference_code) DO NOTHING
       RETURNING reference_code, status`,
      [
        code, guestId, input.category_id, input.arrival_date, input.departure_date,
        input.male_count, input.female_count, needed, isAvailable, input.guest_notes ?? null,
      ],
    );
    if (rows[0]) {
      return { reference_code: rows[0].reference_code as string, status: rows[0].status as string, is_available: isAvailable };
    }
  }
  throw new AppError(500, "Could not generate a reference code. Please try again.");
}

/** Lets a guest check a request. The email must match the one used on the request. */
export async function lookupReservation(db: Queryable, referenceCode: string, email: string) {
  const { rows } = await db.query(
    `SELECT r.reference_code, r.status,
            to_char(r.arrival_date, 'YYYY-MM-DD') AS arrival_date,
            to_char(r.departure_date, 'YYYY-MM-DD') AS departure_date,
            r.male_count, r.female_count, rc.name AS category_name, r.decision_note
     FROM reservations r
     JOIN guests g ON g.id = r.guest_id
     JOIN room_categories rc ON rc.id = r.room_category_id
     WHERE r.reference_code = $1 AND lower(g.email) = lower($2)`,
    [referenceCode, email],
  );
  if (!rows[0]) throw new AppError(404, "No reservation found for that reference code and email.");
  return rows[0];
}