/**
 * @fileoverview Main entry point for VietJet Flight Crawler
 * This is the final, clean entry point that orchestrates the entire crawling process
 */

// Core modules
import { clearDirectory } from './utils/fileUtils.js';
import { loadFlightConfig } from './config/loadConfig.js';
import { 
    launchBrowser, 
    setupBrowserLogging, 
    closeBrowser,
    takeScreenshot 
} from './utils/browserUtils.js';
import { 
    runCrawler, 
    runCrawlerWithRetry, 
    validateCrawlerConfig, 
    getCrawlerStats 
} from './services/crawlerService.js';

// Constants and paths
import { SCREENSHOT_DIR } from './constants/paths.js';
import { delay } from './constants/constants.js';

/**
 * @typedef {Object} ExecutionResult
 * @property {boolean} success - Overall execution success
 * @property {Object} crawlerResult - Result from crawler execution
 * @property {Object} stats - Execution statistics
 * @property {number} totalDuration - Total execution time
 * @property {string} [error] - Error message if failed
 */

/**
 * Main execution function
 * @param {Object} [options] - Execution options
 * @param {boolean} [options.useRetry=true] - Whether to use retry logic
 * @param {boolean} [options.clearScreenshots=true] - Whether to clear screenshots directory
 * @returns {Promise<ExecutionResult>} Execution result
 */
async function main(options = {}) {
    const { 
        useRetry = true, 
        clearScreenshots = true 
    } = options;
    
    const startTime = Date.now();
    let browser = null;
    let page = null;
    
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
        console.log(`⏰ Started at: ${new Date().toISOString()}`);

        console.log(`🗂️ Clear screenshots: ${clearScreenshots}\n`);
        // Xóa screen shot
        if (clearScreenshots) {
            try {
                clearDirectory(SCREENSHOT_DIR);
                console.log('Screenshots directory cleared successfully\n');
            } catch (error) {
                console.warn(`⚠️ Failed to clear screenshots directory: ${error.message}`);
                console.log('⚠️ Continuing with existing files...\n');
            }
        } else {
            console.log('Skipping screenshots directory cleanup\n');
        }

        // Step 2: Load flight configuration and airports
        console.log('Loading flight configuration and airports...');
        const config = await loadFlightConfig();
        
        console.log(`✅ Configuration loaded successfully:`);
        console.log(`   • ${config.airports.length} airports available`);
        console.log(`   • Route: ${config.flightConfig.departure_airport} → ${config.flightConfig.arrival_airport}`);
        console.log(`   • Departure: ${config.departureAirport.city} (${config.departureAirport.airport_name})`);
        console.log(`   • Arrival: ${config.arrivalAirport.city} (${config.arrivalAirport.airport_name})`);
        console.log(`   • Search options: ${JSON.stringify(config.flightConfig.search_options, null, 2)}\n`);

        // Step 3: Validate crawler configuration
        console.log('📋 Step 3: Validating crawler configuration...');
        validateCrawlerConfig({
            flightConfig: config.flightConfig,
            airports: config.airports
        });
        console.log('');

        // Step 4: Launch browser
        console.log('📋 Step 4: Launching browser...');
        const browserResult = await launchBrowser();
        browser = browserResult.browser;
        page = browserResult.page;
        
        console.log('✅ Browser launched successfully');
        console.log(`   • Browser instance: ${browser ? 'Active' : 'Failed'}`);
        console.log(`   • Page instance: ${page ? 'Active' : 'Failed'}`);
        console.log(`   • Viewport: ${JSON.stringify(await page.viewport())}\n`);

        // Step 5: Setup browser logging (handled in crawlerService, but we can enable early)
        console.log('📋 Step 5: Setting up browser logging...');
        setupBrowserLogging(page);
        console.log('✅ Browser logging configured\n');

        // Step 6: Run main crawler
        console.log('📋 Step 6: Starting main crawler execution...');
        console.log('=' .repeat(50));

        let crawlerResult;
        
        if (useRetry) {
            console.log('🔄 Using crawler with retry logic...\n');
            crawlerResult = await runCrawlerWithRetry(
                page, 
                {
                    flightConfig: config.flightConfig,
                    airports: config.airports
                },
                {
                    maxRetries: 2,
                    retryDelay: 5000
                }
            );
        } else {
            console.log('⚡ Using single-attempt crawler...\n');
            crawlerResult = await runCrawler(page, {
                flightConfig: config.flightConfig,
                airports: config.airports
            });
        }

        console.log('=' .repeat(50));
        console.log('✅ Crawler execution completed\n');

        // Step 7: Process results and generate statistics
        console.log('📋 Step 7: Processing results and generating statistics...');
        
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
            console.log('\n🎉 Main execution completed successfully!');
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
        // Step 8: Cleanup - Always ensure browser is closed
        console.log('\n📋 Step 8: Cleanup and resource management...');
        
        if (browser) {
            try {
                await closeBrowser(browser);
                console.log('✅ Browser closed successfully');
            } catch (closeError) {
                console.error(`⚠️ Error closing browser: ${closeError.message}`);
            }
        } else {
            console.log('ℹ️ No browser instance to close');
        }

        // Final summary
        const finalDuration = (Date.now() - startTime) / 1000;
        console.log('\n🏁 Final Summary');
        console.log('================');
        console.log(`📊 Overall success: ${executionResult.success ? '✅' : '❌'}`);
        console.log(`⏱️ Total runtime: ${finalDuration.toFixed(2)} seconds`);
        console.log(`⏰ Completed at: ${new Date().toISOString()}`);
        
        if (executionResult.success && executionResult.crawlerResult) {
            console.log(`🎯 Crawling success: ✅`);
            console.log(`📊 Results obtained: ${executionResult.crawlerResult.results ? '✅' : '❌'}`);
        }
        
        console.log('🔚 Main execution finished\n');
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
    console.log('🚀 VietJet Flight Crawler Starting...');
    console.log('=====================================');
    
    if (args.length > 0) {
        console.log('📝 Command line arguments detected:');
        args.forEach(arg => console.log(`   • ${arg}`));
    }
    
    console.log(`🔧 Options:`);
    console.log(`   • Use retry: ${options.useRetry}`);
    console.log(`   • Clear screenshots: ${options.clearScreenshots}`);
    console.log('');

    try {
        const result = await main(options);
        
        // Exit with appropriate code
        if (result.success) {
            console.log('🎉 Process completed successfully - exiting with code 0');
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
