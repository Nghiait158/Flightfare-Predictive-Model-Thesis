import fs from 'fs';
import path from 'path';
import { delay, DELAY_SHORT, DELAY_MEDIUM } from '../constants/constants.js';
import {
    waitForVisible, 
} from '../utils/domUtils.js';
import { crawlData_byDate_from_BayDepPageV2 } from './crawlData_byDate_from_BayDepPageV2.js';
import { appendToJsonFile } from '../utils/fileUtils.js';
import { RESULT_DIR } from '../constants/paths.js';


// Gets flight results using crawler script injection or fallback methods
async function scrollToBottom(page) {
    console.log('🔄 Starting progressive scroll to bottom...');
    
    let previousHeight = 0;
    let currentHeight = await page.evaluate(() => document.body.scrollHeight);
    let scrollAttempts = 0;
    const maxScrollAttempts = 20; // Giới hạn số lần scroll
    
    while (previousHeight !== currentHeight && scrollAttempts < maxScrollAttempts) {
        previousHeight = currentHeight;
        
        // Scroll down by chunks
        await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
        });
        
        // Wait for content to load
        await delay(1000);
        
        // Check new height
        currentHeight = await page.evaluate(() => document.body.scrollHeight);
        scrollAttempts++;
        
        console.log(`📍 Scroll attempt ${scrollAttempts}: ${previousHeight} → ${currentHeight}`);
    }
    
    // Final scroll to absolute bottom
    await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
    });
    
    console.log(`✅ Completed scrolling to bottom after ${scrollAttempts} attempts.`);
}

async function extractResultsManually(page) {
    try {
        console.log('🔍 Manually extracting flight results...');
        
        // Wait for results container
        const resultsVisible = await waitForVisible(page, '.flight-results', 5000);
        if (!resultsVisible) {
            console.log('⚠️ No flight results container found');
            return null;
        }
        
        // Extract basic flight information
        const results = await page.evaluate(() => {
            const flightElements = document.querySelectorAll('.flight-item, .flight-card, [class*="flight"]');
            const flights = [];
            
            flightElements.forEach((element, index) => {
                const flightInfo = {
                    index: index + 1,
                    text: element.textContent?.trim() || '',
                    price: extractPrice(element),
                    time: extractTime(element),
                    duration: extractDuration(element)
                };
                
                if (flightInfo.text) {
                    flights.push(flightInfo);
                }
            });
            
            function extractPrice(element) {
                const pricePatterns = [
                    /[\d,]+\s*(?:VND|₫|VNĐ)/gi,
                    /[\d,]+/g
                ];
                
                const text = element.textContent || '';
                for (const pattern of pricePatterns) {
                    const match = text.match(pattern);
                    if (match) return match[0];
                }
                return null;
            }
            
            function extractTime(element) {
                const timePattern = /\d{2}:\d{2}/g;
                const text = element.textContent || '';
                return text.match(timePattern) || [];
            }
            
            function extractDuration(element) {
                const durationPattern = /\d+h\s*\d*m?/gi;
                const text = element.textContent || '';
                const match = text.match(durationPattern);
                return match ? match[0] : null;
            }
            
            return {
                timestamp: new Date().toISOString(),
                source: 'manual_extraction',
                total_flights: flights.length,
                flights: flights
            };
        });
        
        if (results.total_flights > 0) {
            console.log(`✅ Manually extracted ${results.total_flights} flights`);
            return results;
        } else {
            console.log('⚠️ No flights found in manual extraction');
            return null;
        }
        
    } catch (error) {
        console.error('❌ Error in manual extraction:', error.message);
        return null;
    }
}


async function getBasicPageInfo(page) {
    try {
        const pageInfo = await page.evaluate(() => {
            return {
                timestamp: new Date().toISOString(),
                source: 'basic_page_info',
                url: window.location.href,
                title: document.title,
                page_text: document.body.textContent?.substring(0, 1000) || '',
                has_results: document.querySelector('.flight-results, .flight-item, [class*="flight"]') !== null
            };
        });
        
        console.log('📄 Basic page info collected');
        return pageInfo;
        
    } catch (error) {
        console.error('❌ Error getting basic page info:', error.message);
        return {
            timestamp: new Date().toISOString(),
            source: 'error_fallback',
            error: error.message
        };
    }
}

export async function performFlightSearch_BayDep(page, departureAirport, arrivalAirport, searchOptions = {}, adult, child, infant) {
    const {
        departure_date = 'today',
        return_date = null,
        trip_type = 'oneway'
    } = searchOptions;
    
    const searchResult = {
        success: false,
        departureAirport: departureAirport.city,
        arrivalAirport: arrivalAirport.city,
        selectedDate: departure_date,
        returnDate: return_date,
        tripType: trip_type,
        results: null,
        error: null,
        adult: adult,
        child: child,
        infant: infant,
    };

    try {
        // console.log('Starting Crawling flight ticket');
        let scriptResults = null;

        try {
            console.log('Appeared page for scraping');
            
            await delay(16000);
            await scrollToBottom(page);
            console.log('waiting----10000ms');
            
            // await delay(10000);

            scriptResults = await crawlData_byDate_from_BayDepPageV2(page, departure_date, departureAirport, arrivalAirport, adult, child, infant, { fastMode: true, batchSize: 50 });
            
        } catch (error) {
            console.error('❌ Error executing crawler script:', error.message);
        }

        if (scriptResults && scriptResults.daily_results && scriptResults.daily_results.length > 0) {
            console.log('✅ Results obtained via crawler script');
            console.log(`📊 Found ${scriptResults.daily_results.length} price records`);
            
            const historyFilePath = path.join(RESULT_DIR, 'flight_price_history.json');
            appendToJsonFile(historyFilePath, scriptResults);

            searchResult.results = scriptResults;
        } else {
            console.log('🔄 Crawler script did not return prices, falling back to manual extraction...');
            const manualResults = await extractResultsManually(page);
            if (manualResults) {
                console.log('✅ Results obtained via manual extraction');
                searchResult.results = manualResults;
            } else {
                console.log('⚠️ Using basic page information as final fallback');
                searchResult.results = await getBasicPageInfo(page);
            }
        }
        
        searchResult.success = true;
        console.log('🎉 Flight search completed successfully!');
        return searchResult;
        
    } catch (error) {
        console.error('❌ Flight search failed:', error.message);
        searchResult.error = error.message;
        return searchResult;
    }
} 