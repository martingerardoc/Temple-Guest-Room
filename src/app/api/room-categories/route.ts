import { pool } from "../../../lib/db";
import { errorResponse } from "../../../lib/http";
import { listRoomCategories } from "../../../lib/reservations";


// GET /api/room-categories
export async function GET() {
  try {
    return Response.json(await listRoomCategories(pool));
  } catch (error) {
    return errorResponse(error);
  }
}
