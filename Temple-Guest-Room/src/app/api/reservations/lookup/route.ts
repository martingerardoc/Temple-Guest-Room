import { pool } from "../../../../lib/db";
import { errorResponse, searchParamsToObject } from "../../../../lib/http";
import { lookupQuery } from "../../../../lib/validation";
import { lookupReservation } from "../../../../lib/reservations";


// GET /api/reservations/lookup?reference_code=TR-XXXXXXXX&email=guest@example.com
export async function GET(request: Request) {
  try {
    const q = lookupQuery.parse(searchParamsToObject(request));
    return Response.json(await lookupReservation(pool, q.reference_code, q.email));
  } catch (error) {
    return errorResponse(error);
  }
}
