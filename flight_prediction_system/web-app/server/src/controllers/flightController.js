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
        fp.price_id
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

    const flightResult = await db.query(flightQuery, [dep_id, arr_id, departDate]);

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
        lastChecked: row.checked_at
      });
    });

    const flights = Array.from(flightsMap.values());

    // Sort by price (lowest first)
    flights.sort((a, b) => {
      const minPriceA = Math.min(...a.classes.map(c => c.price));
      const minPriceB = Math.min(...b.classes.map(c => c.price));
      return minPriceA - minPriceB;
    });

    res.json({
      success: true,
      data: {
        flights,
        count: flights.length,
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

