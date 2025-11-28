-- Create Database
-- CREATE DATABASE flight_prediction;

-- Connect to database
-- \c flight_prediction;

-- Drop tables if exists (for development)
DROP TABLE IF EXISTS flight_prices CASCADE;
DROP TABLE IF EXISTS price_alerts CASCADE;
DROP TABLE IF EXISTS price_predictions CASCADE;
DROP TABLE IF EXISTS search_history CASCADE;
DROP TABLE IF EXISTS flight_schedules CASCADE;
DROP TABLE IF EXISTS airports CASCADE;
DROP TABLE IF EXISTS aircraft_types CASCADE;
DROP TABLE IF EXISTS new_classes CASCADE;
DROP TABLE IF EXISTS airlines CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Airlines Table
CREATE TABLE airlines (
    airline_id SERIAL PRIMARY KEY,
    airline_code VARCHAR(10) UNIQUE NOT NULL,
    airline_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Airports Table
CREATE TABLE airports (
    airport_id SERIAL PRIMARY KEY,
    airport_code VARCHAR(10) UNIQUE NOT NULL,
    airport_name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Aircraft Types Table
CREATE TABLE aircraft_types (
    aircraft_type_id SERIAL PRIMARY KEY,
    aircraft_type_name VARCHAR(100) NOT NULL,
    aircraft_group VARCHAR(50),
    seats_id INTEGER,
    duration_minutes INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_id INTEGER
);

-- 4. Flight Classes Table
CREATE TABLE new_classes (
    class_id SERIAL PRIMARY KEY,
    class_name VARCHAR(50) NOT NULL,
    day_adv INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Users Table
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Flight Schedules Table
CREATE TABLE flight_schedules (
    schedule_id SERIAL PRIMARY KEY,
    airline_id INTEGER REFERENCES airlines(airline_id),
    departure_airport_id INTEGER REFERENCES airports(airport_id),
    arrival_airport_id INTEGER REFERENCES airports(airport_id),
    departure_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Flight Prices Table
CREATE TABLE flight_prices (
    price_id SERIAL PRIMARY KEY,
    schedule_id INTEGER REFERENCES flight_schedules(schedule_id),
    class_id INTEGER REFERENCES new_classes(class_id),
    flight_date DATE NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'VND',
    travel_day_of_week INTEGER,
    is_weekend BOOLEAN,
    child_count INTEGER DEFAULT 0,
    adult_count INTEGER DEFAULT 1,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Price Predictions Table
CREATE TABLE price_predictions (
    prediction_id SERIAL PRIMARY KEY,
    schedule_id INTEGER REFERENCES flight_schedules(schedule_id),
    class_id INTEGER REFERENCES new_classes(class_id),
    predicted_price DECIMAL(12,2) NOT NULL,
    confidence_score DECIMAL(5,4),
    model_version VARCHAR(50),
    predicted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Search History Table
CREATE TABLE search_history (
    search_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id),
    departure_airport_id INTEGER REFERENCES airports(airport_id),
    arrival_airport_id INTEGER REFERENCES airports(airport_id),
    departure_date DATE,
    return_date DATE,
    trip_type VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Price Alerts Table
CREATE TABLE price_alerts (
    alert_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id),
    departure_airport_id INTEGER REFERENCES airports(airport_id),
    arrival_airport_id INTEGER REFERENCES airports(airport_id),
    departure_date DATE,
    class_id INTEGER REFERENCES new_classes(class_id),
    target_price DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Create Indexes for better performance
CREATE INDEX idx_airports_code ON airports(airport_code);
CREATE INDEX idx_airports_city ON airports(city);
CREATE INDEX idx_flight_schedules_departure ON flight_schedules(departure_airport_id);
CREATE INDEX idx_flight_schedules_arrival ON flight_schedules(arrival_airport_id);
CREATE INDEX idx_flight_prices_schedule ON flight_prices(schedule_id);
CREATE INDEX idx_flight_prices_date ON flight_prices(flight_date);
CREATE INDEX idx_flight_prices_schedule_date ON flight_prices(schedule_id, flight_date, class_id);
CREATE INDEX idx_search_history_user ON search_history(user_id);
CREATE INDEX idx_price_alerts_user ON price_alerts(user_id);

