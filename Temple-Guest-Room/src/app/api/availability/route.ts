import { pool } from "../../../lib/db";
import { errorResponse, searchParamsToObject } from "../../../lib/http";
import { availabilityQuery } from "../../../lib/validation";
import { getAvailability } from "../../../lib/availability";


// GET /api/availability?arrival=YYYY-MM-DD&departure=YYYY-MM-DD[&category_id=...][&guests=N]
export async function GET(request: Request) {
  try {
    const q = availabilityQuery.parse(searchParamsToObject(request));
    const categories = await getAvailability(pool, {
      arrival: q.arrival,
      departure: q.departure,
      categoryId: q.category_id,
      guests: q.guests,
    });
    return Response.json({ arrival: q.arrival, departure: q.departure, categories });
  } catch (error) {
    return errorResponse(error);
  }
}
