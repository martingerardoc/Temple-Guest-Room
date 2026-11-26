// Run with: npx tsx --test tests/reservations.test.ts
// Uses PGlite (Postgres running in-process), so no Docker or database server is needed.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { ZodError } from "zod";
import { getAvailability, getCalendar, roomsNeeded } from "../src/lib/availability";
import { createReservation, lookupReservation } from "../src/lib/reservations";
import { AppError } from "../src/lib/errors";
import { todayInTemple } from "../src/lib/dates";

const db = new PGlite();
let menId = "";
let womenId = "";

function plusDays(days: number): string {
  const d = new Date(Date.parse(todayInTemple()) + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const base = () => ({
  full_name: "Test Guest",
  email: "Guest@Example.com",
  phone: "+54 11 5555 1234",
  category_id: menId,
  arrival_date: plusDays(30),
  departure_date: plusDays(33),
  male_count: 2,
  female_count: 0,
});

before(async () => {
  await db.exec(readFileSync("db/migrations/001_init.sql", "utf8"));
  await db.exec(readFileSync("db/seed.sql", "utf8"));
  const { rows } = await db.query<any>("SELECT id, gender_restriction FROM room_categories");
  menId = rows.find((r: any) => r.gender_restriction === "male").id;
  womenId = rows.find((r: any) => r.gender_restriction === "female").id;
});

async function approvedReservation(categoryId: string, arrival: string, departure: string, rooms: number) {
  const g = await db.query(
    `INSERT INTO guests (full_name, email, phone) VALUES ('Fixture', $1, '12345')
     ON CONFLICT (email) DO UPDATE SET phone = '12345' RETURNING id`,
    [`fixture-${Math.random()}@example.com`],
  );
  await db.query(
    `INSERT INTO reservations (reference_code, guest_id, room_category_id, arrival_date, departure_date,
       male_count, rooms_needed, status, is_available_on_submit)
     VALUES ($1, $2, $3, $4, $5, 1, $6, 'approved', true)`,
    [`FX-${Math.random().toString(36).slice(2, 10)}`, (g.rows[0] as any).id, categoryId, arrival, departure, rooms],
  );
}

test("rooms needed rounds up", () => {
  assert.equal(roomsNeeded(1, 4), 1);
  assert.equal(roomsNeeded(4, 4), 1);
  assert.equal(roomsNeeded(5, 4), 2);
});

test("a valid request is saved as pending with a reference code", async () => {
  const result = await createReservation(db, base());
  assert.match(result.reference_code, /^TR-[A-Z2-9]{8}$/);
  assert.equal(result.status, "pending");
  assert.equal(result.is_available, true);
});

test("pending requests do not use up rooms", async () => {
  const [cat] = await getAvailability(db, {
    arrival: plusDays(30), departure: plusDays(33), categoryId: menId,
  });
  assert.equal(cat.rooms_left, cat.total_rooms);
});

test("approved reservations reduce availability, and the departure day stays free", async () => {
  await approvedReservation(menId, plusDays(60), plusDays(62), 5); // all 5 rooms
  const during = await getAvailability(db, { arrival: plusDays(60), departure: plusDays(61), categoryId: menId });
  assert.equal(during[0].rooms_left, 0);
  assert.equal(during[0].available, false);
  const afterDeparture = await getAvailability(db, { arrival: plusDays(62), departure: plusDays(63), categoryId: menId });
  assert.equal(afterDeparture[0].rooms_left, 5);
  const overlapping = await getAvailability(db, { arrival: plusDays(61), departure: plusDays(64), categoryId: menId });
  assert.equal(overlapping[0].rooms_left, 0);
});

test("an unavailable request is still saved, but flagged", async () => {
  const result = await createReservation(db, {
    ...base(), email: "late@example.com", arrival_date: plusDays(60), departure_date: plusDays(62),
  });
  assert.equal(result.status, "pending");
  assert.equal(result.is_available, false);
});

test("calendar marks full days unavailable", async () => {
  const month = plusDays(60).slice(0, 7);
  const cats = await getCalendar(db, { month, categoryId: menId });
  const day = cats[0].days.find((d) => d.date === plusDays(60));
  assert.ok(day);
  assert.equal(day!.status, "unavailable");
});

test("men's rooms reject women guests", async () => {
  await assert.rejects(createReservation(db, { ...base(), female_count: 1 }), (e: unknown) => e instanceof AppError && e.status === 400);
  await assert.rejects(createReservation(db, { ...base(), category_id: womenId }), (e: unknown) => e instanceof AppError && e.status === 400);
});

test("too many guests for the whole category is rejected", async () => {
  await assert.rejects(createReservation(db, { ...base(), male_count: 21 }), (e: unknown) => e instanceof AppError && e.status === 400);
});

test("invalid dates and counts are rejected", async () => {
  await assert.rejects(createReservation(db, { ...base(), arrival_date: plusDays(-2), departure_date: plusDays(1) }), ZodError);
  await assert.rejects(createReservation(db, { ...base(), departure_date: base().arrival_date }), ZodError);
  await assert.rejects(createReservation(db, { ...base(), male_count: 0, female_count: 0 }), ZodError);
  await assert.rejects(createReservation(db, { ...base(), email: "not-an-email" }), ZodError);
  await assert.rejects(createReservation(db, { ...base(), category_id: "nope" }), ZodError);
});

test("lookup needs the matching email", async () => {
  const { reference_code } = await createReservation(db, { ...base(), email: "lookup@example.com" });
  const found = await lookupReservation(db, reference_code, "LOOKUP@example.com");
  assert.equal(found.status, "pending");
  assert.equal(found.arrival_date, plusDays(30));
  await assert.rejects(lookupReservation(db, reference_code, "other@example.com"), (e: unknown) => e instanceof AppError && e.status === 404);
});