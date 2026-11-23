// Run with: npx tsx --test tests/status.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/lib/errors";
import {
  ALLOWED_TRANSITIONS,
  RESERVATION_STATUSES,
  STATUS_LABELS,
  assertTransition,
  canTransition,
} from "../src/lib/status";

test("there are exactly the five statuses from the business rules", () => {
  assert.deepEqual([...RESERVATION_STATUSES], ["pending", "info_requested", "approved", "declined", "cancelled"]);
});

test("allowed transitions match the business rules", () => {
  assert.equal(canTransition("pending", "approved"), true);
  assert.equal(canTransition("pending", "declined"), true);
  assert.equal(canTransition("pending", "info_requested"), true);
  assert.equal(canTransition("pending", "cancelled"), true);
  assert.equal(canTransition("info_requested", "pending"), true);
  assert.equal(canTransition("info_requested", "declined"), true);
  assert.equal(canTransition("info_requested", "cancelled"), true);
  assert.equal(canTransition("approved", "cancelled"), true);
});

test("invalid transitions are rejected", () => {
  assert.equal(canTransition("info_requested", "approved"), false);
  assert.equal(canTransition("approved", "pending"), false);
  assert.equal(canTransition("approved", "declined"), false);
  assert.equal(canTransition("pending", "pending"), false);
});

test("declined and cancelled are final", () => {
  assert.deepEqual(ALLOWED_TRANSITIONS.declined, []);
  assert.deepEqual(ALLOWED_TRANSITIONS.cancelled, []);
  for (const next of RESERVATION_STATUSES) {
    assert.equal(canTransition("declined", next), false);
    assert.equal(canTransition("cancelled", next), false);
  }
});

test("assertTransition throws a 400 error for invalid changes", () => {
  assert.throws(() => assertTransition("declined", "approved"), (e: unknown) => e instanceof AppError && e.status === 400);
  assert.doesNotThrow(() => assertTransition("pending", "approved"));
});

test("declined is shown as Rejected", () => {
  assert.equal(STATUS_LABELS.declined, "Rejected");
});