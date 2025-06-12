/**
 * @fileoverview Main crawler service - Orchestrates the complete crawling workflow
 */

import { delay, DELAY_MEDIUM, DELAY_LONG } from '../constants/constants.js';
import { 
    gotoPage, 
    handleCookiePopups, 
    takeScreenshot, 
    setupBrowserLogging,
    validatePageLoad 
} from '../utils/browserUtils.js';
import { 
    selectDepartureAirport,
    selectArrivalAirport,
    selectFlightDate,
    submitSearchForm,
    getFlightResults,
    performFlightSearch
} from '../services/flightService.js';

/**
 * @typedef {Object} CrawlerConfig
 * @property {Object} flightConfig - Flight configuration object
 * @property {string} flightConfig.departure_airport - Departure airport code
 * @property {string} flightConfig.arrival_airport - Arrival airport code
 * @property {Object} flightConfig.search_options - Search options
 * @property {Array} airports - Array of available airports
 */

/**
 * @typedef {Object} CrawlerResult
 * @property {boolean} success - Whether the crawling was successful
 * @property {string} route - Flight route (departure → arrival)
 * @property {number} duration - Total execution time in milliseconds
 * @property {Object} results - Flight search results
 * @property {Array<string>} screenshots - List of screenshot paths taken
 * @property {Array<string>} steps - List of completed steps
 * @property {string} [error] - Error message if failed
 * @property {Object} metadata - Additional metadata about the crawl
 */

const VIETJET_URL = 'https://www.vietjetair.com/vi/pages/bao-hiem-du-lich-sky-care-1681121104781';

/**
 * Main crawler orchestration function
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {CrawlerConfig} config - Crawler configuration
 * @returns {Promise<CrawlerResult>} Complete crawling result
 */
export async function runCrawler(page, { flightConfig, airports }) {
    const startTime = Date.now();
    const screenshots = [];
    const steps = [];
    
    const result = {
        success: false,
        route: `${flightConfig.departure_airport} → ${flightConfig.arrival_airport}`,
        duration: 0,
        results: null,
        screenshots: [],
        steps: [],
        error: null,
        metadata: {
            startTime: new Date().toISOString(),
            url: VIETJET_URL,
            userAgent: await page.evaluate(() => navigator.userAgent),
            viewport: await page.viewport()
        }
    };

    try {
        console.log('🚀 Starting VietJet Flight Crawler');
        console.log('==================================');
        console.log(`📍 Route: ${result.route}`);
        console.log(`⏰ Start time: ${result.metadata.startTime}`);
        console.log(`🌐 Target URL: ${VIETJET_URL}\n`);

        // Step 1: Setup browser logging
        console.log('📋 Step 1: Setting up browser logging...');
        setupBrowserLogging(page);
        steps.push('Browser logging configured');
        console.log('✅ Browser logging configured\n');

        // Step 2: Navigate to VietJet page
        console.log('📋 Step 2: Navigating to VietJet website...');
        await gotoPage(page, VIETJET_URL, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        // Validate page load
        const pageValid = await validatePageLoad(page);
        if (!pageValid) {
            throw new Error('Page failed to load properly');
        }
        
        steps.push('Navigation completed');
        console.log('✅ Successfully navigated to VietJet\n');

        // Step 3: Take initial screenshot
        console.log('📋 Step 3: Taking initial screenshot...');
        const initialScreenshot = await takeScreenshot(page, 'crawler-initial-page');
        screenshots.push(initialScreenshot);
        steps.push('Initial screenshot captured');
        console.log('✅ Initial screenshot captured\n');

        // Step 4: Handle cookie popups
        console.log('📋 Step 4: Handling cookie popups and consent dialogs...');
        const cookieResult = await handleCookiePopups(page, 'Main crawler: ');
        
        if (cookieResult.firstButton || cookieResult.cookieButton) {
            console.log('✅ Cookie popups handled successfully');
            await delay(DELAY_MEDIUM);
            
            // Take screenshot after cookie handling
            const cookieScreenshot = await takeScreenshot(page, 'crawler-after-cookies');
            screenshots.push(cookieScreenshot);
        } else {
            console.log('ℹ️ No cookie popups found');
        }
        
        steps.push('Cookie handling completed');
        console.log('');

        // Step 5: Get airport information
        console.log('📋 Step 5: Resolving airport information...');
        const departureAirport = airports.find(ap => ap.code === flightConfig.departure_airport);
        const arrivalAirport = airports.find(ap => ap.code === flightConfig.arrival_airport);

        if (!departureAirport) {
            throw new Error(`Departure airport '${flightConfig.departure_airport}' not found in airports database`);
        }

        if (!arrivalAirport) {
            throw new Error(`Arrival airport '${flightConfig.arrival_airport}' not found in airports database`);
        }

        console.log(`✅ Departure: ${departureAirport.city} (${departureAirport.code}) - ${departureAirport.airport_name}`);
        console.log(`✅ Arrival: ${arrivalAirport.city} (${arrivalAirport.code}) - ${arrivalAirport.airport_name}`);
        steps.push('Airport information resolved');
        console.log('');

        // Step 6: Execute flight search workflow
        console.log('📋 Step 6: Executing flight search workflow...');
        console.log('⚡ Running complete flight search automation...\n');
        
        const searchResult = await performFlightSearch(
            page, 
            departureAirport, 
            arrivalAirport, 
            flightConfig.search_options
        );

        if (!searchResult.success) {
            throw new Error(`Flight search failed: ${searchResult.error}`);
        }

        console.log('✅ Flight search workflow completed successfully');
        steps.push('Flight search workflow executed');
        result.results = searchResult.results;
        console.log('');

        // Step 7: Take final screenshot
        console.log('📋 Step 7: Taking final results screenshot...');
        const finalScreenshot = await takeScreenshot(page, 'crawler-final-results');
        screenshots.push(finalScreenshot);
        steps.push('Final screenshot captured');
        console.log('✅ Final results screenshot captured\n');

        // Step 8: Process and validate results
        console.log('📋 Step 8: Processing and validating results...');
        
        if (result.results) {
            console.log('📊 Results Summary:');
            console.log(`   • Source: ${result.results.source || 'Unknown'}`);
            console.log(`   • Timestamp: ${result.results.timestamp || 'N/A'}`);
            
            if (result.results.total_flights !== undefined) {
                console.log(`   • Total flights found: ${result.results.total_flights}`);
            }
            
            if (result.results.url) {
                console.log(`   • Results URL: ${result.results.url}`);
            }
            
            steps.push('Results processed and validated');
        } else {
            console.log('⚠️ No flight results obtained, but search workflow completed');
            steps.push('Results processing completed (no data)');
        }

        // Calculate final metrics
        const endTime = Date.now();
        result.duration = endTime - startTime;
        result.success = true;
        result.screenshots = screenshots;
        result.steps = steps;

        console.log('\n🎉 Crawler execution completed successfully!');
        console.log('==========================================');
        console.log(`⏱️ Total duration: ${(result.duration / 1000).toFixed(2)} seconds`);
        console.log(`📸 Screenshots taken: ${screenshots.length}`);
        console.log(`✅ Steps completed: ${steps.length}`);
        console.log(`📊 Results: ${result.results ? 'Available' : 'None'}`);

        return result;

    } catch (error) {
        console.error('\n❌ Crawler execution failed!');
        console.error('===============================');
        console.error(`🔥 Error: ${error.message}`);
        console.error(`⏱️ Failed after: ${((Date.now() - startTime) / 1000).toFixed(2)} seconds`);
        console.error(`✅ Steps completed: ${steps.length}`);

        // Take error screenshot
        try {
            const errorScreenshot = await takeScreenshot(page, 'crawler-error');
            screenshots.push(errorScreenshot);
            console.error(`📸 Error screenshot: ${errorScreenshot}`);
        } catch (screenshotError) {
            console.error(`📸 Failed to take error screenshot: ${screenshotError.message}`);
        }

        // Update result with error information
        result.success = false;
        result.error = error.message;
        result.duration = Date.now() - startTime;
        result.screenshots = screenshots;
        result.steps = steps;
        result.metadata.errorTime = new Date().toISOString();
        result.metadata.errorStack = error.stack;

        return result;
    }
}

/**
 * Runs crawler with retry logic for robustness
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {CrawlerConfig} config - Crawler configuration
 * @param {Object} [options] - Retry options
 * @param {number} [options.maxRetries=2] - Maximum number of retries
 * @param {number} [options.retryDelay=5000] - Delay between retries in milliseconds
 * @returns {Promise<CrawlerResult>} Complete crawling result
 */
export async function runCrawlerWithRetry(page, config, options = {}) {
    const { maxRetries = 2, retryDelay = 5000 } = options;
    
    let lastError;
    let attempt = 0;

    while (attempt <= maxRetries) {
        try {
            if (attempt > 0) {
                console.log(`\n🔄 Retry attempt ${attempt}/${maxRetries}`);
                console.log('================================');
                await delay(retryDelay);
            }

            const result = await runCrawler(page, config);
            
            if (result.success) {
                if (attempt > 0) {
                    console.log(`✅ Crawler succeeded on attempt ${attempt + 1}`);
                }
                return result;
            } else {
                lastError = new Error(result.error || 'Crawler failed without specific error');
            }

        } catch (error) {
            lastError = error;
            console.error(`❌ Attempt ${attempt + 1} failed: ${error.message}`);
        }

        attempt++;
    }

    console.error(`❌ All ${maxRetries + 1} attempts failed. Last error: ${lastError.message}`);
    throw lastError;
}

/**
 * Validates crawler configuration before execution
 * @param {CrawlerConfig} config - Configuration to validate
 * @throws {Error} If configuration is invalid
 */
export function validateCrawlerConfig(config) {
    if (!config) {
        throw new Error('Crawler configuration is required');
    }

    if (!config.flightConfig) {
        throw new Error('Flight configuration is required');
    }

    if (!config.airports || !Array.isArray(config.airports)) {
        throw new Error('Airports array is required');
    }

    const { flightConfig, airports } = config;

    if (!flightConfig.departure_airport || !flightConfig.arrival_airport) {
        throw new Error('Both departure and arrival airports are required');
    }

    const departureExists = airports.some(ap => ap.code === flightConfig.departure_airport);
    const arrivalExists = airports.some(ap => ap.code === flightConfig.arrival_airport);

    if (!departureExists) {
        throw new Error(`Departure airport '${flightConfig.departure_airport}' not found in airports database`);
    }

    if (!arrivalExists) {
        throw new Error(`Arrival airport '${flightConfig.arrival_airport}' not found in airports database`);
    }

    if (flightConfig.departure_airport === flightConfig.arrival_airport) {
        throw new Error('Departure and arrival airports cannot be the same');
    }

    console.log('✅ Crawler configuration validated successfully');
}

/**
 * Gets crawler execution statistics
 * @param {CrawlerResult} result - Crawler result to analyze
 * @returns {Object} Execution statistics
 */
export function getCrawlerStats(result) {
    return {
        executionTime: result.duration,
        executionTimeFormatted: `${(result.duration / 1000).toFixed(2)}s`,
        success: result.success,
        stepsCompleted: result.steps.length,
        screenshotsTaken: result.screenshots.length,
        hasResults: !!result.results,
        route: result.route,
        startTime: result.metadata?.startTime,
        endTime: result.metadata?.errorTime || new Date(Date.parse(result.metadata?.startTime) + result.duration).toISOString()
    };
} 