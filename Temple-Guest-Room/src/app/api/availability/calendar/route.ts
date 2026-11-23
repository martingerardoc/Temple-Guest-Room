import { pool } from "../../../../lib/db";
import { errorResponse, searchParamsToObject } from "../../../../lib/http";
import { calendarQuery } from "../../../../lib/validation";
import { getCalendar } from "../../../../lib/availability";


// GET /api/availability/calendar?month=YYYY-MM[&category_id=...]
export async function GET(request: Request) {
  try {
    const q = calendarQuery.parse(searchParamsToObject(request));
    const categories = await getCalendar(pool, { month: q.month, categoryId: q.category_id });
    return Response.json({ month: q.month, categories });
  } catch (error) {
    return errorResponse(error);
  }
}
