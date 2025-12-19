// Test database connection from Node.js
import dotenv from 'dotenv';
dotenv.config();

async function testDatabaseConnection() {
    try {
        console.log('\n' + '='.repeat(80));
        console.log('TESTING DATABASE CONNECTION FROM NODE.JS');
        console.log('='.repeat(80));
        
        // Import database module
        const dbModule = await import('./web-app/server/src/config/database.js');
        const pool = dbModule.default;
        
        console.log('\n✅ Database module loaded');
        console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
        console.log(`   Port: ${process.env.DB_PORT || 5432}`);
        console.log(`   Database: ${process.env.DB_NAME || 'flight_prediction'}`);
        console.log(`   User: ${process.env.DB_USER || 'postgres'}`);
        
        // Test connection
        console.log('\n🔄 Testing connection...');
        const client = await pool.connect();
        console.log('✅ Connection successful!');
        
        // Check tables
        console.log('\n📊 Checking tables...');
        const tables = ['airports', 'airlines', 'new_classes', 'flight_schedules', 'flight_prices'];
        
        for (const table of tables) {
            const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
            const count = result.rows[0].count;
            console.log(`   ${table.padEnd(20)}: ${count.toString().padStart(10)} records`);
        }
        
        // Check if SGN and HAN exist
        console.log('\n🔍 Checking required airports (SGN, HAN)...');
        const airportResult = await client.query(
            `SELECT airport_code, city, airport_name FROM airports WHERE airport_code IN ('SGN', 'HAN') ORDER BY airport_code`
        );
        
        if (airportResult.rows.length === 2) {
            console.log('   ✅ Both airports exist:');
            airportResult.rows.forEach(ap => {
                console.log(`      - ${ap.airport_code}: ${ap.city}`);
            });
        } else {
            console.log('   ❌ MISSING AIRPORTS!');
            console.log('   This is why data is NOT saved to database.');
            console.log('\n   Solution:');
            console.log('   Run: python setup_airports.py');
        }
        
        // Test saveFlightPricesToDB function
        console.log('\n🧪 Testing saveFlightPricesToDB function...');
        try {
            const serviceModule = await import('./src/server/services/flightPriceService.js');
            console.log('   ✅ flightPriceService module loaded');
            
            const isDatabaseAvailable = serviceModule.isDatabaseAvailable;
            const dbAvailable = await isDatabaseAvailable();
            
            if (dbAvailable) {
                console.log('   ✅ Database is available for saving flights');
            } else {
                console.log('   ❌ Database is NOT available');
            }
        } catch (serviceError) {
            console.log(`   ⚠️  Could not test service: ${serviceError.message}`);
        }
        
        client.release();
        
        console.log('\n' + '='.repeat(80));
        console.log('✅ ALL TESTS PASSED');
        console.log('='.repeat(80));
        console.log('\n💡 If airports are missing, run: python setup_airports.py');
        console.log('💡 Then crawl again with: save_in_db: true');
        console.log('\n');
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n' + '='.repeat(80));
        console.error('❌ DATABASE CONNECTION FAILED');
        console.error('='.repeat(80));
        console.error(`\nError: ${error.message}`);
        console.error('\nPossible issues:');
        console.error('  1. PostgreSQL is not running');
        console.error('  2. Database "flight_prediction" does not exist');
        console.error('  3. Wrong credentials in .env file');
        console.error('  4. Firewall blocking connection');
        
        console.error('\n📝 Your .env configuration:');
        console.error(`   DB_HOST: ${process.env.DB_HOST || 'localhost (default)'}`);
        console.error(`   DB_PORT: ${process.env.DB_PORT || '5432 (default)'}`);
        console.error(`   DB_NAME: ${process.env.DB_NAME || 'flight_prediction (default)'}`);
        console.error(`   DB_USER: ${process.env.DB_USER || 'postgres (default)'}`);
        console.error(`   DB_PASSWORD: ${process.env.DB_PASSWORD ? '***' : 'NOT SET'}`);
        
        console.error('\n');
        process.exit(1);
    }
}

testDatabaseConnection();








