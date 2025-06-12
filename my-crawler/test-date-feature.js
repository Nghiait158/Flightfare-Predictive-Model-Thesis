/**
 * @fileoverview Test file for new date selection features
 * Tests specific date selection and round trip functionality
 */

import { launchBrowser, closeBrowser, takeScreenshot } from './src/utils/browserUtils.js';
import { loadFlightConfig } from './src/config/loadConfig.js';
import { runCrawler } from './src/services/crawlerService.js';

/**
 * Test specific date selection and round trip
 */
async function testDateFeatures() {
    let browser = null;
    let page = null;

    try {
        console.log('🧪 Testing New Date Selection Features');
        console.log('=====================================\n');

        // Launch browser
        const browserResult = await launchBrowser();
        browser = browserResult.browser;
        page = browserResult.page;

        console.log('✅ Browser launched successfully\n');

        // Test 1: One-way trip with specific date
        console.log('🧪 Test 1: One-way trip with specific date (15/06/2025)');
        console.log('-------------------------------------------------------');
        
        const config1 = {
            flightConfig: {
                departure_airport: "SGN",
                arrival_airport: "HAN",
                search_options: {
                    trip_type: "oneway",
                    departure_date: "15/06/2025",
                    find_cheapest: true
                }
            }
        };

        // Load airports
        const fullConfig = await loadFlightConfig();
        config1.airports = fullConfig.airports;

        const result1 = await runCrawler(page, config1);
        
        if (result1.success) {
            console.log('✅ Test 1 PASSED: One-way specific date');
        } else {
            console.log('❌ Test 1 FAILED:', result1.error);
        }

        console.log('\n' + '='.repeat(60) + '\n');

        // Test 2: Round trip with specific dates
        console.log('🧪 Test 2: Round trip with specific dates');
        console.log('----------------------------------------');
        
        const config2 = {
            flightConfig: {
                departure_airport: "SGN",
                arrival_airport: "DAD",
                search_options: {
                    trip_type: "roundtrip",
                    departure_date: "20/06/2025",
                    return_date: "25/06/2025",
                    find_cheapest: true
                }
            },
            airports: fullConfig.airports
        };

        // Navigate to fresh page for second test
        await page.goto('about:blank');
        
        const result2 = await runCrawler(page, config2);
        
        if (result2.success) {
            console.log('✅ Test 2 PASSED: Round trip specific dates');
        } else {
            console.log('❌ Test 2 FAILED:', result2.error);
        }

        console.log('\n' + '='.repeat(60) + '\n');

        // Test 3: One-way trip with "today" (backward compatibility)
        console.log('🧪 Test 3: One-way trip with "today" (backward compatibility)');
        console.log('------------------------------------------------------------');
        
        const config3 = {
            flightConfig: {
                departure_airport: "SGN",
                arrival_airport: "TBB",
                search_options: {
                    trip_type: "oneway",
                    departure_date: "today",
                    find_cheapest: true
                }
            },
            airports: fullConfig.airports
        };

        // Navigate to fresh page for third test
        await page.goto('about:blank');
        
        const result3 = await runCrawler(page, config3);
        
        if (result3.success) {
            console.log('✅ Test 3 PASSED: "Today" date selection');
        } else {
            console.log('❌ Test 3 FAILED:', result3.error);
        }

        // Summary
        console.log('\n🏁 Test Summary');
        console.log('===============');
        console.log(`Test 1 (Specific date): ${result1.success ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Test 2 (Round trip): ${result2.success ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Test 3 (Today compatibility): ${result3.success ? '✅ PASS' : '❌ FAIL'}`);

        const passedTests = [result1.success, result2.success, result3.success].filter(Boolean).length;
        console.log(`\n📊 Overall: ${passedTests}/3 tests passed`);

        if (passedTests === 3) {
            console.log('🎉 ALL TESTS PASSED! New date features working correctly.');
        } else {
            console.log('⚠️ Some tests failed. Check implementation.');
        }

    } catch (error) {
        console.error('💥 Test execution failed:', error);
    } finally {
        if (browser) {
            await closeBrowser(browser);
            console.log('\n✅ Browser closed successfully');
        }
    }
}

// Run the tests
testDateFeatures().catch(console.error); 