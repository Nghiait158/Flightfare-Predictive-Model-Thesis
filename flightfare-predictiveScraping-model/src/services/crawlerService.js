// -- -----------Main crawler service----------

import { delay, DELAY_MEDIUM, DELAY_LONG } from '../constants/constants.js';

import { 
    gotoPage, 
    handleCookiePopups, 
    takeScreenshot, 
    setupBrowserLogging,
    validatePageLoad 
} from '../utils/browserUtils.js';

import { crawlVietjet } from '../handlers/vietjetHandler.js';

const siteHandlers = {
    'vietjet': crawlVietjet,
    // 'bamboo': crawlBamboo, // Add new handlers here
};

// const vietjet_URL = 'https://www.vietjetair.com/vi/pages/bao-hiem-du-lich-sky-care-1681121104781';
const vietjet_URL = 'https://www.vietjetair.com/vi';
const vietnamairlines_URL = 'https://www.vietnamairlines.com/vn/en';

// call from main.js
export async function runCrawler(page, config) {
    const handler = siteHandlers[config.id];
    if (!handler) {
        throw new Error(`No handler found for site ID: '${config.id}'`);
    }

    // Delegate the entire crawling process to the specific handler
    try {
        const result = await handler(page, {
            ...config,
            airports: config.airports, // Make sure airports are passed down
            flightConfig: config.search_options, // Pass search_options as flightConfig for compatibility
            baseUrl: config.baseUrl
        });
        return result;
    } catch (error) {
        console.error(`\n❌ Unhandled error in ${config.id} handler: ${error.message}`);
        console.error(`⚙️ Stack trace: ${error.stack}`);
        
        // Try to take a final screenshot on error
        try {
            const errorScreenshotPath = await takeScreenshot(page, `critical-error-${config.id}`);
            console.error(`📸 Error screenshot saved to ${errorScreenshotPath}`);
        } catch (screenshotError) {
            console.error(`📸 Could not take error screenshot: ${screenshotError.message}`);
        }
        
        // Re-throw the error to be caught by the retry logic
        throw error;
    }
}

// -----------------------Runs crawler with retry logic --------------------

export async function runCrawlerWithRetry(page, config, options = {}) {
    const { maxRetries = 2, retryDelay = 5000 } = options;
    
    let lastError;
    let attempt = 0;

    while (attempt <= maxRetries) {
        try {
            // Nếu lần thứ 2 retry:
            if (attempt > 0) {
                console.log(`\nRetry attempt ${attempt}/${maxRetries} for site '${config.id}'`);
                console.log('================================');
                await delay(retryDelay);
            }

            const result = await runCrawler(page, config);
            
            if (result.success) {
                if (attempt > 0) {
                    console.log(`✅ Crawler for '${config.id}' succeeded on attempt ${attempt + 1}`);
                }
                return result;
            } else {
                // This block might not be reached if handlers always throw errors on failure
                lastError = new Error(result.error || `Crawler for '${config.id}' failed without specific error`);
            }

        } catch (error) {
            lastError = error;
            console.error(`❌ Attempt ${attempt + 1} for '${config.id}' failed: ${error.message}`);
        }

        attempt++;
    }

    console.error(`❌ All ${maxRetries + 1} attempts for '${config.id}' failed. Last error: ${lastError.message}`);
    throw lastError;
}

// Xác thực các sân bay, điều kiện cho các sân bay
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

    console.log('Crawler configuration validated');
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