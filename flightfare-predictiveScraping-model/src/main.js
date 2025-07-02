import { clearDirectory } from './utils/fileUtils.js';
import { loadFlightConfig } from './config/loadConfig.js';
import { 
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

import { SCREENSHOT_DIR, FLIGHT_CONFIG_PATH, RESULT_DIR } from './constants/paths.js';
import { BROWSER_CONFIG, delay } from './constants/constants.js';

const MAX_RETRIES = 3;
const BASE_URL = 'https://www.vietjetair.com/vi';




async function main(options = {}) {
    const { 
        useRetry = true, 
        clearScreenshots = true 
    } = options;
    
    const overallStartTime = Date.now();
    let browser = null;
    const allExecutionResults = [];

    try {
        console.log('Thesis Trinh Van Trung Nghia');
        console.log('============================================');
        console.log(`Started at: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
        
        if (clearScreenshots) {
            try {
                clearDirectory(SCREENSHOT_DIR);
            } catch (error) {
                console.warn(`Failed to clear screenshots directory: ${error.message}`);
            }
        }

        const config = await loadFlightConfig();
        const allAirports = config.airports; // Assume loadFlightConfig now returns all airports

        if (!config.targets || !Array.isArray(config.targets)) {
            throw new Error('Configuration file is missing "targets" array.');
        }

        const enabledTargets = config.targets.filter(t => t.enabled);
        console.log(`\nFound ${enabledTargets.length} enabled target(s) to crawl.`);

        for (const target of enabledTargets) {
            const targetStartTime = Date.now();
            console.log(`\n--- Starting crawl for target: [${target.id}] ---`);
            console.log(`Route: ${target.search_options.departure_airport} → ${target.search_options.arrival_airport}`);
            
            let executionResult = {
                targetId: target.id,
                success: false,
                duration: 0,
                error: null,
            };

            try {
                const browserResult = await launchBrowser();
                browser = browserResult.browser;
                const page = browserResult.page;

                console.log('Browser launched for target.');
                setupBrowserLogging(page);

                // Attach all airports to the target config for the handler
                const crawlerConfig = {
                    ...target,
                    airports: allAirports
                };

                // Validate config for this specific target
                validateCrawlerConfig({
                    flightConfig: crawlerConfig.search_options,
                    airports: allAirports
                });

                let crawlerResult;
                if (useRetry) {
                    crawlerResult = await runCrawlerWithRetry(
                        page,
                        crawlerConfig,
                        {
                            maxRetries: config.global_settings.max_retries || 2,
                            retryDelay: config.global_settings.retry_delay_ms || 5000
                        }
                    );
                } else {
                    crawlerResult = await runCrawler(page, crawlerConfig);
                }

                if (crawlerResult.success) {
                    const stats = getCrawlerStats(crawlerResult);
                    console.log('📊 Execution Statistics:');
                    console.log(`   • Success: ${stats.success ? '✅' : '❌'}`);
                    console.log(`   • Route: ${stats.route}`);
                    console.log(`   • Execution time: ${stats.executionTimeFormatted}`);
                    console.log(`   • Results: ${stats.hasResults ? 'Available' : 'None'}`);
                    executionResult.success = true;
                } else {
                    executionResult.error = crawlerResult.error || 'Crawler failed without a specific error message.';
                }

            } catch (error) {
                console.error(`\n❌ Critical error during crawl for target [${target.id}]!`);
                console.error(`🔥 Error: ${error.message}`);
                executionResult.error = error.message;
            } finally {
                if (browser) {
                    await closeBrowser(browser);
                    console.log('Browser closed for target.');
                    browser = null;
                }
                executionResult.duration = (Date.now() - targetStartTime) / 1000;
                console.log(`--- Finished target [${target.id}] in ${executionResult.duration.toFixed(2)}s ---`);
                allExecutionResults.push(executionResult);
            }
        }

        // Auto-increment date logic
        // This part needs to be thoughtful. We'll update all enabled targets.
        console.log('\n📋 Updating departure dates for next run...');
        let updated = false;
        config.targets.forEach(target => {
            if (target.enabled) {
                const originalDate = target.search_options.departure_date;
                incrementDepartureDate(target.search_options);
                console.log(`   • [${target.id}] date updated: ${originalDate} → ${target.search_options.departure_date}`);
                updated = true;
            }
        });

        if (updated) {
            await fs.promises.writeFile(FLIGHT_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
            console.log(`   • Configuration saved to ${FLIGHT_CONFIG_PATH}`);
        }

    } catch (error) {
        console.error('\n❌ Critical error in main execution manager!');
        console.error(`🔥 Error: ${error.message}`);
        console.error(`⚙️ Stack trace: ${error.stack}`);
        // Ensure to return a non-zero exit code on critical failure
        process.exit(1);
    } finally {
        if (browser) await closeBrowser(browser); // Final check for any unclosed browser
        
        const finalDuration = (Date.now() - overallStartTime) / 1000;
        console.log('\n================ Final Summary ================');
        allExecutionResults.forEach(res => {
            console.log(`[${res.targetId}]: ${res.success ? '✅ SUCCESS' : '❌ FAILURE'} in ${res.duration.toFixed(2)}s. ${res.error ? `Error: ${res.error}` : ''}`);
        });
        console.log('============================================');
        console.log(`✅ All tasks completed in ${finalDuration.toFixed(2)} seconds.`);
        console.log(`Completed at: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
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


// ------------------------------- use for auto scraping by n8n -----------------------------
// function incrementDepartureMonth(jsonData) {
//     if (jsonData && jsonData.search_options && jsonData.search_options.departure_date) {
//         let [day, month, year] = jsonData.search_options.departure_date.split('/').map(Number);

//         month++; // Tăng tháng lên 1

//         if (month > 12) {
//             month = 1; 
//             year++;    
//         }

//         const newDay = String(day).padStart(2, '0');
//         const newMonth = String(month).padStart(2, '0');

//         jsonData.search_options.departure_date = `${newDay}/${newMonth}/${year}`;
//     }
//     return jsonData;
// }


function incrementDepartureDate(searchOptions) { // Renamed from incrementDepartureMonth
    if (searchOptions && searchOptions.departure_date) {
        // Current format is DD/MM/YYYY
        let [day, month, year] = searchOptions.departure_date.split('/').map(Number);
        
        // JS Date object month is 0-indexed (0-11)
        let currentDate = new Date(year, month - 1, day);

        const daysToIncrease = 2; // This could be moved to global_settings in config
        currentDate.setDate(currentDate.getDate() + daysToIncrease);

        const newDay = String(currentDate.getDate()).padStart(2, '0');
        const newMonth = String(currentDate.getMonth() + 1).padStart(2, '0'); // Convert back to 1-indexed for string
        const newYear = currentDate.getFullYear();

        searchOptions.departure_date = `${newDay}/${newMonth}/${newYear}`;
        
        // Also increment return_date if it exists
        if (searchOptions.return_date) {
            let [retDay, retMonth, retYear] = searchOptions.return_date.split('/').map(Number);
            let returnDateObj = new Date(retYear, retMonth - 1, retDay);
            returnDateObj.setDate(returnDateObj.getDate() + daysToIncrease);
            const newRetDay = String(returnDateObj.getDate()).padStart(2, '0');
            const newRetMonth = String(returnDateObj.getMonth() + 1).padStart(2, '0');
            const newRetYear = returnDateObj.getFullYear();
            searchOptions.return_date = `${newRetDay}/${newRetMonth}/${newRetYear}`;
        }
    }
}
// ------------------------------------------------------------------------------------------

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
