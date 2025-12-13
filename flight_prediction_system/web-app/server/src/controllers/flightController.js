const db = require('../config/database');

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

    // Group flights by schedule and organize by class
    const flightsMap = new Map();

    flightResult.rows.forEach(row => {
      const scheduleKey = row.schedule_id;

      if (!flightsMap.has(scheduleKey)) {
        flightsMap.set(scheduleKey, {
          scheduleId: row.schedule_id,
          flightDate: row.flight_date,
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
        flightDate: row.flight_date,
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
      // Find the oldest data
      flights.forEach(flight => {
        flight.classes.forEach(cls => {
          if (cls.hoursOld > oldestDataAge) {
            oldestDataAge = cls.hoursOld;
            console.log(`Found older data: ${cls.className} checked at ${cls.lastChecked} (${cls.hoursOld.toFixed(2)}h old)`);
          }
        });
      });
      
      isStale = oldestDataAge > STALE_THRESHOLD_HOURS;
      console.log(`Data freshness: oldest=${oldestDataAge.toFixed(2)}h, isStale=${isStale}, threshold=${STALE_THRESHOLD_HOURS}h`);
    }

    res.json({
      success: true,
      data: {
        flights,
        count: flights.length,
        dataFreshness: {
          oldestDataHours: Math.round(oldestDataAge * 10) / 10,
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
    // Note: Searches all available dates in DB, not limited by current date
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
        fp.checked_at,
        EXTRACT(DOW FROM fp.flight_date) as day_of_week,
        TO_CHAR(fp.flight_date, 'Dy, Mon DD') as formatted_date
      FROM flight_prices fp
      INNER JOIN flight_schedules fs ON fp.schedule_id = fs.schedule_id
      INNER JOIN airlines al ON fs.airline_id = al.airline_id
      WHERE fs.departure_airport_id = $1
        AND fs.arrival_airport_id = $2
        AND fs.is_active = true
        AND al.is_active = true
      ORDER BY fp.flight_date, fs.schedule_id, fp.checked_at DESC
    `;

    const result = await db.query(cheapestQuery, [dep_id, arr_id]);
    console.log(`Found ${result.rows.length} flight records from database`);

    // Group by date and find minimum price for each date
    const dateMinPrices = new Map();
    
    result.rows.forEach(row => {
      const dateKey = row.flight_date.toISOString().split('T')[0];
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
        return new Date(a.flight_date) - new Date(b.flight_date); // Earliest date first
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
          flightDate: flight.flight_date,
          time: `${formatTime(depDate)} — ${formatTime(arrDate)}`,
          duration: durationStr,
          flightType: 'Direct',
          airlineCode: flight.airline_code,
          airlineName: flight.airline_name
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
 * Get monthly prices - minimum price for each day in a month
 */
exports.getMonthlyPrices = async (req, res) => {
  try {
    const { from, to, year, month } = req.query;
    
    console.log('getMonthlyPrices called with:', { from, to, year, month });

    // Validate required fields
    if (!from || !to || !year || !month) {
      console.warn('Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: from, to, year, month'
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

    // Calculate date range for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0); // Last day of month
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${endDate.getDate()}`;

    console.log(`📅 Date range: ${startDate} to ${endDateStr}`);

    // Query to find minimum price for each date in the month
    // Use DISTINCT ON to get one row per date with the lowest price
    const monthlyQuery = `
      SELECT DISTINCT ON (fp.flight_date)
        fp.flight_date,
        MIN(fp.price) OVER (PARTITION BY fp.flight_date) as min_price,
        FIRST_VALUE(fp.currency) OVER (PARTITION BY fp.flight_date ORDER BY fp.price) as currency,
        TO_CHAR(fp.flight_date, 'YYYY-MM-DD') as date_string
      FROM flight_prices fp
      INNER JOIN flight_schedules fs ON fp.schedule_id = fs.schedule_id
      INNER JOIN airlines al ON fs.airline_id = al.airline_id
      WHERE fs.departure_airport_id = $1
        AND fs.arrival_airport_id = $2
        AND fp.flight_date >= $3::date
        AND fp.flight_date <= $4::date
        AND fs.is_active = true
        AND al.is_active = true
      ORDER BY fp.flight_date ASC
    `;

    const result = await db.query(monthlyQuery, [dep_id, arr_id, startDate, endDateStr]);
    console.log(`✅ Found prices for ${result.rows.length} days in the month`);

    if (result.rows.length === 0) {
      console.log('⚠️ No flight prices found for this route/month');
    }

    const monthlyPrices = result.rows.map(row => ({
      date: row.date_string,
      minPrice: parseFloat(row.min_price),
      currency: row.currency || 'VND'
    }));

    res.json({
      success: true,
      data: monthlyPrices,
      searchParams: {
        from,
        to,
        year: parseInt(year),
        month: parseInt(month),
        dateRange: {
          start: startDate,
          end: endDateStr
        }
      }
    });

  } catch (error) {
    console.error('Error fetching monthly prices:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error fetching monthly prices',
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

/**
 * Get flight price history
 */
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
      currency: row.currency || 'VND'
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

