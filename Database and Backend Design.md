# Sprint 1 Deliverables: Database and Backend Design

Temple Guest Room Reservation and Management System · CSE 499 · Sprint 1 (W03)

Prepared by Akuegbo Iheanyi Ejeagba (Database and backend lead)

## 1. Entity-Relationship Diagram (ERD)

**Four tables.** Staff users approve requests, guests make requests, room categories define what can be booked, and reservations connect them. Types follow PostgreSQL.

### users (administrators and registration staff)

| Column        | Type      | Notes                                 |
| ------------- | --------- | ------------------------------------- |
| id            | UUID      | Primary key                           |
| name          | text      | Required                              |
| email         | text      | Required, unique                      |
| password_hash | text      | Required, never store plain passwords |
| role          | text      | admin or staff                        |
| created_at    | timestamp | Default now                           |

### guests

| Column     | Type      | Notes       |
| ---------- | --------- | ----------- |
| id         | UUID      | Primary key |
| full_name  | text      | Required    |
| email      | text      | Required    |
| phone      | text      | Required    |
| created_at | timestamp | Default now |

### room_categories

| Column             | Type    | Notes                                                      |
| ------------------ | ------- | ---------------------------------------------------------- |
| id                 | UUID    | Primary key                                                |
| name               | text    | Required, unique (for example, Men’s rooms, Women’s rooms) |
| gender_restriction | text    | male or female                                             |
| capacity_per_room  | integer | Beds in one room, at least 1                               |
| total_rooms        | integer | Rooms in this category, at least 0                         |
| is_active          | boolean | Default true                                               |

### reservations

| Column                 | Type      | Notes                                                                                   |
| ---------------------- | --------- | --------------------------------------------------------------------------------------- |
| id                     | UUID      | Primary key                                                                             |
| reference_code         | text      | Required, unique, shown to the guest                                                    |
| guest_id               | UUID      | Foreign key to guests.id                                                                |
| room_category_id       | UUID      | Foreign key to room_categories.id                                                       |
| arrival_date           | date      | Required                                                                                |
| departure_date         | date      | Required, after arrival_date                                                            |
| guest_count            | integer   | Required, at least 1                                                                    |
| rooms_needed           | integer   | Calculated on submit: guest_count ÷ capacity_per_room, rounded up                       |
| status                 | text      | pending, info_requested, approved, declined, or cancelled                               |
| is_available_on_submit | boolean   | Set when the request is saved: false means rooms were not free, so staff see it flagged |
| guest_notes            | text      | Optional                                                                                |
| decided_by             | UUID      | Foreign key to users.id, empty until a decision is made                                 |
| decided_at             | timestamp | Empty until a decision is made                                                          |
| decision_note          | text      | Optional reason, shown to the guest                                                     |
| created_at             | timestamp | Default now                                                                             |
| updated_at             | timestamp | Updated on every change                                                                 |

### Relationships

| From            | To           | Type                   | Meaning                                    |
| --------------- | ------------ | ---------------------- | ------------------------------------------ |
| guests          | reservations | One to many            | A guest can make many reservation requests |
| room_categories | reservations | One to many            | Every request is for one category          |
| users           | reservations | One to many (optional) | A staff member decides many requests       |

### Constraints and indexes

- departure_date must be after arrival_date.
- guest_count must be at least 1.
- status must be one of the five allowed values.
- Index on reservations (room_category_id, arrival_date, departure_date) for fast availability checks.
- Index on reservations (status) for the admin dashboard.
- Index on guests (email) for guest lookups.

### Design assumptions (confirm in the design review)

- Rooms are separated by gender, so each category is male or female. A mixed group submits one request per category.
- Individual rooms are not tracked. A category has a count of rooms, and availability is counted per night.
- Only approved reservations use up capacity. Pending requests do not block other guests.

## 2. Reservation and Availability API Design

All endpoints return JSON. Input is validated with Zod. Staff endpoints require a valid Auth.js session.

### Guest endpoints (no login)

| Method and path                         | Purpose                                                      | Input                                                                                                         | Success response                                                                                   |
| --------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET /api/room-categories                | List active categories for the booking form                  | None                                                                                                          | 200, list of id, name, gender_restriction, capacity_per_room                                       |
| GET /api/availability                   | Check dates for one category                                 | Query: arrival, departure, category_id, guests                                                                | 200, available (true or false), rooms_left, rooms_needed                                           |
| GET /api/availability/calendar          | Day-by-day status for the calendar                           | Query: month (YYYY-MM), category_id                                                                           | 200, list of date and status (available or unavailable)                                            |
| POST /api/reservations                  | Submit a request                                             | Body: full_name, email, phone, category_id, arrival_date, departure_date, guest_count, guest_notes (optional) | 201, reference_code, status pending, and is_available (false means staff will review alternatives) |
| GET /api/reservations/lookup            | Guest checks a request                                       | Query: reference_code, email                                                                                  | 200, status, dates, decision_note                                                                  |
| PATCH /api/reservations/:reference_code | Guest updates a request after staff ask for more information | Body: email, plus the fields to change                                                                        | 200, status back to pending                                                                        |

### Staff endpoints (login required)

| Method and path                   | Purpose                     | Input                                                                                                  | Success response                                  |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| POST /api/auth/signin             | Staff login (Auth.js)       | email, password                                                                                        | 200 and session cookie                            |
| GET /api/admin/reservations       | List requests               | Query: status, from, to (all optional)                                                                 | 200, list of reservations with guest and category |
| GET /api/admin/reservations/:id   | Review one request          | None                                                                                                   | 200, full reservation, guest, and category        |
| PATCH /api/admin/reservations/:id | Approve, decline, or cancel | Body: action (approve, decline, request_info, or cancel), note (required for decline and request_info) | 200, updated reservation                          |
| GET /api/admin/occupancy          | Dashboard summary           | Query: month (YYYY-MM)                                                                                 | 200, counts by status and rooms used per category |

### Validation rules

- Arrival cannot be in the past, and departure must be after arrival.
- guest_count must be a whole number of at least 1.
- Name, email, phone, category, and both dates are required. Email must be a valid format.
- The category must exist and be active.
- guest_count cannot exceed total_rooms × capacity_per_room for the category.

### Status rules

| From           | Allowed next status                                                |
| -------------- | ------------------------------------------------------------------ |
| pending        | approved, declined, info_requested, cancelled                      |
| info_requested | pending (after the guest updates the request), declined, cancelled |
| approved       | cancelled                                                          |
| declined       | None (final)                                                       |
| cancelled      | None (final)                                                       |

### Rules to prevent overlapping confirmed reservations

1. Two stays overlap when the existing arrival is before the new departure **and** the existing departure is after the new arrival. A guest leaving on a day does not block another guest arriving that day.
2. For every night of the stay, rooms used by approved reservations plus rooms_needed for the new request must not exceed total_rooms.
3. The check runs again at approval time, not only when the guest submits, because other requests may have been approved in between.
4. Approval runs as one database transaction. It locks the category row, rechecks every night, then saves the status. Two staff members approving at once cannot both succeed.
5. Declining and cancelling always succeed for allowed transitions, and they free the rooms.

**Unavailable at submission:** the system still saves the request and checks availability right away. If rooms are not free, it sets is_available_on_submit to false and flags the request for the manager, who offers alternatives or declines. Only approval is blocked by capacity.

### Error responses

| Code | When                                                       |
| ---- | ---------------------------------------------------------- |
| 400  | Invalid or missing input, or an invalid status change      |
| 401  | No staff session                                           |
| 403  | Logged in but role not allowed                             |
| 404  | Reservation or category not found                          |
| 409  | Approval would exceed room capacity for at least one night |

## 3. Team Design Review (lead: Iheanyi)

### Check 1: Guest form fields match the database

| Wireframe field        | Database column               | Matches? |
| ---------------------- | ----------------------------- | -------- |
| Full name              | guests.full_name              |          |
| Email                  | guests.email                  |          |
| Phone                  | guests.phone                  |          |
| Number of guests       | reservations.guest_count      |          |
| Accommodation category | reservations.room_category_id |          |
| Arrival date           | reservations.arrival_date     |          |
| Departure date         | reservations.departure_date   |          |
| Notes                  | reservations.guest_notes      |          |

### Check 2: Screens match the API

| Screen                                           | Endpoint used                                         | Matches? |
| ------------------------------------------------ | ----------------------------------------------------- | -------- |
| Availability calendar                            | GET /api/availability/calendar                        |          |
| Booking form submit                              | POST /api/reservations                                |          |
| Administrator login                              | POST /api/auth/signin                                 |          |
| Dashboard: pending and approved lists, occupancy | GET /api/admin/reservations, GET /api/admin/occupancy |          |
| Review reservation: approve or reject            | GET and PATCH /api/admin/reservations/:id             |          |

### Check 3: Workflow matches the statuses

Martin’s workflow diagram (on GitHub) is now reflected in this design. (1) “Request additional information” and “Guest updates request” became the info_requested status and the guest update endpoint. (2) “Are rooms available?” runs when the request is saved. An unavailable request is still saved and flagged for the manager. (3) “Record rejection” is stored in decided_by, decided_at, and decision_note. (4) “Update room availability” needs no extra step, because availability is calculated from approved reservations. (5) The “Notify guest” steps are email notifications, an optional enhancement. Until then, guests check status with the lookup endpoint.

### Questions to raise in the review

1. What are the real room categories, how many rooms does each have, and how many beds per room?
2. Should a mixed group submit separate requests, or does the form need male and female counts?
3. Is there a maximum stay length or a minimum notice period?
4. Can a guest cancel their own request, or only staff?
5. Which staff roles exist besides the registration manager?

### Review record (complete during the review)

| Decisions made | Pending issues | Changes required for Sprint 2 |
| -------------- | -------------- | ----------------------------- |
|                |                |                               |
