/**
 * Check if database has flight price data
 * Run: node check-database-data.js
 */

require('dotenv').config();
const db = require('./src/config/database');

async function checkDatabaseData() {
  console.log('🔍 Checking Database for Flight Data\n');

  try {
    // Check airports
    const airportsQuery = 'SELECT COUNT(*) as count FROM airports';
    const airportsResult = await db.query(airportsQuery);
    console.log(`✈️  Airports: ${airportsResult.rows[0].count} records`);

    // Check airlines
    const airlinesQuery = 'SELECT COUNT(*) as count FROM airlines';
    const airlinesResult = await db.query(airlinesQuery);
    console.log(`🏢 Airlines: ${airlinesResult.rows[0].count} records`);

    // Check flight schedules
    const schedulesQuery = 'SELECT COUNT(*) as count FROM flight_schedules';
    const schedulesResult = await db.query(schedulesQuery);
    console.log(`📅 Flight Schedules: ${schedulesResult.rows[0].count} records`);

    // Check flight prices
    const pricesQuery = 'SELECT COUNT(*) as count FROM flight_prices';
    const pricesResult = await db.query(pricesQuery);
    console.log(`💰 Flight Prices: ${pricesResult.rows[0].count} records`);

    // Check date range of prices
    if (pricesResult.rows[0].count > 0) {
      const dateRangeQuery = `
        SELECT 
          MIN(flight_date) as earliest_date,
          MAX(flight_date) as latest_date,
          COUNT(DISTINCT flight_date) as unique_dates
        FROM flight_prices
      `;
      const dateRangeResult = await db.query(dateRangeQuery);
      const range = dateRangeResult.rows[0];
      console.log(`\n📊 Price Data Range:`);
      console.log(`   Earliest: ${range.earliest_date}`);
      console.log(`   Latest: ${range.latest_date}`);
      console.log(`   Unique dates: ${range.unique_dates}`);

      // Check sample routes
      const routesQuery = `
        SELECT 
          dep.airport_code as from_code,
          arr.airport_code as to_code,
          COUNT(*) as price_records
        FROM flight_prices fp
        JOIN flight_schedules fs ON fp.schedule_id = fs.schedule_id
        JOIN airports dep ON fs.departure_airport_id = dep.airport_id
        JOIN airports arr ON fs.arrival_airport_id = arr.airport_id
        GROUP BY dep.airport_code, arr.airport_code
        ORDER BY price_records DESC
        LIMIT 5
      `;
      const routesResult = await db.query(routesQuery);
      console.log(`\n🛫 Top Routes with Price Data:`);
      routesResult.rows.forEach((route, idx) => {
        console.log(`   ${idx + 1}. ${route.from_code} → ${route.to_code}: ${route.price_records} prices`);
      });
    } else {
      console.log('\n⚠️  WARNING: No flight price data in database!');
      console.log('   You need to crawl flight data first.');
      console.log('   Run the crawler to populate the database with flight prices.');
    }

    console.log('\n✅ Database check completed!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkDatabaseData();

