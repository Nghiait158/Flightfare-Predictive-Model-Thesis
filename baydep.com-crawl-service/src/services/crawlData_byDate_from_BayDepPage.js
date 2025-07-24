import { 
    safeClick,
} from '../utils/domUtils.js';
import { delay, DELAY_SHORT, DELAY_MEDIUM } from '../constants/constants.js';
import { appendToCsvFile } from '../utils/fileUtils.js';
import path from 'path';
import { RESULT_DIR } from '../constants/paths.js';

// import { RESULT_DIR } from '../constants/paths.js';
export async function crawlData_byDate_from_BayDepPage(page, dateString, departure_airport, arrival_airport, adult, child, infant, options = {}) {
    console.log("Crawl for date: "+dateString);
    console.log("Appear page to crawl");

    await page.waitForSelector('.fare-option', { timeout: 25000 });

    const priceElements = await page.$$('.fare-option-info .price .view-total-fare'); 

    if (priceElements.length > 0) {
        console.log(`✅ Prices are ready. Finded ${priceElements.length} prices.`);

        const firstPrice = await priceElements[0].evaluate(el => el.textContent.trim());
        console.log(`First Price: ${firstPrice}`);
    } else {
        throw new Error("Didn't find any price for this day");
    }

    let detailLinks = await page.$$('a.lnk-detail.show-detail');
    console.log(`Found ${detailLinks.length} link "Details"`);
    
    // Options for batch processing
    const batchSize = options.batchSize || 100; 
    const maxItems = options.maxItems || detailLinks.length;
    const fastMode = options.fastMode || false; // Reduce delays for speed
    
    const itemsToProcess = Math.min(maxItems, detailLinks.length);
    console.log(`📊 Will process ${itemsToProcess} items in batches of ${batchSize}`);
    
    const timeStartCrawl= Date.now();
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3; // Reduced threshold
    let successfulCrawls = 0;
    const allFlightsData = [];

    for (let i=0; i< itemsToProcess; i++){
        // console.log(`Clicking on detail link ${i + 1}/${itemsToProcess}`);
        
        // Batch processing - pause and refresh between batches
        if (i > 0 && i % batchSize === 0) {
            const batchNumber = Math.floor(i / batchSize);
            console.log(`🔄 Completed batch ${batchNumber}, refreshing links and taking a break...`);
            
            // Refresh detailLinks array to prevent stale elements
            try {
                detailLinks = await page.$$('a.lnk-detail.show-detail');
                console.log(`🔄 Refreshed links, found ${detailLinks.length} elements`);
            } catch (refreshError) {
                console.error(`❌ Error refreshing links: ${refreshError.message}`);
            }
            await delay(1000);//10000 
        }
        
        // Skip if index exceeds array length
        if (i >= detailLinks.length) {
            console.log(`⚠️ Index ${i} exceeds array length ${detailLinks.length}, skipping...`);
            continue;
        }
        
        // Thêm delay nhỏ hơn giữa các clicks nếu fast mode
        if (i > 0) {
            await delay(fastMode ? DELAY_MEDIUM : 500);
        }
        
        try {
            // Check if element is still valid and refresh if needed
            try {
                await detailLinks[i].boundingBox(); // Test if element is still valid
            } catch (staleError) {
                console.log(`🔄 Element ${i} is stale, refreshing links...`);
                detailLinks = await page.$$('a.lnk-detail.show-detail');
                
                if (i >= detailLinks.length) {
                    console.log(`⚠️ Item ${i} no longer exists after refresh`);
                    continue;
                }
            }
            
            // Thêm timeout cho click operation với fallback
            try {
                // Ensure element is in view and click with a longer timeout
                await detailLinks[i].scrollIntoViewIfNeeded();
                await Promise.race([
                    detailLinks[i].click({ delay: 100 }), // Add small delay to mimic human behavior
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Click timeout')), 20000)) // Increased timeout
                ]);
                // console.log("Clicked open details successful");
            } catch (clickError) {
                // Fallback: Use page.evaluate to click
                console.log(`🔄 Element click failed, trying alternative method...`);
                await page.evaluate((index) => {
                    const links = document.querySelectorAll('a.lnk-detail.show-detail');
                    if (links[index]) {
                        links[index].scrollIntoView(); // Scroll into view in browser context
                        links[index].click();
                        return true;
                    }
                    return false;
                }, i);
                console.log("Clicked open details successful (fallback method)");
            }
            
            // Đợi một chút để details load - optimized
            await delay(fastMode ? DELAY_MEDIUM : 1000);

            // Thêm verification rằng details panel đã mở
            try {
                await page.waitForSelector('.flight-detail-info', { timeout: fastMode ? 8000 : 15000 });
                // console.log("Details panel loaded successfully");
            } catch (waitError) {
                console.log("Details panel not loaded, continuing...");
            }

            // Crawl data với delay tối ưu
            await delay(fastMode ? DELAY_MEDIUM : 3000);
            
            // Crawl thông tin chi tiết chuyến bay từ details panel
            const flightDetails = await page.evaluate((index) => {
                const details = {};
                
                // Crawl Depart Time  
                const departTimeElement = document.querySelector('.depart .hour');
                details.depart_time = departTimeElement ? departTimeElement.textContent.trim() : null;
                
                // Crawl Arrival Time
                const arrivalTimeElement = document.querySelector('.arrival .hour');
                details.arrival_time = arrivalTimeElement ? arrivalTimeElement.textContent.trim() : null;
                
                // Crawl Flight date
                const flightDateElement = document.querySelector('.depart .date');
                if (flightDateElement) {
                    const dateText = flightDateElement.textContent.trim(); // "12/07/2025"
                    const dateParts = dateText.split('/');
                    if (dateParts.length === 3) {
                        const day = dateParts[0].padStart(2, '0');
                        const month = dateParts[1].padStart(2, '0');
                        const year = dateParts[2];
                        details.flight_date = `${year}-${month}-${day}T00:00:00.000Z`;
                    } else {
                        details.flight_date = null;
                    }
                } else {
                    details.flight_date = null;
                }
                
                // Crawl Dep airpot
                const departAirportElement = document.querySelector('.depart .airport-code');
                details.departure_airport = departAirportElement ? departAirportElement.textContent.trim().replace(/[()]/g, '') : null;
                
                // Crawl Arrival airpot
                const arrivalAirportElement = document.querySelector('.arrival .airport-code');
                details.arrival_airport = arrivalAirportElement ? arrivalAirportElement.textContent.trim().replace(/[()]/g, '') : null;
                
                // Crawl air_craft type, flight number, classes
                const flightDetailInfo = document.querySelector('.flight-detail-info');
                if (flightDetailInfo) {
                    const infoText = flightDetailInfo.innerHTML;
                    
                    const flightNumberMatch = infoText.match(/Chuyến bay:\s*<strong>(.+?)<\/strong>/);
                    details.flight_number = flightNumberMatch ? flightNumberMatch[1].trim() : null;
                    
                    const planeTypeMatch = infoText.match(/Máy bay:\s*<strong>(.+?)<\/strong>/);
                    details.type_of_plane = planeTypeMatch ? planeTypeMatch[1].trim() : null;
                    
                    const classMatch = infoText.match(/Hạng chỗ:\s*<strong>(.+?)<\/strong>/);
                    details.classes = classMatch ? classMatch[1].trim() : null;
                }
                
                // Crawl prices
                const fareOptions = document.querySelectorAll('.fare-option');
                const currentFareOption = fareOptions[index];

                if (currentFareOption) {
                    const priceElement = currentFareOption.querySelector('.view-total-fare');
                    if (priceElement) {
                        const priceText = priceElement.textContent.trim(); // "2.405.000"
                        details.price = priceText.replace(/\./g, ''); // "2405000"
                    } else {
                        details.price = null;
                    }
                } else {
                    details.price = null;
                }
                
                return details;
            }, i);
            
            // console.log(`Flight ${i + 1} details:`, flightDetails);
            // Đóng details với timeout protection và fallback
            try {
                const closeDetailLink = await page.$('a.lnk-detail.show-detail.active');
                if (closeDetailLink) {
                    try {
                        await Promise.race([
                            closeDetailLink.click(),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Close click timeout')), 10000))
                        ]);
                        // console.log("Clicked close details successful");
                    } catch (closeClickError) {
                        // Fallback: Use page.evaluate to close
                        console.log(`🔄 Close click failed, trying alternative method...`);
                        await page.evaluate(() => {
                            const activeLink = document.querySelector('a.lnk-detail.show-detail.active');
                            if (activeLink) {
                                activeLink.click();
                                return true;
                            }
                            return false;
                        });
                        console.log("Clicked close details successful (fallback method)");
                    }
                } else {
                    console.log("Could not find active detail link to close");
                }
            } catch (closeError) {
                console.error(`Error closing details: ${closeError.message}`);
            }

            // Chuẩn bị dữ liệu để lưu vào CSV
            const flightData = {
                flight_number: flightDetails.flight_number,
                aircraft_type: flightDetails.type_of_plane,
                departure_airport: flightDetails.departure_airport,
                arrival_airport: flightDetails.arrival_airport,
                flight_date: flightDetails.flight_date,
                departure_time: flightDetails.depart_time,
                arrival_time: flightDetails.arrival_time,
                classes: flightDetails.classes,
                price: flightDetails.price,
                adult: adult,
                child: child,
                infant: infant
            };
            allFlightsData.push(flightData);

            // Delay tối ưu giữa các flight
            await delay(fastMode ? DELAY_MEDIUM : 300);
            
            // Reset consecutive errors khi thành công
            consecutiveErrors = 0;
            successfulCrawls++;
            console.log(`✅ Successfully crawled ${successfulCrawls}/${itemsToProcess} flights`);

        } catch (error) {
            console.error(`❌ Error with detail link ${i + 1}/${itemsToProcess}: ${error.message}`);
            consecutiveErrors++;
            
            // Log debug info
            console.log(`📊 Debug info: consecutiveErrors=${consecutiveErrors}, detailLinks.length=${detailLinks.length}`);
            
            // Nếu có quá nhiều lỗi liên tiếp, refresh và tạm dừng
            if (consecutiveErrors >= maxConsecutiveErrors) {
                console.warn(`⚠️ Too many consecutive errors (${consecutiveErrors}), refreshing page elements...`);
                
                // Refresh detailLinks array
                try {
                    detailLinks = await page.$$('a.lnk-detail.show-detail');
                    console.log(`🔄 Refreshed links, found ${detailLinks.length} elements`);
                    
                    // Update itemsToProcess if needed
                    if (detailLinks.length < itemsToProcess) {
                        console.log(`⚠️ Items reduced from ${itemsToProcess} to ${detailLinks.length}`);
                    }
                } catch (refreshError) {
                    console.error(`❌ Error refreshing links: ${refreshError.message}`);
                }
                
                // Take a longer break
                await delay(15000); // Dừng 15 giây
                consecutiveErrors = 0;
            } else {
                // Thêm delay khi có lỗi để tránh spam
                await delay(DELAY_MEDIUM);
            }
            
            // Tiếp tục với item tiếp theo thay vì dừng
            continue;
        }
        
    }

    if (allFlightsData.length > 0) {
        try {
            // const csvFilePath = path.join(process.cwd(), 'result', 'flight_price_history.csv');
            const csvFilePath = path.join(RESULT_DIR, 'flight_price_history.csv');
            await appendToCsvFile(csvFilePath, allFlightsData);
            console.log(`✅ Saved ${allFlightsData.length} flights data to CSV`);
        } catch (csvError) {
            console.error(`Error saving CSV for all flights: ${csvError.message}`);
        }
    }


    const timeEndCrawl= Date.now();
    console.log(`⏱️ Time crawl: ${timeEndCrawl - timeStartCrawl} ms`);
    console.log(`📊 Summary: Successfully crawled ${successfulCrawls}/${itemsToProcess} flights (${((successfulCrawls/itemsToProcess)*100).toFixed(1)}%)`);
    
    if (fastMode) {
        console.log(`🚀 Fast mode was enabled - reduced delays for speed optimization`);
    }

    return { 
        daily_results: allFlightsData,
        summary: {
            successfulCrawls,
            itemsToProcess
        }
    };
}
