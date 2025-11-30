-- Migration: Add flight_date column to flight_prices table
-- Date: 2025-11-20
-- Description: Add flight_date to track specific flight dates instead of just day_of_week

-- Step 1: Add flight_date column (nullable first for existing data)
ALTER TABLE flight_prices 
ADD COLUMN IF NOT EXISTS flight_date DATE;

-- Step 2: For existing data, we can't recover the exact date, so we'll leave it NULL
-- Future inserts will require this field

-- Step 3: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_flight_prices_date ON flight_prices(flight_date);

-- Step 4: Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_flight_prices_schedule_date 
ON flight_prices(schedule_id, flight_date, class_id);

-- Note: After this migration, the application should be updated to:
-- 1. Always insert flight_date when creating new price records
-- 2. Filter by flight_date when searching flights
-- 3. Consider making flight_date NOT NULL after backfilling existing data





