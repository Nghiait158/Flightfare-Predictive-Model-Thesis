//  endpoint to crawl/scraping flight data from VietNamAirlines

import express from 'express';
import fs from 'fs';
import path from 'path';

// Import crawling utilities and services
import { clearDirectory } from './src/utils/fileUtils.js';
import { loadFlightConfig } from './src/config/loadConfig.js';

import { 
    closeBrowser,
    launchBrowser, 
    setupBrowserLogging, 
    takeScreenshot 
} from './src/utils/browserUtils.js';

import { 
    runCrawler, 
    runCrawlerWithRetry, 
    validateCrawlerConfig, 
    getCrawlerStats 
} from './src/services/crawlerService.js';

import { SCREENSHOT_DIR, FLIGHT_CONFIG_PATH, RESULT_DIR } from './src/constants/paths.js';
import { BROWSER_CONFIG, delay } from './src/constants/constants.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Constants
const MAX_RETRIES = 3;
const BASE_URL = '';
// Health check endpoint
app.get('/check-health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'baydep.com-crawl-service'
    });
});

// Main crawling endpoint
app.post('/api/v1/crawl/baydep.com', async (req, res) => {
    const startTime = Date.now();
    let browser = null;
    let page = null;
    let config = null;
    let crawlerResult = null;
    let stats = null;

    try {
        console.log('API Crawl baydep.com Request Started');
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


        // Clear screenshots if requested
        if (clear_screenshots) {
            try {
                clearDirectory(SCREENSHOT_DIR);
                // console.log('📸 Screenshots directory cleared');
            } catch (error) {
                console.warn(`⚠️ Failed to clear screenshots directory: ${error.message}`);
            }
        }

        // Load flight configuration and airports
        config = await loadFlightConfig();
        
        // console.log(`📋 Configuration loaded:`);
        // console.log(`   • Route: ${config.flightConfig.departure_airport} → ${config.flightConfig.arrival_airport}`);
        // console.log(`   • Departure: ${config.departureAirport.city} (${config.departureAirport.airport_name})`);
        // console.log(`   • Arrival: ${config.arrivalAirport.city} (${config.arrivalAirport.airport_name})`);
        // console.log(`   • Adult: ${config.flightConfig.adult} `);
        // console.log(`   • Child: ${config.flightConfig.child}`);
        // console.log(`   • Infant: ${config.flightConfig.infant}`);
        
        // Validate crawler configuration
        validateCrawlerConfig({
            flightConfig: config.flightConfig,
            airports: config.airports
        });

        // Launch browser
        console.log('Launching browser...');
        const browserResult = await launchBrowser();
        browser = browserResult.browser;
        page = browserResult.page;
        
        console.log('✅ Browser launched successfully');
        console.log(`   • Headless: ${BROWSER_CONFIG.HEADLESS}`);
        console.log(`   • Viewport: ${JSON.stringify(await page.viewport())}`);

        // Setup browser logging
        setupBrowserLogging(page);

        // Run crawler
        if (use_retry) {
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
            crawlerResult = await runCrawler(page, {
                flightConfig: config.flightConfig,
                airports: config.airports
            });
        }

        // Generate statistics
        stats = getCrawlerStats(crawlerResult);

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

        // Return response
        const statusCode = crawlerResult.success ? 200 : 500;
        return res.status(statusCode).json(apiResponse);

    } catch (error) {
        console.error('\n❌ Critical error in API crawl request!');
        console.error(`🔥 Error: ${error.message}`);
        console.error(`📍 Stack trace: ${error.stack}`);

        // Try to take error screenshot if page is available
        if (page) {
            try {
                const errorScreenshot = await takeScreenshot(page, 'api-error');
                console.error(`📸 Error screenshot saved: ${errorScreenshot}`);
            } catch (screenshotError) {
                console.error(`📸 Failed to take error screenshot: ${screenshotError.message}`);
            }
        }

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
            console.log(`🕒 Runtime: ${finalDuration} seconds`);
            console.log(`⏰ Completed at: ${new Date().toISOString()}`);
        } else {
            const errorMsg = crawlerResult ? crawlerResult.error : "A critical error occurred before crawling could complete.";
            console.error(`\n❌ Crawl FAILED. Error: ${errorMsg}`);
            console.error(`🕒 Runtime: ${finalDuration} seconds`);
        }
    }
});

/**
 * Get current flight configuration
 */
app.get('/api/v1/config/flight', async (req, res) => {
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

//  Error handling middleware

app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: error.message,
        message: 'Internal server error'
    });
});

// 404 handler

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        message: 'The requested endpoint does not exist',
        available_endpoints: {
            'POST /api/v1/crawl/baydep.com': 'Main crawling endpoint',
            'GET /api/v1/config/flight': 'Get current flight configuration',
            'GET /health': 'Health check'
        }
    });
});

// Start server
 
app.listen(PORT, () => {
    console.log('🚀 Baydep.vn Crawl Service API Server Started');
    console.log('==========================================');
    console.log(`🌐 Server running on port: ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 Main endpoint: http://localhost:${PORT}/api/v1/crawl/baydep.com`);
    console.log(`🔗 Config endpoint: http://localhost:${PORT}/api/v1/config/flight`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log('==========================================');
});

export default app;
