import express from 'express';
import fs from 'fs';
import { 
    launchBrowser, 
    closeBrowser 
} from '../utils/browserUtils.js';
import { loadFlightConfig, FLIGHT_CONFIG_PATH, RESULT_DIR } from '../config/loadConfig.js';
import { clearDirectory } from '../utils/fileUtils.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.join(__dirname, '../../../screenshot');

// Import crawler modules
import * as baydepCrawler from '../crawlers/baydep/index.js';
import * as vietjetCrawler from '../crawlers/vietjet/index.js';

// Import database service
import { saveFlightPricesToDB, isDatabaseAvailable } from '../services/flightPriceService.js';

const router = express.Router();

// Constants
const MAX_RETRIES = 3;

/**
 * Parse date from DDMMYYYY format to Date object
 * @param {string} dateStr - Date string in DDMMYYYY format (e.g., "17112025")
 * @returns {Date} Date object
 */
function parseDateFromFormat(dateStr) {
    if (!dateStr || dateStr.length !== 8) {
        throw new Error(`Invalid date format: ${dateStr}. Expected DDMMYYYY format`);
    }
    const day = parseInt(dateStr.substring(0, 2), 10);
    const month = parseInt(dateStr.substring(2, 4), 10) - 1; // Month is 0-indexed
    const year = parseInt(dateStr.substring(4, 8), 10);
    return new Date(year, month, day);
}

/**
 * Format Date object to DDMMYYYY format
 * @param {Date} date - Date object
 * @returns {string} Date string in DDMMYYYY format
 */
function formatDateToString(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear());
    return `${day}${month}${year}`;
}

/**
 * Generate list of dates from start date for specified number of days
 * @param {string} startDateStr - Start date in DDMMYYYY format
 * @param {number} days - Number of days to generate (including start date)
 * @returns {Array<string>} Array of date strings in DDMMYYYY format
 */
function generateDateRange(startDateStr, days) {
    const startDate = parseDateFromFormat(startDateStr);
    const dates = [];
    
    for (let i = 0; i < days; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        dates.push(formatDateToString(currentDate));
    }
    
    return dates;
}

/**
 * Convert date from DDMMYYYY to DD/MM/YYYY format (for VietJet crawler)
 * @param {string} dateStr - Date string in DDMMYYYY format (e.g., "08122025")
 * @returns {string} Date string in DD/MM/YYYY format (e.g., "08/12/2025")
 */
function convertToSlashFormat(dateStr) {
    if (!dateStr) return dateStr;
    
    // Already in DD/MM/YYYY format
    if (dateStr.includes('/')) {
        return dateStr;
    }
    
    // Convert DDMMYYYY to DD/MM/YYYY
    if (dateStr.length === 8) {
        const day = dateStr.substring(0, 2);
        const month = dateStr.substring(2, 4);
        const year = dateStr.substring(4, 8);
        return `${day}/${month}/${year}`;
    }
    
    throw new Error(`Invalid date format: ${dateStr}. Expected DDMMYYYY or DD/MM/YYYY`);
}

/**
 * POST /api/crawl/baydep
 * Crawl flight data from BayDep.vn
 */
router.post('/baydep', async (req, res) => {
    const startTime = Date.now();
    let browser = null;
    let page = null;
    let config = null;
    let crawlerResult = null;
    let stats = null;
    let crawlDays = 0;
    let datesToCrawl = [];
    let aggregatedResults = null;

    try {
        console.log('API Crawl baydep.vn Request Started');
        console.log('============================');
        console.log(`Started at: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
        console.log(`Request body:`, JSON.stringify(req.body, null, 2));

        // Extract and validate request parameters
        const {
            departure_airport,
            arrival_airport,
            departure_date,
            return_date,
            adult,
            child, 
            infant,
            trip_type = 'oneway',
            find_cheapest = false,
            use_retry = true,
            clear_screenshots = true,
            auto_crawl_days = 0  // Number of days to auto-crawl (0 = only crawl the specified date)
        } = req.body;
        
        // Debug: Log auto_crawl_days value
        console.log(`🔍 DEBUG: auto_crawl_days received: ${auto_crawl_days} (type: ${typeof auto_crawl_days})`);

        // Validate required parameters
        if (!departure_airport || !arrival_airport || !departure_date) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: departure_airport, arrival_airport, departure_date',
                required_fields: ['departure_airport', 'arrival_airport', 'departure_date'],
                optional_fields: ['return_date', 'trip_type', 'find_cheapest', 'use_retry', 'clear_screenshots']
            });
        }

        // Validate trip_type and return_date
        if (trip_type === 'roundtrip' && !return_date) {
            return res.status(400).json({
                success: false,
                error: 'return_date is required when trip_type is roundtrip'
            });
        }
        if (isNaN(adult) || adult < 1) { 
            return res.status(400).json({ 
                success: false, 
                error: 'Adult count must be a positive integer and at least 1.' 
            });
        }
        if (isNaN(child) || child < 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Child count must be a non-negative integer.' 
            });
        }
        if (isNaN(infant) || infant < 0) {
            return res.status(400).json({ 
                success: false, error: 'Infant count must be a non-negative integer.' 
            });
        }
        if (infant > adult) { 
            return res.status(400).json({ 
                success: false, error: 'Number of infants cannot exceed number of adults.' 
            });
        }
        
        // Validate auto_crawl_days
        crawlDays = parseInt(auto_crawl_days, 10) || 0;
        console.log(`🔍 DEBUG: crawlDays parsed: ${crawlDays}`);
        
        if (crawlDays < 0 || crawlDays > 30) {
            return res.status(400).json({
                success: false,
                error: 'auto_crawl_days must be between 0 and 30'
            });
        }
        
        // Generate date range if auto_crawl_days > 0
        datesToCrawl = crawlDays > 0 
            ? generateDateRange(departure_date, crawlDays + 1) // +1 to include start date
            : [departure_date];
        
        console.log(`📅 Auto-crawl mode: ${crawlDays > 0 ? `Enabled (${datesToCrawl.length} days)` : 'Disabled'}`);
        if (crawlDays > 0) {
            console.log(`   Dates to crawl: ${datesToCrawl.join(', ')}`);
        }
        console.log(`🔍 DEBUG: datesToCrawl array length: ${datesToCrawl.length}`);
        
        // Update flight configuration with request parameters
        const updatedFlightConfig = {
            departure_airport: departure_airport.toUpperCase(),
            arrival_airport: arrival_airport.toUpperCase(),
            search_options: {
                trip_type,
                find_cheapest,
                departure_date,
                ...(trip_type === 'roundtrip' && return_date && { return_date })
            },
            adult,
            child,
            infant,
            updated_at: new Date().toISOString() 
        };

        // Save updated config to file
        await fs.promises.writeFile(
            FLIGHT_CONFIG_PATH, 
            JSON.stringify(updatedFlightConfig, null, 2), 
            'utf8'
        );
        console.log(`Updated file config(content from body)`);

        console.log(`✅ Flight configuration updated:`);
        console.log(`   • Route: ${updatedFlightConfig.departure_airport} → ${updatedFlightConfig.arrival_airport}`);
        console.log(`   • Trip type: ${updatedFlightConfig.search_options.trip_type}`);
        console.log(`   • Departure date: ${updatedFlightConfig.search_options.departure_date}`);
        if (updatedFlightConfig.search_options.return_date) {
            console.log(`   • Return date: ${updatedFlightConfig.search_options.return_date}`);
        }
        console.log("   • Adult: "+updatedFlightConfig.adult);
        console.log("   • Child: "+updatedFlightConfig.child);
        console.log("   • Infant: "+updatedFlightConfig.infant);


        // Clear screenshots if requested (only once at the start)
        if (clear_screenshots) {
            try {
                clearDirectory(SCREENSHOT_DIR);
            } catch (error) {
                console.warn(`⚠️ Failed to clear screenshots directory: ${error.message}`);
            }
        }

        // Load flight configuration and airports (base config)
        config = await loadFlightConfig();
        
        // Validate crawler configuration
        baydepCrawler.validateCrawlerConfig({
            flightConfig: config.flightConfig,
            airports: config.airports
        });

        // Launch browser once (will be reused for all dates)
        console.log('Launching browser...');
        const browserResult = await launchBrowser();
        browser = browserResult.browser;
        page = browserResult.page;
        
        console.log('✅ Browser launched successfully');

        // Arrays to store results from all dates
        const allCrawlResults = [];
        const allStats = [];
        let overallSuccess = true;
        let totalExecutionTime = 0;

        // Loop through each date
        for (let i = 0; i < datesToCrawl.length; i++) {
            const currentDate = datesToCrawl[i];
            const dateIndex = i + 1;
            const totalDates = datesToCrawl.length;
            
            console.log('\n' + '='.repeat(60));
            console.log(`📅 Crawling date ${dateIndex}/${totalDates}: ${currentDate}`);
            console.log('='.repeat(60));
            
            // Verify browser and page are still valid before each crawl
            if (!browser || !page || browser.isConnected() === false) {
                console.error('❌ Browser or page is no longer valid. Attempting to relaunch...');
                try {
                    if (browser) {
                        await closeBrowser(browser).catch(() => {});
                    }
                    const browserResult = await launchBrowser();
                    browser = browserResult.browser;
                    page = browserResult.page;
                    console.log('✅ Browser relaunched successfully');
                } catch (relaunchError) {
                    console.error(`❌ Failed to relaunch browser: ${relaunchError.message}`);
                    overallSuccess = false;
                    allCrawlResults.push({
                        date: currentDate,
                        success: false,
                        results: null,
                        error: `Browser relaunch failed: ${relaunchError.message}`,
                        stats: null
                    });
                    continue; // Skip this date and continue to next
                }
            }
            
            try {
                // Update flight config with current date
                const dateSpecificConfig = {
                    ...updatedFlightConfig,
                    search_options: {
                        ...updatedFlightConfig.search_options,
                        departure_date: currentDate
                    }
                };
                
                // Save updated config to file
                await fs.promises.writeFile(
                    FLIGHT_CONFIG_PATH, 
                    JSON.stringify(dateSpecificConfig, null, 2), 
                    'utf8'
                );
                
                // Reload config to get updated date
                const dateConfig = await loadFlightConfig();
                
                // Run crawler for this date
                let dateCrawlerResult;
                if (use_retry) {
                    dateCrawlerResult = await baydepCrawler.runCrawlerWithRetry(
                        page, 
                        {
                            flightConfig: dateConfig.flightConfig,
                            airports: dateConfig.airports
                        },
                        {
                            maxRetries: MAX_RETRIES,
                            retryDelay: 5000
                        }
                    );
                } else {
                    dateCrawlerResult = await baydepCrawler.runCrawler(page, {
                        flightConfig: dateConfig.flightConfig,
                        airports: dateConfig.airports
                    });
                }
                
                // Generate statistics for this date
                const dateStats = baydepCrawler.getCrawlerStats(dateCrawlerResult);
                
                // Store results
                allCrawlResults.push({
                    date: currentDate,
                    success: dateCrawlerResult.success,
                    results: dateCrawlerResult.results,
                    error: dateCrawlerResult.error,
                    stats: dateStats
                });
                
                allStats.push(dateStats);
                totalExecutionTime += dateStats.executionTime || 0;
                
                if (!dateCrawlerResult.success) {
                    overallSuccess = false;
                    console.error(`❌ Failed to crawl date ${currentDate}: ${dateCrawlerResult.error || 'Unknown error'}`);
                } else {
                    console.log(`✅ Successfully crawled date ${currentDate}`);
                    
                    // Debug: Check conditions
                    console.log(`🔍 DB Save Check - crawlDays: ${crawlDays}, hasResults: ${!!dateCrawlerResult.results}, hasDailyResults: ${!!(dateCrawlerResult.results && dateCrawlerResult.results.daily_results)}`);
                    
                    // Save to database ONLY for user searches (not batch crawls)
                    if (crawlDays === 0 && dateCrawlerResult.results && dateCrawlerResult.results.daily_results) {
                        try {
                            console.log(`💾 User search detected - saving to database...`);
                            const dbResult = await saveFlightPricesToDB(
                                dateCrawlerResult.results.daily_results,
                                dateSpecificConfig,
                                'user_search'
                            );
                            console.log(`✅ Database save: ${dbResult.savedCount}/${dbResult.total} records saved`);
                        } catch (dbError) {
                            console.error(`⚠️  Failed to save to database: ${dbError.message}`);
                            console.error(`🔍 DB Error stack: ${dbError.stack}`);
                            console.log(`📁 Data is still saved in JSON file as backup`);
                            // Don't throw - continue execution even if DB fails
                        }
                    } else if (crawlDays > 0) {
                        console.log(`📦 Batch crawl mode - data saved to file only (not database)`);
                    } else {
                        console.log(`⚠️  DB save skipped - conditions not met`);
                    }
                }
                
                // Reset page state for next crawl (important for multi-date crawling)
                if (i < datesToCrawl.length - 1) {
                    try {
                        console.log('🔄 Resetting page state for next date...');
                        
                        // Clear any existing navigation state and reset page
                        await page.evaluate(() => {
                            // Stop any ongoing navigation
                            if (window.stop) {
                                window.stop();
                            }
                            // Clear any intervals or timeouts
                            const highestId = setTimeout(() => {}, 0);
                            for (let i = 0; i < highestId; i++) {
                                clearTimeout(i);
                                clearInterval(i);
                            }
                        }).catch(() => {
                            // Ignore evaluation errors
                        });
                        
                        // Navigate to blank page to reset state
                        await page.goto('about:blank', { 
                            waitUntil: 'domcontentloaded', 
                            timeout: 5000 
                        }).catch(() => {
                            // Ignore navigation errors, continue anyway
                        });
                        
                        // Small delay to ensure page is reset
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        console.log('✅ Page state reset completed');
                    } catch (resetError) {
                        console.warn(`⚠️ Page reset warning: ${resetError.message}`);
                        // Continue to next date anyway
                    }
                    
                    // Additional delay between dates to avoid overwhelming the server
                    console.log('⏳ Waiting 2 seconds before next date...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (error) {
                console.error(`❌ Error crawling date ${currentDate}: ${error.message}`);
                overallSuccess = false;
                allCrawlResults.push({
                    date: currentDate,
                    success: false,
                    results: null,
                    error: error.message,
                    stats: null
                });
            }
        }

        // Aggregate results
        aggregatedResults = {
            total_dates: datesToCrawl.length,
            successful_dates: allCrawlResults.filter(r => r.success).length,
            failed_dates: allCrawlResults.filter(r => !r.success).length,
            dates: allCrawlResults
        };

        // Use the last successful result's structure for compatibility
        crawlerResult = {
            success: overallSuccess,
            results: aggregatedResults,
            error: overallSuccess ? null : 'Some dates failed to crawl',
            screenshots: allCrawlResults.flatMap(r => r.stats?.screenshotsTaken || [])
        };

        // Generate overall statistics
        stats = {
            success: overallSuccess,
            executionTime: totalExecutionTime,
            executionTimeFormatted: `${(totalExecutionTime / 1000).toFixed(2)}s`,
            stepsCompleted: allStats.reduce((sum, s) => sum + (s.stepsCompleted || 0), 0),
            screenshotsTaken: allStats.reduce((sum, s) => sum + (s.screenshotsTaken || 0), 0),
            hasResults: allCrawlResults.some(r => r.results),
            route: `${updatedFlightConfig.departure_airport} → ${updatedFlightConfig.arrival_airport}`,
            startTime: allStats[0]?.startTime || new Date().toISOString(),
            endTime: allStats[allStats.length - 1]?.endTime || new Date().toISOString(),
            totalDates: datesToCrawl.length,
            successfulDates: aggregatedResults.successful_dates
        };

        // Prepare API response
        const apiResponse = {
            success: crawlerResult.success,
            message: crawlDays > 0 
                ? `Crawling completed for ${aggregatedResults.successful_dates}/${datesToCrawl.length} dates`
                : (crawlerResult.success ? 'Crawling completed successfully' : 'Crawling failed'),
            data: {
                auto_crawl: {
                    enabled: crawlDays > 0,
                    total_days: datesToCrawl.length,
                    successful_dates: aggregatedResults.successful_dates,
                    failed_dates: aggregatedResults.failed_dates,
                    dates_crawled: datesToCrawl
                },
                search_parameters: {
                    departure_airport: updatedFlightConfig.departure_airport,
                    arrival_airport: updatedFlightConfig.arrival_airport,
                    start_date: datesToCrawl[0],
                    end_date: datesToCrawl[datesToCrawl.length - 1],
                    trip_type: updatedFlightConfig.search_options.trip_type,
                    ...(updatedFlightConfig.search_options.return_date && { 
                        return_date: updatedFlightConfig.search_options.return_date 
                    })
                },
                route_info: {
                    departure: {
                        city: config.departureAirport.city,
                        airport_name: config.departureAirport.airport_name,
                        code: config.departureAirport.airport_code
                    },
                    arrival: {
                        city: config.arrivalAirport.city,
                        airport_name: config.arrivalAirport.airport_name,
                        code: config.arrivalAirport.airport_code
                    }
                },
                execution_stats: {
                    success: stats.success,
                    execution_time_ms: Date.now() - startTime,
                    execution_time_formatted: `${((Date.now() - startTime) / 1000).toFixed(2)} seconds`,
                    steps_completed: stats.stepsCompleted,
                    screenshots_taken: stats.screenshotsTaken,
                    start_time: stats.startTime,
                    end_time: stats.endTime,
                    total_dates: stats.totalDates,
                    successful_dates: stats.successfulDates
                },
                results: crawlerResult.results || null,
                screenshots: crawlerResult.screenshots || [],
                timestamp: new Date().toISOString()
            }
        };

        if (crawlerResult.error) {
            apiResponse.error = crawlerResult.error;
        }

        // Return response
        const statusCode = crawlerResult.success ? 200 : 500;
        return res.status(statusCode).json(apiResponse);

    } catch (error) {
        console.error('\n❌ Critical error in API crawl request!');
        console.error(`🔥 Error: ${error.message}`);
        console.error(`📍 Stack trace: ${error.stack}`);

        const errorResponse = {
            success: false,
            error: error.message,
            message: 'Crawling request failed due to internal error',
            data: {
                execution_time_ms: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }
        };

        return res.status(500).json(errorResponse);

    } finally {
        // Cleanup - Always ensure browser is closed
        if (browser) {
            try {
                await closeBrowser(browser);
            } catch (closeError) {
                console.error(`⚠️ Error closing browser: ${closeError.message}`);
            }
        }

        const finalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        if (crawlerResult && crawlerResult.success) {
            console.log('\n🎉 API Crawl Request Completed Successfully!');
            console.log('===========================================');
            if (crawlDays > 0 && aggregatedResults && datesToCrawl.length > 0) {
                console.log(`📅 Auto-crawl: ${aggregatedResults.successful_dates}/${datesToCrawl.length} dates successful`);
                console.log(`   Dates: ${datesToCrawl[0]} to ${datesToCrawl[datesToCrawl.length - 1]}`);
            }
            console.log(`🕒 Runtime: ${finalDuration} seconds`);
            console.log(`⏰ Completed at: ${new Date().toISOString()}`);
        } else {
            const errorMsg = crawlerResult ? crawlerResult.error : "A critical error occurred before crawling could complete.";
            console.error(`\n❌ Crawl FAILED. Error: ${errorMsg}`);
            if (crawlDays > 0 && aggregatedResults && datesToCrawl.length > 0) {
                console.error(`📅 Auto-crawl: ${aggregatedResults.successful_dates}/${datesToCrawl.length} dates successful`);
            }
            console.error(`🕒 Runtime: ${finalDuration} seconds`);
        }
    }
});

/**
 * GET /api/crawl/config
 * Get current flight configuration
 */
router.get('/config', async (req, res) => {
    try {
        const configData = await fs.promises.readFile(FLIGHT_CONFIG_PATH, 'utf8');
        const config = JSON.parse(configData);
        
        res.json({
            success: true,
            data: config,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to read flight configuration'
        });
    }
});

/**
 * POST /api/crawl/vietjet
 * Crawl flight data from VietJet Airlines
 */
router.post('/vietjet', async (req, res) => {
    const startTime = Date.now();
    let browser = null;
    let page = null;
    let config = null;

    try {
        console.log('🚀 API Crawl VietJet Request Started');
        console.log('============================');
        console.log(`Started at: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
        console.log(`Request body:`, JSON.stringify(req.body, null, 2));

        // Extract and validate request parameters
        const {
            departure_airport,
            arrival_airport,
            departure_date,
            return_date,
            adult,
            child, 
            infant,
            trip_type = 'oneway',
            find_cheapest = false,
            use_retry = true,
            clear_screenshots = true
        } = req.body;

        // Validate required parameters
        if (!departure_airport || !arrival_airport || !departure_date) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: departure_airport, arrival_airport, departure_date',
                required_fields: ['departure_airport', 'arrival_airport', 'departure_date'],
                optional_fields: ['return_date', 'trip_type', 'find_cheapest', 'use_retry', 'clear_screenshots', 'adult', 'child', 'infant']
            });
        }

        // Validate trip_type and return_date
        if (trip_type === 'roundtrip' && !return_date) {
            return res.status(400).json({
                success: false,
                error: 'return_date is required when trip_type is roundtrip'
            });
        }

        // Validate passenger counts
        if (isNaN(adult) || adult < 1) { 
            return res.status(400).json({ 
                success: false, 
                error: 'Adult count must be a positive integer and at least 1.' 
            });
        }
        if (isNaN(child) || child < 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Child count must be a non-negative integer.' 
            });
        }
        if (isNaN(infant) || infant < 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Infant count must be a non-negative integer.' 
            });
        }
        if (infant > adult) { 
            return res.status(400).json({ 
                success: false, 
                error: 'Number of infants cannot exceed number of adults.' 
            });
        }

        // Update flight configuration with request parameters
        // Convert dates to DD/MM/YYYY format for VietJet crawler
        const updatedFlightConfig = {
            departure_airport: departure_airport.toUpperCase(),
            arrival_airport: arrival_airport.toUpperCase(),
            search_options: {
                trip_type,
                find_cheapest,
                departure_date: convertToSlashFormat(departure_date),
                ...(trip_type === 'roundtrip' && return_date && { return_date: convertToSlashFormat(return_date) })
            },
            adult,
            child,
            infant,
            updated_at: new Date().toISOString() 
        };

        // Save updated config to file
        await fs.promises.writeFile(
            FLIGHT_CONFIG_PATH, 
            JSON.stringify(updatedFlightConfig, null, 2), 
            'utf8'
        );

        console.log(`✅ Flight configuration updated:`);
        console.log(`   • Route: ${updatedFlightConfig.departure_airport} → ${updatedFlightConfig.arrival_airport}`);
        console.log(`   • Trip type: ${updatedFlightConfig.search_options.trip_type}`);
        console.log(`   • Departure date: ${updatedFlightConfig.search_options.departure_date}`);
        if (updatedFlightConfig.search_options.return_date) {
            console.log(`   • Return date: ${updatedFlightConfig.search_options.return_date}`);
        }
        console.log(`   • Adult: ${updatedFlightConfig.adult}`);
        console.log(`   • Child: ${updatedFlightConfig.child}`);
        console.log(`   • Infant: ${updatedFlightConfig.infant}`);

        // Clear screenshots if requested
        if (clear_screenshots) {
            try {
                clearDirectory(SCREENSHOT_DIR);
                console.log('📸 Screenshots directory cleared');
            } catch (error) {
                console.warn(`⚠️ Failed to clear screenshots directory: ${error.message}`);
            }
        }

        // Load flight configuration and airports
        config = await loadFlightConfig();
        
        console.log(`📋 Configuration loaded:`);
        console.log(`   • Route: ${config.flightConfig.departure_airport} → ${config.flightConfig.arrival_airport}`);
        console.log(`   • Departure: ${config.departureAirport.city} (${config.departureAirport.airport_name})`);
        console.log(`   • Arrival: ${config.arrivalAirport.city} (${config.arrivalAirport.airport_name})`);
        
        // Validate crawler configuration
        vietjetCrawler.validateCrawlerConfig({
            flightConfig: config.flightConfig,
            airports: config.airports
        });

        // Launch browser
        console.log('🌐 Launching browser...');
        const browserResult = await launchBrowser();
        browser = browserResult.browser;
        page = browserResult.page;
        
        console.log('✅ Browser launched successfully');

        // Run crawler
        console.log('🔍 Starting crawler execution...');
        let crawlerResult;

        if (use_retry) {
            crawlerResult = await vietjetCrawler.runCrawlerWithRetry(
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
            crawlerResult = await vietjetCrawler.runCrawler(page, {
                flightConfig: config.flightConfig,
                airports: config.airports
            });
        }

        // Generate statistics
        const stats = vietjetCrawler.getCrawlerStats(crawlerResult);
        const totalDuration = Date.now() - startTime;

        console.log('📊 Execution Statistics:');
        console.log(`   • Success: ${stats.success ? '✅' : '❌'}`);
        console.log(`   • Route: ${stats.route}`);
        console.log(`   • Execution time: ${stats.executionTimeFormatted}`);
        console.log(`   • Steps completed: ${stats.stepsCompleted}`);
        console.log(`   • Screenshots taken: ${stats.screenshotsTaken}`);
        console.log(`   • Results available: ${stats.hasResults ? '✅' : '❌'}`);

        // Save to database for VietJet user searches
        if (crawlerResult.success && crawlerResult.results && crawlerResult.results.daily_results) {
            try {
                console.log(`💾 Saving VietJet search results to database...`);
                const dbResult = await saveFlightPricesToDB(
                    crawlerResult.results.daily_results,
                    updatedFlightConfig,
                    'user_search'
                );
                console.log(`✅ Database save: ${dbResult.savedCount}/${dbResult.total} records saved`);
            } catch (dbError) {
                console.error(`⚠️  Failed to save to database: ${dbError.message}`);
                console.log(`📁 Data is still saved in JSON file as backup`);
                // Don't throw - continue execution even if DB fails
            }
        }

        // Prepare API response
        const apiResponse = {
            success: crawlerResult.success,
            message: crawlerResult.success ? 'Crawling completed successfully' : 'Crawling failed',
            data: {
                search_parameters: {
                    departure_airport: updatedFlightConfig.departure_airport,
                    arrival_airport: updatedFlightConfig.arrival_airport,
                    departure_date: updatedFlightConfig.search_options.departure_date,
                    trip_type: updatedFlightConfig.search_options.trip_type,
                    adult: updatedFlightConfig.adult,
                    child: updatedFlightConfig.child,
                    infant: updatedFlightConfig.infant,
                    ...(updatedFlightConfig.search_options.return_date && { 
                        return_date: updatedFlightConfig.search_options.return_date 
                    })
                },
                route_info: {
                    departure: {
                        city: config.departureAirport.city,
                        airport_name: config.departureAirport.airport_name,
                        code: config.departureAirport.airport_code
                    },
                    arrival: {
                        city: config.arrivalAirport.city,
                        airport_name: config.arrivalAirport.airport_name,
                        code: config.arrivalAirport.airport_code
                    }
                },
                execution_stats: {
                    success: stats.success,
                    execution_time_ms: totalDuration,
                    execution_time_formatted: `${(totalDuration / 1000).toFixed(2)} seconds`,
                    steps_completed: stats.stepsCompleted,
                    screenshots_taken: stats.screenshotsTaken,
                    start_time: stats.startTime,
                    end_time: stats.endTime
                },
                results: crawlerResult.results || null,
                screenshots: crawlerResult.screenshots || [],
                timestamp: new Date().toISOString()
            }
        };

        if (crawlerResult.error) {
            apiResponse.error = crawlerResult.error;
        }

        // Log success message
        if (crawlerResult.success) {
            console.log('\n🎉 API Crawl Request Completed Successfully!');
            console.log('===========================================');
            console.log(`⏱️ Total execution time: ${(totalDuration / 1000).toFixed(2)} seconds`);
            console.log(`📸 Screenshots taken: ${crawlerResult.screenshots.length}`);
            console.log(`📊 Results: ${crawlerResult.results ? 'Available' : 'None'}`);
        }

        // Return response
        const statusCode = crawlerResult.success ? 200 : 500;
        return res.status(statusCode).json(apiResponse);

    } catch (error) {
        console.error('\n❌ Critical error in API crawl request!');
        console.error('=======================================');
        console.error(`🔥 Error: ${error.message}`);
        console.error(`📍 Stack trace: ${error.stack}`);

        const errorResponse = {
            success: false,
            error: error.message,
            message: 'Crawling request failed due to internal error',
            data: {
                execution_time_ms: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }
        };

        return res.status(500).json(errorResponse);

    } finally {
        // Cleanup - Always ensure browser is closed
        console.log('\n🧹 Cleanup and resource management...');
        
        if (browser) {
            try {
                await closeBrowser(browser);
                console.log('✅ Browser closed successfully');
            } catch (closeError) {
                console.error(`⚠️ Error closing browser: ${closeError.message}`);
            }
        }

        // Final summary
        const finalDuration = (Date.now() - startTime) / 1000;
        console.log('\n📋 API Request Summary');
        console.log('=====================');
        console.log(`🕒 Total runtime: ${finalDuration.toFixed(2)} seconds`);
        console.log(`⏰ Completed at: ${new Date().toISOString()}`);
    }
});

/**
 * GET /api/crawl/health
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
    const dbAvailable = await isDatabaseAvailable();
    
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'flight-prediction-monolith',
        database: {
            available: dbAvailable,
            status: dbAvailable ? 'connected' : 'unavailable',
            note: 'User searches saved to DB when available, batch crawls saved to file'
        }
    });
});

/**
 * GET /api/crawl/db-test
 * Test database connection and basic queries
 */
router.get('/db-test', async (req, res) => {
    try {
        const dbAvailable = await isDatabaseAvailable();
        
        if (!dbAvailable) {
            return res.status(503).json({
                success: false,
                message: 'Database is not available',
                timestamp: new Date().toISOString()
            });
        }
        
        // Test query to check tables
        const { default: pool } = await import('../../../web-app/server/src/config/database.js');
        
        const airportsCount = await pool.query('SELECT COUNT(*) FROM airports');
        const airlinesCount = await pool.query('SELECT COUNT(*) FROM airlines');
        const classesCount = await pool.query('SELECT COUNT(*) FROM new_classes');
        const schedulesCount = await pool.query('SELECT COUNT(*) FROM flight_schedules');
        const pricesCount = await pool.query('SELECT COUNT(*) FROM flight_prices');
        
        res.json({
            success: true,
            message: 'Database connection is working',
            tables: {
                airports: parseInt(airportsCount.rows[0].count),
                airlines: parseInt(airlinesCount.rows[0].count),
                classes: parseInt(classesCount.rows[0].count),
                schedules: parseInt(schedulesCount.rows[0].count),
                prices: parseInt(pricesCount.rows[0].count)
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Database test failed',
            timestamp: new Date().toISOString()
        });
    }
});

export default router;




