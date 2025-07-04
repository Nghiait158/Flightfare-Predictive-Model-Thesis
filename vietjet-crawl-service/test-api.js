#!/usr/bin/env node

/**
 * Simple API Test Script for VietJet Crawl Service
 * Usage: node test-api.js [port]
 */

const BASE_URL = process.argv[2] ? `http://localhost:${process.argv[2]}` : 'http://localhost:3001';

console.log('🧪 VietJet Crawl API Test Script');
console.log('===============================');
console.log(`Testing API at: ${BASE_URL}`);
console.log('');

/**
 * Test health endpoint
 */
async function testHealth() {
    console.log('🏥 Testing Health Endpoint...');
    
    try {
        const response = await fetch(`${BASE_URL}/health`);
        const data = await response.json();
        
        if (response.ok && data.status === 'OK') {
            console.log('✅ Health check passed');
            console.log(`   Status: ${data.status}`);
            console.log(`   Service: ${data.service}`);
            return true;
        } else {
            console.log('❌ Health check failed');
            console.log(`   Status: ${response.status}`);
            console.log(`   Response: ${JSON.stringify(data, null, 2)}`);
            return false;
        }
    } catch (error) {
        console.log('❌ Health check error');
        console.log(`   Error: ${error.message}`);
        return false;
    }
}

/**
 * Test config endpoint
 */
async function testConfig() {
    console.log('\n📋 Testing Config Endpoint...');
    
    try {
        const response = await fetch(`${BASE_URL}/api/v1/config/flight`);
        const data = await response.json();
        
        if (response.ok && data.success) {
            console.log('✅ Config endpoint working');
            console.log(`   Config: ${JSON.stringify(data.data, null, 2)}`);
            return true;
        } else {
            console.log('❌ Config endpoint failed');
            console.log(`   Status: ${response.status}`);
            console.log(`   Response: ${JSON.stringify(data, null, 2)}`);
            return false;
        }
    } catch (error) {
        console.log('❌ Config endpoint error');
        console.log(`   Error: ${error.message}`);
        return false;
    }
}

/**
 * Test crawl endpoint (dry run - validation only)
 */
async function testCrawlValidation() {
    console.log('\n🔍 Testing Crawl Endpoint Validation...');
    
    // Test with missing parameters
    console.log('  • Testing missing parameters...');
    try {
        const response = await fetch(`${BASE_URL}/api/v1/crawl/vietjet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        
        const data = await response.json();
        
        if (response.status === 400 && !data.success) {
            console.log('    ✅ Missing parameters validation working');
        } else {
            console.log('    ❌ Missing parameters validation failed');
            console.log(`    Response: ${JSON.stringify(data, null, 2)}`);
            return false;
        }
    } catch (error) {
        console.log('    ❌ Validation test error');
        console.log(`    Error: ${error.message}`);
        return false;
    }
    
    // Test with valid parameters (but don't actually run crawl)
    console.log('  • Testing valid parameters format...');
    try {
        const testPayload = {
            departure_airport: "SGN",
            arrival_airport: "HAN",
            departure_date: "15/02/2025",
            trip_type: "oneway",
            use_retry: false,
            clear_screenshots: false
        };
        
        console.log('    📤 Sending test payload:');
        console.log(`    ${JSON.stringify(testPayload, null, 6)}`);
        console.log('    ⚠️  Note: This will perform actual crawling. Cancel (Ctrl+C) if not desired.');
        console.log('    ⏳ Waiting 5 seconds before sending request...');
        
        // Give user time to cancel if they don't want to run actual crawl
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('    🚀 Sending crawl request...');
        const response = await fetch(`${BASE_URL}/api/v1/crawl/vietjet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testPayload)
        });
        
        const data = await response.json();
        
        console.log(`    📨 Response Status: ${response.status}`);
        console.log(`    📊 Response Success: ${data.success}`);
        console.log(`    📝 Response Message: ${data.message || 'N/A'}`);
        
        if (data.data && data.data.execution_stats) {
            console.log(`    ⏱️  Execution Time: ${data.data.execution_stats.execution_time_formatted}`);
            console.log(`    📈 Steps Completed: ${data.data.execution_stats.steps_completed}`);
            console.log(`    📸 Screenshots: ${data.data.execution_stats.screenshots_taken}`);
        }
        
        if (data.success) {
            console.log('    ✅ Full crawl test completed successfully');
            if (data.data.results) {
                console.log(`    📊 Results obtained: ${data.data.results.total_flights || 'N/A'} flights`);
            }
        } else {
            console.log('    ⚠️  Crawl completed with issues');
            if (data.error) {
                console.log(`    ❌ Error: ${data.error}`);
            }
        }
        
        return true;
        
    } catch (error) {
        console.log('    ❌ Crawl test error');
        console.log(`    Error: ${error.message}`);
        return false;
    }
}

/**
 * Test 404 endpoint
 */
async function test404() {
    console.log('\n🔗 Testing 404 Handler...');
    
    try {
        const response = await fetch(`${BASE_URL}/nonexistent-endpoint`);
        const data = await response.json();
        
        if (response.status === 404 && !data.success) {
            console.log('✅ 404 handler working');
            console.log(`   Available endpoints listed: ${Object.keys(data.available_endpoints || {}).length}`);
            return true;
        } else {
            console.log('❌ 404 handler failed');
            console.log(`   Status: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.log('❌ 404 test error');
        console.log(`   Error: ${error.message}`);
        return false;
    }
}

/**
 * Main test runner
 */
async function runTests() {
    let passedTests = 0;
    let totalTests = 0;
    
    const tests = [
        { name: 'Health Check', fn: testHealth },
        { name: 'Config Endpoint', fn: testConfig },
        { name: '404 Handler', fn: test404 },
        { name: 'Crawl Validation & Full Test', fn: testCrawlValidation }
    ];
    
    for (const test of tests) {
        totalTests++;
        const passed = await test.fn();
        if (passed) passedTests++;
    }
    
    console.log('\n📊 Test Results Summary');
    console.log('======================');
    console.log(`✅ Tests passed: ${passedTests}/${totalTests}`);
    console.log(`❌ Tests failed: ${totalTests - passedTests}/${totalTests}`);
    console.log(`📈 Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (passedTests === totalTests) {
        console.log('\n🎉 All tests passed! API is working correctly.');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some tests failed. Please check the API server.');
        process.exit(1);
    }
}

// Handle process interruption
process.on('SIGINT', () => {
    console.log('\n\n🛑 Test interrupted by user.');
    console.log('💡 To test without running actual crawl, modify the script to skip the crawl test.');
    process.exit(0);
});

// Instructions
console.log('📖 Test Instructions:');
console.log('   • This script will test all API endpoints');
console.log('   • The crawl test will perform actual web crawling');
console.log('   • Press Ctrl+C to cancel during the 5-second countdown');
console.log('   • Make sure the API server is running before testing');
console.log('');

// Run tests
runTests().catch(error => {
    console.error('💥 Test runner error:', error);
    process.exit(1);
}); 