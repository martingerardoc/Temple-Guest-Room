-- Temple Guest Room Reservation: initial schema (PostgreSQL 13+)
-- Tables: users (staff), guests, room_categories, reservations

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'staff')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE guests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text NOT NULL,
  email       text NOT NULL UNIQUE,
  phone       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE room_categories (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL UNIQUE,
  gender_restriction text NOT NULL CHECK (gender_restriction IN ('male', 'female', 'any')),
  capacity_per_room  integer NOT NULL CHECK (capacity_per_room >= 1),
  total_rooms        integer NOT NULL CHECK (total_rooms >= 0),
  is_active          boolean NOT NULL DEFAULT true
);

CREATE TABLE reservations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code           text NOT NULL UNIQUE,
  guest_id                 uuid NOT NULL REFERENCES guests (id),
  room_category_id         uuid NOT NULL REFERENCES room_categories (id),
  arrival_date             date NOT NULL,
  departure_date           date NOT NULL,
  male_count               integer NOT NULL DEFAULT 0 CHECK (male_count >= 0),
  female_count             integer NOT NULL DEFAULT 0 CHECK (female_count >= 0),
  guest_count              integer GENERATED ALWAYS AS (male_count + female_count) STORED,
  rooms_needed             integer NOT NULL CHECK (rooms_needed >= 1),
  status                   text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'info_requested', 'approved', 'declined', 'cancelled')),
  is_available_on_submit   boolean NOT NULL,
  guest_notes              text,
  decided_by               uuid REFERENCES users (id),
  decided_at               timestamptz,
  decision_note            text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (departure_date > arrival_date),
  CHECK (male_count + female_count >= 1)
);

-- Fast availability checks: only approved reservations use up rooms
CREATE INDEX reservations_availability_idx
  ON reservations (room_category_id, arrival_date, departure_date)
  WHERE status = 'approved';

-- Admin dashboard filters
CREATE INDEX reservations_status_idx ON reservations (status);

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reservations_set_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();