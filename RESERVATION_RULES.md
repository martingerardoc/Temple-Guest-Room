# Reservation Business Rules

**Project:** Temple Guest Room Reservation and Management System  
**Sprint:** 2  
**Responsible:** Martin Cespedes

## 1. Purpose

This document defines the business rules for managing guest reservation requests, administrator decisions, and room availability.

The rules follow the Sprint 1 database and backend design and the reservation workflow diagram.

## 2. Reservation Statuses

The system uses five reservation statuses:

| Status | Description |
|---|---|
| `pending` | The reservation request has been submitted and is waiting for review. |
| `info_requested` | The administrator needs additional information from the guest. |
| `approved` | The administrator has approved the reservation. |
| `declined` | The administrator has rejected the reservation. |
| `cancelled` | The reservation has been cancelled. |

The user interface may display `declined` as **Rejected**, while the database retains `declined` as its technical value.

## 3. Allowed Status Transitions

| Current status | Allowed next status |
|---|---|
| `pending` | `approved`, `declined`, `info_requested`, `cancelled` |
| `info_requested` | `pending`, `declined`, `cancelled` |
| `approved` | `cancelled` |
| `declined` | None (final status) |
| `cancelled` | None (final status) |

When a guest provides the additional information requested by the administrator, the reservation returns to `pending` for another review.

Invalid status transitions must be rejected by the system.

## 4. Administrator Reservation Review

Administrators and authorized staff members are responsible for reviewing reservation requests.

The review process follows these steps:

1. The administrator opens a pending reservation.
2. The system displays guest information, accommodation category, arrival date, departure date, guest count, and availability information.
3. The administrator reviews the request.
4. The administrator selects one of the following actions:

### Approve

- Verify that the requested dates are valid.
- Check room availability again.
- Confirm that the requested capacity is available for every night of the stay.
- Record the administrator who made the decision.
- Record the decision timestamp.
- Change the reservation status to `approved`.
- Update room availability.

### Decline

- Change the reservation status to `declined`.
- Record the administrator who made the decision.
- Record the decision timestamp.
- Save a decision note explaining the rejection.
- Notify the guest.

### Request additional information

- Change the reservation status to `info_requested`.
- Record the administrator who made the request.
- Save a note explaining what information is required.
- Notify the guest.
- Allow the guest to update the request.
- Return the reservation to `pending` after the guest submits the requested information.

### Cancel

- Change the reservation status to `cancelled` when the transition is allowed.
- Release the room capacity previously occupied by an approved reservation.

## 5. Room Availability Rules

### 5.1 Reservation capacity

The number of rooms required is calculated using:

`rooms_needed = ceil(guest_count / capacity_per_room)`

The guest count must be at least one and cannot exceed the total capacity of the selected room category.

### 5.2 Date validation

- Arrival date cannot be in the past.
- Departure date must be after arrival date.
- The departure date is not counted as an occupied night.

### 5.3 Overlapping reservations

Two reservations overlap when:

`existing_arrival < new_departure AND existing_departure > new_arrival`

For every night of the requested stay, the system must verify:

`approved_rooms_used + requested_rooms_needed <= total_rooms`

Only approved reservations consume room capacity. Pending requests do not block availability.

### 5.4 Availability verification

The system checks availability when a guest submits a request.

If rooms are unavailable:

- The request is still saved.
- `is_available_on_submit` is set to `false`.
- The administrator is notified or the request is flagged for review.
- The administrator can review alternatives or decline the request.

If rooms are available, `is_available_on_submit` is set to `true`.

Availability must be checked again when an administrator attempts to approve a request.

### 5.5 Concurrent approvals

Approval must be performed inside a database transaction.

The system must lock the relevant room category, check availability again for every night, and save the approval only if sufficient capacity remains.

This prevents two administrators from approving reservations that together exceed the room capacity.

## 6. Guest and Room Category Rules

- Each reservation belongs to one guest and one room category.
- A guest can submit multiple reservation requests.
- Each room category defines its capacity per room and total number of rooms.
- Only active room categories can be selected for new reservations.
- Room categories have a gender restriction according to the database design.
- A mixed group submits separate requests for the applicable categories, according to the current design assumptions.

## 7. Error Handling

The system should return the following HTTP status codes:

| Code | Description |
|---|---|
| `400` | Invalid input or invalid status transition. |
| `401` | Staff authentication is required. |
| `403` | The authenticated user does not have permission. |
| `404` | Reservation or room category not found. |
| `409` | Approval would exceed available room capacity. |

## 8. Items to Confirm with the Team

The following points require confirmation during the team design review:

1. Confirm whether the team will use `declined` in the database and display `Rejected` in the interface.
2. Confirm the final room categories, capacities, and gender restrictions.
3. Confirm how mixed groups will be divided into separate reservation requests.
4. Confirm whether cancellation requires an additional administrator review or can be processed directly.
5. Confirm the notification method for guests and administrators.

## 9. Sprint 2 Responsibility

Martin Cespedes is responsible for:

- Reviewing and documenting reservation business rules.
- Defining reservation statuses and allowed transitions.
- Documenting the administrator approval and rejection process.
- Defining room availability and overlapping reservation rules.
- Supporting frontend/backend integration and reservation workflow testing.
