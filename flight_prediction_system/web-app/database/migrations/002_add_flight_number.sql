-- Migration: Add flight_number column to flight_schedules table
-- Date: 2025-12-21
-- Description: Add flight_number to store actual flight numbers like "VJ182", "VN7106" instead of just schedule_id

-- Step 1: Add flight_number column (nullable first for existing data)
ALTER TABLE flight_schedules
ADD COLUMN IF NOT EXISTS flight_number VARCHAR(20);

-- Step 2: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_flight_schedules_flight_number
ON flight_schedules(flight_number);

-- Step 3: Add type_of_plane column if not exists (for aircraft type)
ALTER TABLE flight_schedules
ADD COLUMN IF NOT EXISTS type_of_plane VARCHAR(50);

-- Note: After this migration:
-- 1. The crawler should be updated to extract and save flight_number when creating schedules
-- 2. Frontend will receive flight_number in API responses (e.g., "VJ182" instead of just "24")
-- 3. ML API will use actual flight numbers for better predictions
