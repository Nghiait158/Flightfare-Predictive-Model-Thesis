const db = require('../config/database');
const mlService = require('../services/mlService');

/**
 * Search for flights based on criteria
 */
exports.searchFlights = async (req, res) => {
  try {
    const {
      from,
      to,
      departDate,
      returnDate,
      tripType = 'one-way',
      adults = 1,
      children = 0
    } = req.body;

    // Validate required fields
    if (!from || !to || !departDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: from, to, departDate'
      });
    }

    // Get airport IDs
    const airportQuery = `
      SELECT 
        (SELECT airport_id FROM airports WHERE airport_code = $1) as dep_id,
        (SELECT airport_id FROM airports WHERE airport_code = $2) as arr_id
    `;
    const airportResult = await db.query(airportQuery, [from, to]);

    if (!airportResult.rows[0].dep_id || !airportResult.rows[0].arr_id) {
      return res.status(404).json({
        success: false,
        message: 'Airports not found'
      });
    }

    const { dep_id, arr_id } = airportResult.rows[0];

    // Query flights with flight_date filter
    const flightQuery = `
      SELECT DISTINCT ON (fs.schedule_id, c.class_id)
        fs.schedule_id,
        fs.flight_number,
        fs.type_of_plane,
        fs.departure_time,
        fs.duration_minutes,
        al.airline_id,
        al.airline_code,
        al.airline_name,
        dep.airport_code as departure_airport_code,
        dep.airport_name as departure_airport_name,
        dep.city as departure_city,
        arr.airport_code as arrival_airport_code,
        arr.airport_name as arrival_airport_name,
        arr.city as arrival_city,
        c.class_id,
        c.class_name,
        fp.price,
        fp.currency,
        fp.flight_date,
        fp.checked_at,
        fp.price_id,
        EXTRACT(EPOCH FROM (NOW() - fp.checked_at))/3600 as hours_old
      FROM flight_schedules fs
      INNER JOIN airlines al ON fs.airline_id = al.airline_id
      INNER JOIN airports dep ON fs.departure_airport_id = dep.airport_id
      INNER JOIN airports arr ON fs.arrival_airport_id = arr.airport_id
      INNER JOIN flight_prices fp ON fs.schedule_id = fp.schedule_id
      INNER JOIN new_classes c ON fp.class_id = c.class_id
      WHERE fs.departure_airport_id = $1
        AND fs.arrival_airport_id = $2
        AND fp.flight_date = $3
        AND fs.is_active = true
        AND al.is_active = true
        AND c.is_active = true
      ORDER BY fs.schedule_id, c.class_id, fp.checked_at DESC
    `;

    console.log(`Searching flights: dep_id=${dep_id}, arr_id=${arr_id}, departDate=${departDate}`);
    const flightResult = await db.query(flightQuery, [dep_id, arr_id, departDate]);
    console.log(`Query returned ${flightResult.rows.length} flight-class combinations`);

    // Debug: Log first few results to check freshness
    if (flightResult.rows.length > 0) {
      console.log(`Sample data freshness:`, flightResult.rows.slice(0, 3).map(r => ({
        schedule: r.schedule_id,
        class: r.class_name,
        checked_at: r.checked_at,
        hours_old: parseFloat(r.hours_old).toFixed(2)
      })));
    }

    // Group flights by schedule and organize by class
    const flightsMap = new Map();

    flightResult.rows.forEach(row => {
      const scheduleKey = row.schedule_id;
      
      // FIX: Convert PostgreSQL DATE to string to avoid timezone issues
      let flightDateStr = row.flight_date;
      if (row.flight_date instanceof Date) {
        const year = row.flight_date.getFullYear();
        const month = String(row.flight_date.getMonth() + 1).padStart(2, '0');
        const day = String(row.flight_date.getDate()).padStart(2, '0');
        flightDateStr = `${year}-${month}-${day}`;
      } else if (typeof row.flight_date === 'string') {
        flightDateStr = row.flight_date.split('T')[0];
      }

      if (!flightsMap.has(scheduleKey)) {
        flightsMap.set(scheduleKey, {
          scheduleId: row.schedule_id,
          flightNumber: row.flight_number,  // Include flight number
          flightDate: flightDateStr,
          airline: {
            id: row.airline_id,
            code: row.airline_code,
            name: row.airline_name
          },
          departure: {
            airport: {
              code: row.departure_airport_code,
              name: row.departure_airport_name,
              city: row.departure_city
            },
            time: row.departure_time
          },
          arrival: {
            airport: {
              code: row.arrival_airport_code,
              name: row.arrival_airport_name,
              city: row.arrival_city
            },
            time: calculateArrivalTime(row.departure_time, row.duration_minutes)
          },
          duration: formatDuration(row.duration_minutes),
          durationMinutes: row.duration_minutes,
          stops: 0, // Assuming direct flights for now
          classes: []
        });
      }

      // Add class pricing
      flightsMap.get(scheduleKey).classes.push({
        classId: row.class_id,
        className: row.class_name,
        price: parseFloat(row.price),
        currency: row.currency,
        flightDate: flightDateStr,
        lastChecked: row.checked_at,
        hoursOld: parseFloat(row.hours_old)
      });
    });

    const flights = Array.from(flightsMap.values());

    // Sort by price (lowest first)
    flights.sort((a, b) => {
      const minPriceA = Math.min(...a.classes.map(c => c.price));
      const minPriceB = Math.min(...b.classes.map(c => c.price));
      return minPriceA - minPriceB;
    });

   
    const STALE_THRESHOLD_HOURS = 6;
    let oldestDataAge = 0;
    let isStale = false;

    if (flights.length > 0) {
      // Find the NEWEST and OLDEST data to understand data freshness better
      let newestDataAge = Infinity;
      flights.forEach(flight => {
        flight.classes.forEach(cls => {
          if (cls.hoursOld < newestDataAge) {
            newestDataAge = cls.hoursOld;
          }
          if (cls.hoursOld > oldestDataAge) {
            oldestDataAge = cls.hoursOld;
          }
        });
      });
      
      // Consider data FRESH if we have ANY data less than 1 hour old
      // This prevents re-crawling when we just crawled recently
      const hasFreshData = newestDataAge < 1;
      
      // Only consider stale if ALL data is old AND no fresh data exists
      isStale = oldestDataAge > STALE_THRESHOLD_HOURS && !hasFreshData;
      
      console.log(`📊 Data freshness analysis:`);
      console.log(`   Newest: ${newestDataAge.toFixed(2)}h old`);
      console.log(`   Oldest: ${oldestDataAge.toFixed(2)}h old`);
      console.log(`   Has fresh data (<1h): ${hasFreshData}`);
      console.log(`   Is stale: ${isStale} (threshold: ${STALE_THRESHOLD_HOURS}h)`);
      console.log(`   Total flights: ${flights.length}, Total classes: ${flights.reduce((sum, f) => sum + f.classes.length, 0)}`);
    }

    res.json({
      success: true,
      data: {
        flights,
        count: flights.length,
        dataFreshness: {
          oldestDataHours: Math.round(oldestDataAge * 10) / 10,
          newestDataHours: flights.length > 0 ? Math.round(Math.min(...flights.flatMap(f => f.classes.map(c => c.hoursOld))) * 10) / 10 : 0,
          isStale: isStale,
          thresholdHours: STALE_THRESHOLD_HOURS,
          message: isStale 
            ? `Price data is ${Math.round(oldestDataAge)} hours old. Consider refreshing for latest prices.`
            : 'Price data is up to date'
        },
        searchParams: {
          from,
          to,
          departDate,
          returnDate,
          tripType,
          adults,
          children
        }
      }
    });

  } catch (error) {
    console.error('Error searching flights:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching flights',
      error: error.message
    });
  }
};

/**
 * Get minimum prices for nearby dates (only fresh data)
 */
exports.getNearbyDatePrices = async (req, res) => {
  try {
    const { from, to, dates } = req.body;

    if (!from || !to || !dates || !Array.isArray(dates)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: from, to, dates (array)'
      });
    }

    // Get airport IDs
    const airportQuery = `
      SELECT 
        (SELECT airport_id FROM airports WHERE airport_code = $1) as dep_id,
        (SELECT airport_id FROM airports WHERE airport_code = $2) as arr_id
    `;
    const airportResult = await db.query(airportQuery, [from, to]);

    if (!airportResult.rows[0].dep_id || !airportResult.rows[0].arr_id) {
      return res.status(404).json({
        success: false,
        message: 'Airports not found'
      });
    }

    const { dep_id, arr_id } = airportResult.rows[0];
    const FRESH_DATA_THRESHOLD_HOURS = 6;

    // Simple query: Get cheapest price (from latest data) for each date
    const priceQuery = `
      WITH latest_prices AS (
        -- Step 1: Get LATEST price for each schedule+class+date
        SELECT DISTINCT ON (fs.schedule_id, c.class_id, fp.flight_date)
          fp.flight_date,
          fp.price,
          fp.checked_at,
          EXTRACT(EPOCH FROM (NOW() - fp.checked_at))/3600 as hours_old
        FROM flight_prices fp
        INNER JOIN flight_schedules fs ON fp.schedule_id = fs.schedule_id
        INNER JOIN new_classes c ON fp.class_id = c.class_id
        WHERE fs.departure_airport_id = $1
          AND fs.arrival_airport_id = $2
          AND fp.flight_date = ANY($3)
          AND fs.is_active = true
          AND c.is_active = true
          AND EXTRACT(EPOCH FROM (NOW() - fp.checked_at))/3600 <= $4
        ORDER BY fs.schedule_id, c.class_id, fp.flight_date, fp.checked_at DESC
      )
      -- Step 2: Get MIN price for each date
      SELECT 
        flight_date,
        MIN(price) as min_price,
        MAX(checked_at) as latest_checked_at,
        AVG(hours_old) as hours_old
      FROM latest_prices
      GROUP BY flight_date
      ORDER BY flight_date
    `;

    console.log(`\n📊 Nearby Dates - Fetching cheapest prices for ${dates.length} dates`);
    const result = await db.query(priceQuery, [dep_id, arr_id, dates, FRESH_DATA_THRESHOLD_HOURS]);
    console.log(`   ✅ Found ${result.rows.length} dates with fresh data (< ${FRESH_DATA_THRESHOLD_HOURS}h)`);
    
    // Format response
    const pricesByDate = {};
    result.rows.forEach(row => {
      // FIX: Convert PostgreSQL DATE to string to avoid timezone issues
      let dateStr = row.flight_date;
      if (row.flight_date instanceof Date) {
        const year = row.flight_date.getFullYear();
        const month = String(row.flight_date.getMonth() + 1).padStart(2, '0');
        const day = String(row.flight_date.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      } else if (typeof row.flight_date === 'string') {
        dateStr = row.flight_date.split('T')[0];
      }
      
      const minPrice = parseFloat(row.min_price);
      const hoursOld = parseFloat(row.hours_old);
      
      pricesByDate[dateStr] = {
        minPrice: minPrice,
        lastChecked: row.latest_checked_at,
        hoursOld: hoursOld,
        isFresh: hoursOld <= FRESH_DATA_THRESHOLD_HOURS
      };
      
      console.log(`      ${dateStr}: ${minPrice.toLocaleString()}đ (${hoursOld.toFixed(1)}h old)`);
    });

    const missingDates = dates.filter(d => !pricesByDate[d]);
    if (missingDates.length > 0) {
      console.log(`   ⚠️  No fresh data: ${missingDates.join(', ')}`);
    }

    res.json({
      success: true,
      data: {
        prices: pricesByDate,
        freshDataThresholdHours: FRESH_DATA_THRESHOLD_HOURS
      }
    });

  } catch (error) {
    console.error('Error fetching nearby date prices:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching nearby date prices',
      error: error.message
    });
  }
};

/**
 * Get all airlines
 */
exports.getAirlines = async (req, res) => {
  try {
    const query = 'SELECT * FROM airlines WHERE is_active = true ORDER BY airline_name';
    const result = await db.query(query);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching airlines:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching airlines',
      error: error.message
    });
  }
};

/**
 * Get cheapest tickets for a route (Global minimum search)
 * Scans future dates to find absolute cheapest prices
 */
exports.getCheapestTickets = async (req, res) => {
  try {
    const { from, to, daysAhead = 90, limit = 10 } = req.query;
    
    console.log('getCheapestTickets called with:', { from, to, daysAhead, limit });

    // Validate required fields
    if (!from || !to) {
      console.warn('Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: from, to'
      });
    }

    // Get airport IDs
    const airportQuery = `
      SELECT 
        (SELECT airport_id FROM airports WHERE airport_code = $1) as dep_id,
        (SELECT airport_id FROM airports WHERE airport_code = $2) as arr_id
    `;
    const airportResult = await db.query(airportQuery, [from, to]);
    console.log('Airport IDs:', airportResult.rows[0]);

    if (!airportResult.rows[0].dep_id || !airportResult.rows[0].arr_id) {
      return res.status(404).json({
        success: false,
        message: 'Airports not found'
      });
    }

    const { dep_id, arr_id } = airportResult.rows[0];

    // Query to find cheapest flights across available dates
    // Priority: 1. Lowest price, 2. Earliest date, 3. Direct flights
    // IMPORTANT: Only show FRESH data (checked within last 24 hours)
    const FRESH_DATA_THRESHOLD_HOURS = 24;
    
    const cheapestQuery = `
      SELECT DISTINCT ON (fp.flight_date, fs.schedule_id)
        fs.schedule_id,
        fs.departure_time,
        fs.arrival_airport_id,
        fs.duration_minutes,
        al.airline_code,
        al.airline_name,
        fp.price,
        fp.currency,
        fp.flight_date,
        TO_CHAR(fp.flight_date, 'YYYY-MM-DD') as flight_date_str,
        fp.checked_at,
        EXTRACT(EPOCH FROM (NOW() - fp.checked_at))/3600 as hours_old,
        EXTRACT(DOW FROM fp.flight_date) as day_of_week,
        TO_CHAR(fp.flight_date, 'Dy, Mon DD') as formatted_date
      FROM flight_prices fp
      INNER JOIN flight_schedules fs ON fp.schedule_id = fs.schedule_id
      INNER JOIN airlines al ON fs.airline_id = al.airline_id
      WHERE fs.departure_airport_id = $1
        AND fs.arrival_airport_id = $2
        AND fs.is_active = true
        AND al.is_active = true
        AND fp.flight_date >= CURRENT_DATE
        AND EXTRACT(EPOCH FROM (NOW() - fp.checked_at))/3600 <= ${FRESH_DATA_THRESHOLD_HOURS}
      ORDER BY fp.flight_date, fs.schedule_id, fp.checked_at DESC
    `;

    const result = await db.query(cheapestQuery, [dep_id, arr_id]);
    console.log(`Found ${result.rows.length} flight records with fresh data (< ${FRESH_DATA_THRESHOLD_HOURS}h old)`);

    // Group by date and find minimum price for each date
    const dateMinPrices = new Map();
    
    result.rows.forEach(row => {
      const dateKey = row.flight_date_str; // Use pre-formatted string from SQL
      if (!dateMinPrices.has(dateKey) || row.price < dateMinPrices.get(dateKey).price) {
        dateMinPrices.set(dateKey, row);
      }
    });

    // Sort by price (ascending), then by date (ascending)
    const cheapestFlights = Array.from(dateMinPrices.values())
      .sort((a, b) => {
        if (a.price !== b.price) {
          return a.price - b.price; // Lowest price first
        }
        // Compare date strings directly (YYYY-MM-DD format sorts correctly)
        return a.flight_date_str.localeCompare(b.flight_date_str);
      })
      .slice(0, limit)
      .map(flight => {
        // Calculate arrival time
        const depTime = flight.departure_time;
        const [hours, minutes] = depTime.split(':');
        const depDate = new Date();
        depDate.setHours(parseInt(hours), parseInt(minutes), 0);
        
        const arrDate = new Date(depDate.getTime() + flight.duration_minutes * 60000);
        
        // Format times
        const formatTime = (date) => {
          const h = date.getHours();
          const m = date.getMinutes();
          const ampm = h >= 12 ? 'pm' : 'am';
          const h12 = h % 12 || 12;
          return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
        };

        const durationHours = Math.floor(flight.duration_minutes / 60);
        const durationMins = flight.duration_minutes % 60;
        const durationStr = durationHours > 0 
          ? `${durationHours}h${durationMins > 0 ? ` ${durationMins}m` : ''}`
          : `${durationMins}m`;

        return {
          scheduleId: flight.schedule_id,
          price: parseFloat(flight.price),
          currency: flight.currency,
          date: flight.formatted_date,
          flightDate: flight.flight_date_str, // Use pre-formatted string from SQL (YYYY-MM-DD)
          time: `${formatTime(depDate)} — ${formatTime(arrDate)}`,
          duration: durationStr,
          flightType: 'Direct',
          airlineCode: flight.airline_code,
          airlineName: flight.airline_name,
          hoursOld: flight.hours_old ? parseFloat(flight.hours_old) : null,
          isFresh: flight.hours_old ? parseFloat(flight.hours_old) <= FRESH_DATA_THRESHOLD_HOURS : false
        };
      });

    console.log(`Returning ${cheapestFlights.length} cheapest flights`);

    res.json({
      success: true,
      data: {
        flights: cheapestFlights,
        count: cheapestFlights.length,
        searchParams: {
          from,
          to,
          daysAhead
        }
      }
    });

  } catch (error) {
    console.error('Error fetching cheapest tickets:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error fetching cheapest tickets',
      error: error.message
    });
  }
};

/**
 * Get all flight classes
 */
exports.getFlightClasses = async (req, res) => {
  try {
    const query = 'SELECT * FROM new_classes WHERE is_active = true ORDER BY class_name';
    const result = await db.query(query);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching flight classes:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching flight classes',
      error: error.message
    });
  }
};
// Get flight price history
exports.getPriceHistory = async (req, res) => {
  try {
    const { scheduleId, classId, days = 30 } = req.query;

    if (!scheduleId || !classId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: scheduleId, classId'
      });
    }

    const query = `
      SELECT 
        price,
        currency,
        flight_date,
        checked_at,
        travel_day_of_week,
        is_weekend
      FROM flight_prices
      WHERE schedule_id = $1
        AND class_id = $2
        AND checked_at >= NOW() - INTERVAL '${parseInt(days)} days'
      ORDER BY flight_date DESC, checked_at DESC
      LIMIT 100
    `;

    const result = await db.query(query, [scheduleId, classId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching price history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching price history',
      error: error.message
    });
  }
};

/**
 * Get price chart data - cheapest price per day for next 15 days
 * Used for bar chart visualization
 */
exports.getPriceChartData = async (req, res) => {
  try {
    const { from, to, days = 15 } = req.query;
    
    console.log('getPriceChartData called with:', { from, to, days });

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: from, to'
      });
    }

    // Get airport IDs
    const airportQuery = `
      SELECT 
        (SELECT airport_id FROM airports WHERE airport_code = $1) as dep_id,
        (SELECT airport_id FROM airports WHERE airport_code = $2) as arr_id
    `;
    const airportResult = await db.query(airportQuery, [from, to]);

    if (!airportResult.rows[0].dep_id || !airportResult.rows[0].arr_id) {
      return res.status(404).json({
        success: false,
        message: 'Airports not found'
      });
    }

    const { dep_id, arr_id } = airportResult.rows[0];

    // Query to get cheapest price per day
    // Include 3 days before today to show recent price trends
    // IMPORTANT: Only show FRESH data (checked within last 24 hours)
    const DAYS_BEFORE = 3;
    const FRESH_DATA_THRESHOLD_HOURS = 24; // Price chart can show slightly older data than search
    
    const priceChartQuery = `
      WITH date_range AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '${DAYS_BEFORE} days',
          CURRENT_DATE + INTERVAL '${parseInt(days)} days',
          '1 day'::interval
        )::date as date
      ),
      cheapest_per_day AS (
        SELECT 
          fp.flight_date,
          MIN(fp.price) as min_price,
          MAX(fp.currency) as currency,
          EXTRACT(DOW FROM fp.flight_date) as day_of_week,
          TO_CHAR(fp.flight_date, 'Day') as day_name,
          TO_CHAR(fp.flight_date, 'Mon DD') as formatted_date,
          COUNT(DISTINCT fs.schedule_id) as flight_count,
          MAX(fp.checked_at) as latest_checked_at,
          EXTRACT(EPOCH FROM (NOW() - MAX(fp.checked_at)))/3600 as hours_old
        FROM flight_prices fp
        INNER JOIN flight_schedules fs ON fp.schedule_id = fs.schedule_id
        WHERE fs.departure_airport_id = $1
          AND fs.arrival_airport_id = $2
          AND fs.is_active = true
          AND fp.flight_date >= CURRENT_DATE - INTERVAL '${DAYS_BEFORE} days'
          AND fp.flight_date <= CURRENT_DATE + INTERVAL '${parseInt(days)} days'
          AND EXTRACT(EPOCH FROM (NOW() - fp.checked_at))/3600 <= ${FRESH_DATA_THRESHOLD_HOURS}
        GROUP BY fp.flight_date
      )
      SELECT 
        dr.date as flight_date,
        COALESCE(cpd.min_price, NULL) as min_price,
        COALESCE(cpd.currency, 'VND') as currency,
        EXTRACT(DOW FROM dr.date) as day_of_week,
        TO_CHAR(dr.date, 'Day') as day_name,
        TO_CHAR(dr.date, 'Mon DD') as formatted_date,
        COALESCE(cpd.flight_count, 0) as flight_count,
        CASE WHEN EXTRACT(DOW FROM dr.date) IN (0, 6) THEN true ELSE false END as is_weekend,
        cpd.latest_checked_at,
        cpd.hours_old
      FROM date_range dr
      LEFT JOIN cheapest_per_day cpd ON dr.date = cpd.flight_date
      ORDER BY dr.date ASC
    `;

    const result = await db.query(priceChartQuery, [dep_id, arr_id]);
    console.log(`Found ${result.rows.length} days in range (fresh data only < ${FRESH_DATA_THRESHOLD_HOURS}h)`);

    const priceData = result.rows.map(row => {
      // FIX: Convert PostgreSQL DATE to string to avoid timezone issues
      // PostgreSQL returns Date object which may be affected by timezone
      let dateStr = row.flight_date;
      if (row.flight_date instanceof Date) {
        // Extract YYYY-MM-DD without timezone conversion
        const year = row.flight_date.getFullYear();
        const month = String(row.flight_date.getMonth() + 1).padStart(2, '0');
        const day = String(row.flight_date.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      } else if (typeof row.flight_date === 'string') {
        // Already a string, use as-is (might be "2024-12-29" or "2024-12-29T00:00:00Z")
        dateStr = row.flight_date.split('T')[0];
      }
      
      return {
        date: dateStr,
        formattedDate: row.formatted_date?.trim(),
        dayName: row.day_name?.trim(),
        dayOfWeek: parseInt(row.day_of_week),
        price: row.min_price ? parseFloat(row.min_price) : null,
        currency: row.currency,
        flightCount: parseInt(row.flight_count),
        isWeekend: row.is_weekend,
        hasData: row.min_price !== null,
        latestCheckedAt: row.latest_checked_at,
        hoursOld: row.hours_old ? parseFloat(row.hours_old) : null,
        isFresh: row.hours_old ? parseFloat(row.hours_old) <= FRESH_DATA_THRESHOLD_HOURS : false
      };
    });

    // Calculate price statistics for available data
    const pricesWithData = priceData.filter(d => d.hasData).map(d => d.price);
    const statistics = pricesWithData.length > 0 ? {
      min: Math.min(...pricesWithData),
      max: Math.max(...pricesWithData),
      avg: pricesWithData.reduce((a, b) => a + b, 0) / pricesWithData.length,
      count: pricesWithData.length
    } : null;

    res.json({
      success: true,
      data: {
        prices: priceData,
        statistics,
        searchParams: {
          from,
          to,
          days: parseInt(days)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching price chart data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching price chart data',
      error: error.message
    });
  }
};

/**
 * Helper function to calculate arrival time
 */
function calculateArrivalTime(departureTime, durationMinutes) {
  const [hours, minutes] = departureTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  
  const arrivalHours = Math.floor(totalMinutes / 60) % 24;
  const arrivalMinutes = totalMinutes % 60;
  
  return `${String(arrivalHours).padStart(2, '0')}:${String(arrivalMinutes).padStart(2, '0')}`;
}

/**
 * Helper function to format duration
 */
function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}


exports.getPopularDestinations = async (req, res) => {
  try {
    const { from } = req.query;
    console.log(`Fetching popular destinations from: ${from}`);

    if (!from) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: from'
      });
    }

    // Get the departure airport ID
    const airportQuery = `
      SELECT airport_id, airport_name, city 
      FROM airports 
      WHERE airport_code = $1
    `;
    const airportResult = await db.query(airportQuery, [from]);
    console.log(`Found airport: ${airportResult.rows.length > 0 ? airportResult.rows[0].airport_name : 'Not found'}`);

    if (airportResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Departure airport not found'
      });
    }

    const depAirportId = airportResult.rows[0].airport_id;
    const depAirportName = airportResult.rows[0].airport_name;
    const depCity = airportResult.rows[0].city;

    // Get popular destinations with minimum prices
    // Try to get future flights first, if none exist, get most recent data
    let destinationsQuery = `
      SELECT 
        arr.airport_code,
        arr.airport_name,
        arr.city,
        COUNT(DISTINCT fs.schedule_id) as flight_count,
        MIN(fp.price) as min_price,
        MAX(fp.currency) as currency
      FROM flight_schedules fs
      INNER JOIN airports arr ON fs.arrival_airport_id = arr.airport_id
      INNER JOIN flight_prices fp ON fs.schedule_id = fp.schedule_id
      WHERE fs.departure_airport_id = $1
        AND fs.is_active = true
        AND fp.flight_date >= CURRENT_DATE
      GROUP BY arr.airport_code, arr.airport_name, arr.city
      ORDER BY flight_count DESC, min_price ASC
      LIMIT 8
    `;

    let destinationsResult = await db.query(destinationsQuery, [depAirportId]);

    // If no future flights found, get the most recent available data
    if (destinationsResult.rows.length === 0) {
      destinationsQuery = `
        SELECT 
          arr.airport_code,
          arr.airport_name,
          arr.city,
          COUNT(DISTINCT fs.schedule_id) as flight_count,
          MIN(fp.price) as min_price,
          MAX(fp.currency) as currency
        FROM flight_schedules fs
        INNER JOIN airports arr ON fs.arrival_airport_id = arr.airport_id
        INNER JOIN flight_prices fp ON fs.schedule_id = fp.schedule_id
        WHERE fs.departure_airport_id = $1
          AND fs.is_active = true
        GROUP BY arr.airport_code, arr.airport_name, arr.city
        ORDER BY flight_count DESC, min_price ASC
        LIMIT 8
      `;
      destinationsResult = await db.query(destinationsQuery, [depAirportId]);
    }

    const destinations = destinationsResult.rows.map(row => ({
      airportCode: row.airport_code,
      airportName: row.airport_name,
      city: row.city,
      flightCount: parseInt(row.flight_count),
      minPrice: parseFloat(row.min_price),
      currency: row.currency || 'VND',
      latestCheckedAt: row.latest_checked_at,
      hoursOld: row.hours_old ? parseFloat(row.hours_old) : null,
      isFresh: row.hours_old ? parseFloat(row.hours_old) <= FRESH_DATA_THRESHOLD_HOURS : false
    }));

    console.log(`✅ Found ${destinations.length} popular destinations`);

    res.json({
      success: true,
      data: {
        from: {
          airportCode: from,
          airportName: depAirportName,
          city: depCity
        },
        destinations
      }
    });

  } catch (error) {
    console.error('Error fetching popular destinations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching popular destinations',
      error: error.message
    });
  }
};

/**
 * ML Prediction: Analyze flight and get price prediction
 */
exports.analyzeFlight = async (req, res) => {
  try {
    const {
      scheduleId,
      classId,
      flightDate
    } = req.body;

    console.log('analyzeFlight called with:', { scheduleId, classId, flightDate });

    // Validate required fields
    if (!scheduleId || !classId || !flightDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: scheduleId, classId, flightDate'
      });
    }

    // Get flight details from database
    const flightQuery = `
      SELECT
        fs.schedule_id,
        fs.flight_number,
        fs.departure_time,
        fs.duration_minutes,
        al.airline_code,
        al.airline_name,
        dep.airport_code as departure_airport,
        dep.airport_name as departure_airport_name,
        arr.airport_code as arrival_airport,
        arr.airport_name as arrival_airport_name,
        c.class_name,
        fs.type_of_plane
      FROM flight_schedules fs
      INNER JOIN airlines al ON fs.airline_id = al.airline_id
      INNER JOIN airports dep ON fs.departure_airport_id = dep.airport_id
      INNER JOIN airports arr ON fs.arrival_airport_id = arr.airport_id
      INNER JOIN new_classes c ON c.class_id = $2
      WHERE fs.schedule_id = $1
        AND fs.is_active = true
    `;

    const flightResult = await db.query(flightQuery, [scheduleId, classId]);

    if (flightResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Flight not found'
      });
    }

    const flight = flightResult.rows[0];

    // Calculate arrival time
    const arrivalTime = calculateArrivalTime(flight.departure_time, flight.duration_minutes);

    // Prepare data for ML prediction
    const mlRequestData = {
      flight_number: flight.flight_number,
      departure_airport: flight.departure_airport,
      arrival_airport: flight.arrival_airport,
      flight_date: flightDate,
      departure_time: flight.departure_time,
      arrival_time: arrivalTime,
      classes: flight.class_name,
      type_of_plane: flight.type_of_plane || ''
    };

    console.log('Sending to ML API:', mlRequestData);

    // Call ML service
    const mlResult = await mlService.predictFlightPrice(mlRequestData);

    if (!mlResult.success) {
      return res.status(503).json({
        success: false,
        message: 'ML prediction service error',
        error: mlResult.error,
        details: mlResult.details
      });
    }

    // Return combined response
    res.json({
      success: true,
      data: {
        flight: {
          scheduleId: flight.schedule_id,
          flightNumber: flight.flight_number,
          airline: {
            code: flight.airline_code,
            name: flight.airline_name
          },
          departure: {
            airport: flight.departure_airport,
            name: flight.departure_airport_name,
            time: flight.departure_time
          },
          arrival: {
            airport: flight.arrival_airport,
            name: flight.arrival_airport_name,
            time: arrivalTime
          },
          class: flight.class_name,
          flightDate: flightDate,
          typeOfPlane: flight.type_of_plane
        },
        mlAnalysis: mlResult.data
      }
    });

  } catch (error) {
    console.error('Error analyzing flight:', error);
    res.status(500).json({
      success: false,
      message: 'Error analyzing flight',
      error: error.message
    });
  }
};

/**
 * ML Prediction: Quick price prediction (minimal analysis)
 */
exports.quickPricePredict = async (req, res) => {
  try {
    const mlRequestData = req.body;

    // Validate required fields
    const requiredFields = ['departure_airport', 'arrival_airport', 'flight_date', 'classes'];
    const missingFields = requiredFields.filter(field => !mlRequestData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    console.log('Quick price prediction for:', mlRequestData);

    // Call ML service
    const mlResult = await mlService.predictFlightPrice(mlRequestData);

    if (!mlResult.success) {
      return res.status(503).json({
        success: false,
        message: 'ML prediction service error',
        error: mlResult.error
      });
    }

    res.json({
      success: true,
      data: mlResult.data
    });

  } catch (error) {
    console.error('Error in quick price prediction:', error);
    res.status(500).json({
      success: false,
      message: 'Error in quick price prediction',
      error: error.message
    });
  }
};

/**
 * Check ML service health
 */
exports.checkMLHealth = async (req, res) => {
  try {
    const healthResult = await mlService.healthCheck();

    res.json({
      success: healthResult.success,
      data: healthResult.data || { error: healthResult.error }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking ML service health',
      error: error.message
    });
  }
};

