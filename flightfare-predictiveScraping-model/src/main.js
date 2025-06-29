import { clearDirectory } from './utils/fileUtils.js';
import { loadFlightConfig } from './config/loadConfig.js';
import { 
    //getBrowser,
    closeBrowser,
    launchBrowser, 
    setupBrowserLogging, 
    takeScreenshot 
} from './utils/browserUtils.js';
import { 
    runCrawler, 
    runCrawlerWithRetry, 
    validateCrawlerConfig, 
    getCrawlerStats 
} from './services/crawlerService.js';
import fs from 'fs';

// Constants and paths
import { SCREENSHOT_DIR, FLIGHT_CONFIG_PATH, RESULT_DIR } from './constants/paths.js';
import { BROWSER_CONFIG, delay } from './constants/constants.js';

// App-level constants
const MAX_RETRIES = 3;
const BASE_URL = 'https://www.vietjetair.com/vi';


// ----- use for auto scraping by n8n ----------------
function incrementDepartureMonth(jsonData) {
    if (jsonData && jsonData.search_options && jsonData.search_options.departure_date) {
        let [day, month, year] = jsonData.search_options.departure_date.split('/').map(Number);

        month++; // Tăng tháng lên 1

        if (month > 12) {
            month = 1; 
            year++;    
        }

        const newDay = String(day).padStart(2, '0');
        const newMonth = String(month).padStart(2, '0');

        jsonData.search_options.departure_date = `${newDay}/${newMonth}/${year}`;
    }
    return jsonData;
}


async function main(options = {}) {
    const { 
        useRetry = true, 
        clearScreenshots = true 
    } = options;
    
    const startTime = Date.now();
    let browser = null;
    let page = null;
    let config = null;
    
    const executionResult = {
        success: false,
        crawlerResult: null,
        stats: null,
        totalDuration: 0,
        error: null
    };

    try {
        // Header
        console.log('Thesis Trinh Van Trung Nghia');
        console.log('============================================');
        console.log(`Started at: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
        // Xóa screen shot 
        if (clearScreenshots) {
            try {
                clearDirectory(SCREENSHOT_DIR);
                // console.log('Screenshots cleared\n');
            } catch (error) {
                console.warn(`Failed to clear screenshots directory: ${error.message}`);
            }
        } else {
            console.log('Skipping screenshots directory');
        }

//---------------------------------------------Load flight configuration and airports------------------------------------------------ 
// ------------------------------------------Xác định cấu hình cho chuyến bay và sân bay 
        config = await loadFlightConfig();
        
        console.log(`Configuration loaded :`);
        console.log(`   • Route: ${config.flightConfig.departure_airport} → ${config.flightConfig.arrival_airport}`);
        console.log(`   • Departure: ${config.departureAirport.city} (${config.departureAirport.airport_name})`);
        console.log(`   • Arrival: ${config.arrivalAirport.city} (${config.arrivalAirport.airport_name})`);
        console.log(`   • Search options: ${JSON.stringify(config.flightConfig.search_options, null, 2)}\n`);

// ------------------------------------------------Xác thưc cấu hình cho crawler------------------------------------------------
        validateCrawlerConfig({
            flightConfig: config.flightConfig,
            airports: config.airports
        });
        console.log('');

// ------------------------------------------------Launch browser(Khởi động website)------------------------------------------------
        console.log('Launching browser...');
        const browserResult = await launchBrowser(BASE_URL);
        browser = browserResult.browser;
        page = browserResult.page;
        
        console.log('Browser launched with:');
        console.log(`   • Headless: ${BROWSER_CONFIG.HEADLESS}`)
        console.log(`   • Browser instance: ${browser ? 'Active' : 'Failed'}`);
        console.log(`   • Page instance: ${page ? 'Active' : 'Failed'}`);
        console.log(`   • Viewport: ${JSON.stringify(await page.viewport())}\n`);

// ------------------------------------------------Setup browser logging (show log từ trang web)------------------------------------------------
        console.log('Setting up browser logging...');
        setupBrowserLogging(page);
// -------------------------------------------------Run main crawler-------------------------------------------------
        
        console.log('Starting main crawler execution...');
        let crawlerResult;
        
        if (useRetry) {
            crawlerResult = await runCrawlerWithRetry(
                page, 
                {
                    flightConfig: config.flightConfig,
                    airports: config.airports
                },
                {
                    maxRetries: MAX_RETRIES,
                    retryDelay: 5000
                }
            );
        } else {
            // call crawlerServices.js
            crawlerResult = await runCrawler(page, {
                flightConfig: config.flightConfig,
                airports: config.airports
            });
        }

//------------------------ Process results and generate statistics--------------        
        const stats = getCrawlerStats(crawlerResult);
        
        console.log('📊 Execution Statistics:');
        console.log(`   • Success: ${stats.success ? '✅' : '❌'}`);
        console.log(`   • Route: ${stats.route}`);
        console.log(`   • Execution time: ${stats.executionTimeFormatted}`);
        console.log(`   • Steps completed: ${stats.stepsCompleted}`);
        console.log(`   • Screenshots taken: ${stats.screenshotsTaken}`);
        console.log(`   • Results available: ${stats.hasResults ? '✅' : '❌'}`);
        console.log(`   • Start time: ${stats.startTime}`);
        console.log(`   • End time: ${stats.endTime}`);

        if (crawlerResult.results) {
            console.log('\n📋 Crawler Results Summary:');
            const results = crawlerResult.results;
            console.log(`   • Source: ${results.source || 'Unknown'}`);
            console.log(`   • Timestamp: ${results.timestamp || 'N/A'}`);
            
            if (results.total_flights !== undefined) {
                console.log(`   • Total flights: ${results.total_flights}`);
            }
            if (results.url) {
                console.log(`   • Results URL: ${results.url}`);
            }
        }

        // Update execution result
        executionResult.success = crawlerResult.success;
        executionResult.crawlerResult = crawlerResult;
        executionResult.stats = stats;
        executionResult.totalDuration = Date.now() - startTime;

        if (crawlerResult.success) {
            console.log('\n🎉 Main execution completed !');
            console.log('==========================================');
            console.log(`⏱️ Total execution time: ${(executionResult.totalDuration / 1000).toFixed(2)} seconds`);
            console.log(`📸 Total screenshots: ${crawlerResult.screenshots.length}`);
            console.log(`📊 Results: ${crawlerResult.results ? 'Available' : 'None'}`);
        } else {
            console.log('\n⚠️ Main execution completed with issues');
            console.log('=======================================');
            console.log(`❌ Crawler error: ${crawlerResult.error}`);
            console.log(`⏱️ Execution time: ${(executionResult.totalDuration / 1000).toFixed(2)} seconds`);
        }

        return executionResult;

    } catch (error) {
        console.error('\n❌ Critical error in main execution!');
        console.error('====================================');
        console.error(`🔥 Error: ${error.message}`);
        console.error(`⚙️ Stack trace: ${error.stack}`);
        console.error(`⏱️ Failed after: ${((Date.now() - startTime) / 1000).toFixed(2)} seconds`);

        // Try to take error screenshot if page is available
        if (page) {
            try {
                console.error('📸 Attempting to take error screenshot...');
                const errorScreenshot = await takeScreenshot(page, 'main-critical-error');
                console.error(`📸 Error screenshot saved: ${errorScreenshot}`);
            } catch (screenshotError) {
                console.error(`📸 Failed to take error screenshot: ${screenshotError.message}`);
            }
        }

        // Update execution result with error
        executionResult.success = false;
        executionResult.error = error.message;
        executionResult.totalDuration = Date.now() - startTime;

        return executionResult;

    } finally {
         await delay(20000);
        // Step 8: Cleanup - Always ensure browser is closed
        console.log('\n📋 Step 8: Cleanup and resource management...');
        
        if (browser) {
            try {
                await closeBrowser(browser);
                console.log('✅ Browser closed ');
            } catch (closeError) {
                console.error(`⚠️ Error closing browser: ${closeError.message}`);
            }
        } else {
            console.log('ℹ️ No browser instance to close');
        }
// -------------Incr month in flight-config.json-------------
        if (config && config.flightConfig) {
            try {
                console.log('\n📋 Calling incrementDepartureMonth before final exit...');
                const originalDate = config.flightConfig.search_options.departure_date;
                
                // Cập nhật ngày khởi hành trong đối tượng config
                incrementDepartureMonth(config.flightConfig);
                
                console.log(`   • Original departure date: ${originalDate}`);
                console.log(`   • New departure date: ${config.flightConfig.search_options.departure_date}`);
                
                // Ghi lại cấu hình đã cập nhật vào tệp
                await fs.promises.writeFile(FLIGHT_CONFIG_PATH, JSON.stringify(config.flightConfig, null, 2), 'utf8');
                console.log(`   • Configuration saved to ${FLIGHT_CONFIG_PATH}`);
            } catch (error) {
                console.error('❌ Error updating and saving flight configuration:', error);
            }
        } else {
            console.log('ℹ️ Flight configuration not available for month increment, skipping.');
        }
        // await delay(20000);

// ------------------------------------------------------------------
        // Final summary
        const finalDuration = (Date.now() - startTime) / 1000;
        console.log('\n Final Summary');
        console.log('================');
        // console.log(`Overall success: ${executionResult.success ? '✅' : '❌'}`);
        console.log(`Total runtime: ${finalDuration.toFixed(2)} seconds`);
        console.log(`Completed at: ${new Date().toISOString()}`);
        
        if (executionResult.success && executionResult.crawlerResult) {
            // console.log(` Crawling success: ✅`);
            // console.log(`📊 Results obtained: ${executionResult.crawlerResult.results ? '✅' : '❌'}`);
        }
        
        // console.log('🔚 Main execution finished\n');
    }
}

/**
 * Entry point with command line argument handling
 */
async function entryPoint() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const options = {
        useRetry: !args.includes('--no-retry'),
        clearScreenshots: !args.includes('--keep-screenshots')
    };

    // Display startup information
    // console.log('🚀 VietJet Flight Crawler Starting...');
    // console.log('=====================================');
    
    if (args.length > 0) {
        console.log('Command line arguments detected:');
        args.forEach(arg => console.log(`   • ${arg}`));
    }
    
    // console.log(`Options:`);
    // console.log(`   • Use retry: ${options.useRetry}`);
    // console.log(`   • Clear screenshots: ${options.clearScreenshots}`);
    // console.log('');

    try {
        const result = await main(options);
        
        // Exit with appropriate code
        if (result.success) {
            // console.log('🎉 Process completed  - exiting with code 0');
            process.exit(0);
            } else {
            console.log('❌ Process completed with errors - exiting with code 1');
            process.exit(1);
        }
        
        } catch (error) {
        console.error('💥 Unhandled error in entry point:', error);
        process.exit(1);
    }
}

// Usage information
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('VietJet Flight Crawler');
    console.log('======================');
    console.log('');
    console.log('Usage: node src/main.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --no-retry           Disable retry logic');
    console.log('  --keep-screenshots   Keep existing screenshots');
    console.log('  --help, -h           Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  node src/main.js                    # Run with default options');
    console.log('  node src/main.js --no-retry         # Run without retry logic');
    console.log('  node src/main.js --keep-screenshots # Keep existing screenshots');
    console.log('');
    process.exit(0);
}

// Run the application (entry point detection)
// Check if this file is being run directly (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1].endsWith('src/main.js') ||
                     process.argv[1].endsWith('src\\main.js');

if (isMainModule) {
    entryPoint();
}

// Export for programmatic usage
export { main, entryPoint };
