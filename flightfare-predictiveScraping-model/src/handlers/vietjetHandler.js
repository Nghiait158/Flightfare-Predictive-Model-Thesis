import { delay, DELAY_MEDIUM } from '../constants/constants.js';
import { 
    gotoPage, 
    handleCookiePopups, 
    takeScreenshot, 
    setupBrowserLogging,
    validatePageLoad 
} from '../utils/browserUtils.js';
import { 
    performFlightSearch_VietJet
} from '../services/flightService_VietJet.js';

/**
 * Handles the entire crawling process for VietJet Air.
 * @param {import('puppeteer').Page} page The Puppeteer page instance.
 * @param {object} config The configuration object for this specific target.
 * @returns {Promise<object>} A promise that resolves to the crawling result object.
 */
export async function crawlVietjet(page, config) {
    const { flightConfig, airports, baseUrl } = config;
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
            url: baseUrl,
            userAgent: await page.evaluate(() => navigator.userAgent),
            viewport: await page.viewport()
        }
    };

    console.log(`\nNavigating to target website: ${baseUrl}`);
    await gotoPage(page, baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    const pageValid = await validatePageLoad(page);
    if (!pageValid) {
        throw new Error('Page failed to load properly');
    }
    steps.push('Navigation completed');
    
    screenshots.push(await takeScreenshot(page, `vietjet-initial-page`));
    steps.push('Initial screenshot captured');

    console.log('Handling cookie popups...');
    const cookieResult = await handleCookiePopups(page, 'Vietjet handler: ');
    if (cookieResult.firstButton || cookieResult.cookieButton) {
        await delay(DELAY_MEDIUM);
        screenshots.push(await takeScreenshot(page, 'vietjet-after-cookies'));
    }
    steps.push('Cookie handling completed');

    const departureAirport = airports.find(ap => ap.code === flightConfig.departure_airport);
    const arrivalAirport = airports.find(ap => ap.code === flightConfig.arrival_airport);

    if (!departureAirport || !arrivalAirport) {
        throw new Error(`Airport not found for route: ${flightConfig.departure_airport} -> ${flightConfig.arrival_airport}`);
    }

    console.log(`✅ Route: ${departureAirport.city} (${departureAirport.code}) → ${arrivalAirport.city} (${arrivalAirport.code})`);
    steps.push('Airport information resolved');

    const searchResult = await performFlightSearch_VietJet(
        page, 
        departureAirport, 
        arrivalAirport, 
        flightConfig
    );

    if (!searchResult.success) {
        throw new Error(`Flight search failed: ${searchResult.error}`);
    }

    steps.push('Flight search workflow executed');
    result.results = searchResult.results;

    screenshots.push(await takeScreenshot(page, 'vietjet-final-results'));
    steps.push('Final screenshot captured');
    
    if (result.results) {
        console.log(`📊 Results found: ${result.results.total_flights} flights.`);
    } else {
        console.log('⚠️ No flight results obtained.');
    }
    steps.push('Results processed');

    result.duration = Date.now() - startTime;
    result.success = true;
    result.screenshots = screenshots;
    result.steps = steps;

    console.log(`🎉 Vietjet handler finished in ${(result.duration / 1000).toFixed(2)}s.`);
    return result;
} 