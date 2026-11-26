-- DEVELOPMENT SEED DATA ONLY.
-- The room categories, capacities and room counts below are SAMPLES.
-- Replace them with the real temple guest-room details once Martin confirms them.
INSERT INTO room_categories (
        name,
        gender_restriction,
        capacity_per_room,
        total_rooms
    )
VALUES ('Men''s guest rooms', 'male', 4, 5),
    ('Women''s guest rooms', 'female', 4, 5) ON CONFLICT (name) DO NOTHING;