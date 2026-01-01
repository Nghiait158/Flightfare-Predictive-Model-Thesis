import { createRequire } from 'module';
const require = createRequire(import.meta.url);


let pool;

/**
 * Initialize database connection
 */
async function initializeDB() {
    if (!pool) {
        try {
            const dbModule = await import('../../../web-app/server/src/config/database.js');
            pool = dbModule.default || dbModule;
            console.log('✅ Flight Price Service: Database connection initialized');
        } catch (error) {
            console.warn('⚠️  Flight Price Service: Database not available');
            throw error;
        }
    }
    return pool;
}

/**
 * Extract airline code from flight number (e.g., "VJ123" -> "VJ")
 */
function extractAirlineCode(flightNumber) {
    if (!flightNumber) return 'UNKNOWN';
    const match = flightNumber.match(/^[A-Z]+/);
    return match ? match[0] : 'UNKNOWN';
}

/**
 * Get airline name from code
 */
function getAirlineName(code) {
    const airlineNames = {
        'VJ': 'VietJet Air',
        'VN': 'Vietnam Airlines',
        'QH': 'Bamboo Airways',
        'BL': 'Pacific Airlines',
        'VU': 'Vietravel Airlines'
    };
    return airlineNames[code] || code;
}

/**
 * Calculate flight duration in minutes
 */
function calculateDuration(departureTime, arrivalTime) {
    try {
        const [depHour, depMin] = departureTime.split(':').map(Number);
        const [arrHour, arrMin] = arrivalTime.split(':').map(Number);
        
        let minutes = (arrHour * 60 + arrMin) - (depHour * 60 + depMin);
        
        // Handle overnight flights
        if (minutes < 0) {
            minutes += 24 * 60;
        }
        
        return minutes;
    } catch (error) {
        console.warn('⚠️  Error calculating duration:', error.message);
        return 120; // Default 2 hours
    }
}

/**
 * Save flight prices to database
 * @param {Array} dailyResults - Array of flight price records from crawler
 * @param {Object} flightConfig - Flight search configuration
 * @param {String} sourceType - 'user_search' or 'batch_crawl'
 * @returns {Object} Result object with success status and count
 */
export async function saveFlightPricesToDB(dailyResults, flightConfig, sourceType = 'user_search') {
    // Initialize DB connection
    const dbPool = await initializeDB();
    const client = await dbPool.connect();
    
    try {
        await client.query('BEGIN');
        
        console.log(`💾 Starting database save for ${dailyResults.length} flight prices...`);
        
        let savedCount = 0;
        let skippedCount = 0;
        
        for (const record of dailyResults) {
            try {
                // Extract airline info
                const airlineCode = extractAirlineCode(record.flight_number);
                const airlineName = getAirlineName(airlineCode);
                
                // 1. Insert or get airline
                const airlineQuery = `
                    INSERT INTO airlines (airline_code, airline_name, is_active)
                    VALUES ($1, $2, true)
                    ON CONFLICT (airline_code) 
                    DO UPDATE SET airline_name = EXCLUDED.airline_name
                    RETURNING airline_id
                `;
                const airlineResult = await client.query(airlineQuery, [airlineCode, airlineName]);
                const airlineId = airlineResult.rows[0].airline_id;
                
                // 2. Insert or get flight schedule
                const duration = calculateDuration(record.departure_time, record.arrival_time);
                let scheduleId;
                
                // First, check if airports exist
                const checkAirportsQuery = `
                    SELECT 
                        (SELECT airport_id FROM airports WHERE airport_code = $1) as dep_id,
                        (SELECT airport_id FROM airports WHERE airport_code = $2) as arr_id
                `;
                const airportCheck = await client.query(checkAirportsQuery, [
                    record.departure_airport,
                    record.arrival_airport
                ]);
                
                if (!airportCheck.rows[0].dep_id || !airportCheck.rows[0].arr_id) {
                    console.warn(`⚠️  Airports not found: ${record.departure_airport} or ${record.arrival_airport}, skipping...`);
                    skippedCount++;
                    continue;
                }
                
                // Try to get existing schedule first
                const getScheduleQuery = `
                    SELECT schedule_id FROM flight_schedules
                    WHERE airline_id = $1
                      AND departure_airport_id = $2
                      AND arrival_airport_id = $3
                      AND departure_time = $4::time
                    LIMIT 1
                `;
                const existingSchedule = await client.query(getScheduleQuery, [
                    airlineId,
                    airportCheck.rows[0].dep_id,
                    airportCheck.rows[0].arr_id,
                    record.departure_time
                ]);
                
                if (existingSchedule.rows.length > 0) {
                    scheduleId = existingSchedule.rows[0].schedule_id;

                    // Update flight_number and type_of_plane if not set yet
                    if (record.flight_number || record.type_of_plane) {
                        const updateScheduleQuery = `
                            UPDATE flight_schedules
                            SET flight_number = COALESCE(flight_number, $1),
                                type_of_plane = COALESCE(type_of_plane, $2)
                            WHERE schedule_id = $3
                        `;
                        await client.query(updateScheduleQuery, [
                            record.flight_number || null,
                            record.type_of_plane || null,
                            scheduleId
                        ]);
                    }
                } else {
                    // Insert new schedule WITH FLIGHT NUMBER
                    const insertScheduleQuery = `
                        INSERT INTO flight_schedules (
                            airline_id,
                            departure_airport_id,
                            arrival_airport_id,
                            departure_time,
                            duration_minutes,
                            flight_number,
                            type_of_plane,
                            is_active
                        )
                        VALUES ($1, $2, $3, $4::time, $5, $6, $7, true)
                        RETURNING schedule_id
                    `;
                    try {
                        const scheduleResult = await client.query(insertScheduleQuery, [
                            airlineId,
                            airportCheck.rows[0].dep_id,
                            airportCheck.rows[0].arr_id,
                            record.departure_time,
                            duration,
                            record.flight_number || null,  // SAVE flight_number
                            record.type_of_plane || null   // SAVE aircraft type
                        ]);
                        scheduleId = scheduleResult.rows[0].schedule_id;
                    } catch (insertError) {
                        // If insert fails (race condition), try to get again
                        const retrySchedule = await client.query(getScheduleQuery, [
                            airlineId,
                            airportCheck.rows[0].dep_id,
                            airportCheck.rows[0].arr_id,
                            record.departure_time
                        ]);
                        if (retrySchedule.rows.length === 0) {
                            console.warn(`⚠️  Schedule insert failed for ${record.flight_number}: ${insertError.message}`);
                            skippedCount++;
                            continue;
                        }
                        scheduleId = retrySchedule.rows[0].schedule_id;
                    }
                }
                
                // 3. Insert or get class
                let classId;
                const className = record.classes || 'Economy';
                
                // Try to get existing class first
                const getClassQuery = `
                    SELECT class_id FROM new_classes WHERE class_name = $1 LIMIT 1
                `;
                const existingClass = await client.query(getClassQuery, [className]);
                
                if (existingClass.rows.length > 0) {
                    classId = existingClass.rows[0].class_id;
                } else {
                    // Insert new class if not exists
                    const insertClassQuery = `
                        INSERT INTO new_classes (class_name, is_active)
                        VALUES ($1, true)
                        RETURNING class_id
                    `;
                    try {
                        const classResult = await client.query(insertClassQuery, [className]);
                        classId = classResult.rows[0].class_id;
                    } catch (insertError) {
                        // If insert fails (race condition), try to get again
                        const retryClass = await client.query(getClassQuery, [className]);
                        if (retryClass.rows.length === 0) {
                            console.warn(`⚠️  Class not found for ${className}, skipping...`);
                            skippedCount++;
                            continue;
                        }
                        classId = retryClass.rows[0].class_id;
                    }
                }
                
                // 4. Insert flight price with flight_date
                // Parse date carefully to avoid timezone issues
                // If flight_date is in YYYY-MM-DD format, parse it as local date
                let flightDate;
                let dayOfWeek;
                let isWeekend;
                
                if (record.flight_date) {
                    if (record.flight_date.includes('T')) {
                        // Legacy format with time (e.g., "2024-12-20T00:00:00.000Z")
                        flightDate = new Date(record.flight_date);
                    } else if (record.flight_date.includes('-')) {
                        // Plain date format "YYYY-MM-DD" - parse as local date
                        const [year, month, day] = record.flight_date.split('-').map(Number);
                        flightDate = new Date(year, month - 1, day);
                    } else {
                        // Fallback: try to parse as is
                        flightDate = new Date(record.flight_date);
                    }
                    dayOfWeek = flightDate.getDay();
                    isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                } else {
                    // No date provided, use current date
                    flightDate = new Date();
                    dayOfWeek = flightDate.getDay();
                    isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                }
                
                const priceQuery = `
                    INSERT INTO flight_prices (
                        schedule_id,
                        class_id,
                        flight_date,
                        price,
                        currency,
                        travel_day_of_week,
                        is_weekend,
                        adult_count,
                        child_count,
                        checked_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                `;
                
                await client.query(priceQuery, [
                    scheduleId,
                    classId,
                    record.flight_date, // Add flight_date to insert
                    parseFloat(record.price) || 0,
                    'VND',
                    dayOfWeek,
                    isWeekend,
                    record.adult || flightConfig.adult || 1,
                    record.child || flightConfig.child || 0
                ]);
                
                savedCount++;
                
            } catch (recordError) {
                console.warn(`⚠️  Failed to save record for ${record.flight_number}: ${recordError.message}`);
                skippedCount++;
                // Continue with next record
            }
        }
        
        await client.query('COMMIT');
        
        console.log(`✅ Database save completed: ${savedCount} saved, ${skippedCount} skipped`);
        
        return {
            success: true,
            savedCount,
            skippedCount,
            total: dailyResults.length
        };
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Database transaction failed:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Check if database is available
 */
export async function isDatabaseAvailable() {
    try {
        const dbPool = await initializeDB();
        const result = await dbPool.query('SELECT 1');
        return result.rowCount === 1;
    } catch (error) {
        return false;
    }
}

export default {
    saveFlightPricesToDB,
    isDatabaseAvailable
};

