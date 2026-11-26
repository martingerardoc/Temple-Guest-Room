import { withTransaction } from "../../../lib/db";
import { AppError } from "../../../lib/errors";
import { errorResponse } from "../../../lib/http";
import { createReservation } from "../../../lib/reservations";


// POST /api/reservations  (JSON body, see README)
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError(400, "Request body must be valid JSON.");
    }
    const result = await withTransaction((db) => createReservation(db, body));
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
