/**
 * Test script for cheapest tickets endpoint
 * Run: node test-cheapest-endpoint.js
 */

const API_URL = 'http://localhost:3003/api';

async function testCheapestTickets() {
  console.log('🧪 Testing Cheapest Tickets Endpoint\n');
  
  const testCases = [
    { from: 'SGN', to: 'HAN', name: 'Ho Chi Minh City → Hanoi' },
    { from: 'HAN', to: 'SGN', name: 'Hanoi → Ho Chi Minh City' },
    { from: 'DLI', to: 'SGN', name: 'Da Lat → Ho Chi Minh City' },
    { from: 'DLI', to: 'HAN', name: 'Da Lat → Hanoi' },
    { from: 'SGN', to: 'PQC', name: 'Ho Chi Minh City → Phu Quoc' }
  ];

  for (const testCase of testCases) {
    try {
      console.log(`\n📍 Testing: ${testCase.name}`);
      console.log(`   Route: ${testCase.from} → ${testCase.to}`);
      
      const url = `${API_URL}/flights/cheapest?from=${testCase.from}&to=${testCase.to}&daysAhead=90&limit=5`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.log(`   ❌ HTTP Error ${response.status}: ${response.statusText}`);
        continue;
      }
      
      const data = await response.json();

      if (data.success) {
        const flights = data.data.flights;
        console.log(`   ✅ Success! Found ${flights.length} flights`);
        
        if (flights.length > 0) {
          console.log('   💰 Top 3 cheapest:');
          flights.slice(0, 3).forEach((flight, idx) => {
            const price = flight.currency === 'VND' 
              ? `${Math.floor(flight.price / 1000)}k VND`
              : `$${Math.round(flight.price)}`;
            console.log(`      ${idx + 1}. ${price} - ${flight.date} (${flight.time})`);
          });
        } else {
          console.log('   ⚠️  No flights found in database for this route');
        }
      } else {
        console.log('   ❌ Failed:', data.message);
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('   ❌ Connection refused. Is the backend running on port 3003?');
      } else {
        console.log('   ❌ Error:', error.message);
      }
    }
  }

  console.log('\n✨ Test completed!\n');
}

// Run the test
testCheapestTickets().catch(console.error);

