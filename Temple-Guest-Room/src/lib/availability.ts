import type { Queryable } from "./db";

export interface CategoryAvailability {
  category_id: string;
  name: string;
  gender_restriction: "male" | "female" | "any";
  capacity_per_room: number;
  total_rooms: number;
  /** Fewest rooms free on any night of the stay */
  rooms_left: number;
  rooms_needed: number;
  available: boolean;
}

export function roomsNeeded(guestCount: number, capacityPerRoom: number): number {
  return Math.ceil(guestCount / capacityPerRoom);
}

/**
 * Availability per active category for a stay (arrival inclusive, departure exclusive).
 * Only APPROVED reservations use up rooms. The departure day stays free.
 */
export async function getAvailability(
  db: Queryable,
  opts: { arrival: string; departure: string; categoryId?: string; guests?: number },
): Promise<CategoryAvailability[]> {
  const { rows } = await db.query(
    `WITH nights AS (
       SELECT d::date AS night
       FROM generate_series($1::timestamp, $2::timestamp - interval '1 day', interval '1 day') AS d
     ),
     used AS (
       SELECT rc.id AS category_id, n.night, COALESCE(SUM(r.rooms_needed), 0)::int AS used
       FROM room_categories rc
       CROSS JOIN nights n
       LEFT JOIN reservations r
         ON r.room_category_id = rc.id
        AND r.status = 'approved'
        AND r.arrival_date <= n.night
        AND r.departure_date > n.night
       WHERE rc.is_active AND ($3::uuid IS NULL OR rc.id = $3::uuid)
       GROUP BY rc.id, n.night
     )
     SELECT rc.id AS category_id, rc.name, rc.gender_restriction, rc.capacity_per_room, rc.total_rooms,
            GREATEST(rc.total_rooms - MAX(u.used), 0)::int AS rooms_left
     FROM room_categories rc
     JOIN used u ON u.category_id = rc.id
     GROUP BY rc.id
     ORDER BY rc.name`,
    [opts.arrival, opts.departure, opts.categoryId ?? null],
  );

  return rows.map((row) => {
    const needed = opts.guests ? roomsNeeded(opts.guests, row.capacity_per_room) : 1;
    return { ...row, rooms_needed: needed, available: row.rooms_left >= needed };
  });
}

export interface CalendarCategory {
  category_id: string;
  name: string;
  days: { date: string; rooms_left: number; status: "available" | "unavailable" }[];
}

/** Day-by-day availability for one month (YYYY-MM), for the availability calendar. */
export async function getCalendar(
  db: Queryable,
  opts: { month: string; categoryId?: string },
): Promise<CalendarCategory[]> {
  const { rows } = await db.query(
    `WITH nights AS (
       SELECT d::date AS night
       FROM generate_series(
         ($1 || '-01')::date::timestamp,
         (($1 || '-01')::date + interval '1 month' - interval '1 day')::timestamp,
         interval '1 day') AS d
     )
     SELECT rc.id AS category_id, rc.name, to_char(n.night, 'YYYY-MM-DD') AS date,
            GREATEST(rc.total_rooms - COALESCE(SUM(r.rooms_needed), 0), 0)::int AS rooms_left
     FROM room_categories rc
     CROSS JOIN nights n
     LEFT JOIN reservations r
       ON r.room_category_id = rc.id
      AND r.status = 'approved'
      AND r.arrival_date <= n.night
      AND r.departure_date > n.night
     WHERE rc.is_active AND ($2::uuid IS NULL OR rc.id = $2::uuid)
     GROUP BY rc.id, rc.name, rc.total_rooms, n.night
     ORDER BY rc.name, n.night`,
    [opts.month, opts.categoryId ?? null],
  );

  const byCategory = new Map<string, CalendarCategory>();
  for (const row of rows) {
    if (!byCategory.has(row.category_id)) {
      byCategory.set(row.category_id, { category_id: row.category_id, name: row.name, days: [] });
    }
    byCategory.get(row.category_id)!.days.push({
      date: row.date,
      rooms_left: row.rooms_left,
      status: row.rooms_left > 0 ? "available" : "unavailable",
    });
  }
  return [...byCategory.values()];
}