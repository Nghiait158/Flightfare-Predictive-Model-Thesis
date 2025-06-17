/**
 * @fileoverview Crawl flight data from VietJet page using Puppeteer clicks.
 * This version uses a robust strategy to find and click each price option,
 * then scrapes the booking details panel.
 */

import { DELAY_SHORT } from '../constants/constants.js';

/**
 * Finds all clickable price option containers on the page.
 * This function is designed to be executed in the browser context via page.evaluate.
 * @returns {Array<HTMLElement>} An array of clickable price container elements.
 */
function findClickablePriceOptions() {
    const options = [];
    // Select all divs on the page. This is a broad starting point.
    const allDivs = document.querySelectorAll('div');

    allDivs.forEach(div => {
        // A price container typically has two <p> tags as direct children.
        if (div.children.length >= 2 && div.children[0].tagName === 'P' && div.children[1].tagName === 'P') {
            const p1 = div.children[0];
            const p2 = div.children[1];

            const p1Text = p1.textContent.trim();
            const p2Text = p2.textContent.trim();

            // Check if the text content matches the price pattern (e.g., "1,290" and "000 ").
            if (/^[\d,]+$/.test(p1Text) && p2Text.includes('')) {
                // The parent of this div is the actual clickable element.
                const clickableContainer = div.parentElement;
                
                // Ensure the container is valid and not already added.
                if (clickableContainer && clickableContainer.tagName === 'DIV' && !options.includes(clickableContainer)) {
                    // A valid container should also have a sibling element for the dropdown arrow, often a <span>.
                    if (clickableContainer.children.length > 1) {
                         options.push(clickableContainer);
                    }
                }
            }
        }
    });
    return options;
}


/**
 * Extracts flight details from the booking information panel.
 * This function is designed to be executed in the browser context via page.evaluate.
 * @param {Object} departure_airport - The departure airport object.
 * @param {Object} arrival_airport - The arrival airport object.
 * @returns {Object|null} An object with the extracted flight data or null if extraction fails.
 */
function extractBookingDetails(departure_airport, arrival_airport) {
    // The booking info is consistently in the 4th column of the main grid.
    const bookingInfoContainer = document.querySelector('div.MuiGrid-grid-md-4');
    if (!bookingInfoContainer) return null;

    let total_price = null;
    
    // Find total price by looking for the "Tổng tiền" label.
    const h4Elements = bookingInfoContainer.querySelectorAll('h4');
    for (const h4 of h4Elements) {
        if (h4.textContent.trim().includes('Tổng tiền')) {
            const priceEl = h4.nextElementSibling;
            if (priceEl && priceEl.textContent.trim() !== '0 ') {
                total_price = priceEl.textContent.trim();
                break;
            }
        }
    }
    
    // Fallback: If "Tổng tiền" is 0 or not found, try getting the price from the "Chuyến đi" section.
    if (!total_price || total_price === '0 ') {
        const tripPriceEl = Array.from(bookingInfoContainer.querySelectorAll('h4')).find(el => 
            el.textContent.includes('') && 
            el.previousElementSibling && 
            el.previousElementSibling.textContent.includes('Chuyến đi')
        );
        if (tripPriceEl) total_price = tripPriceEl.textContent.trim();
    }
    
    // If no valid price is found, abort.
    if (!total_price || total_price === '0') return null;

    let flight_number = null, departure_time = null, arrival_time = null, classes = null;

    const detailsText = bookingInfoContainer.textContent;
    // Use regex to find flight number (VJxxxx), times, and class.
    const timeMatch = detailsText.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    if (timeMatch) {
        [ , departure_time, arrival_time] = timeMatch;
    }

    const flightMatch = detailsText.match(/(VJ\d+)/);
    if (flightMatch) flight_number = flightMatch[1];

    const classMatch = detailsText.match(/(Skyboss|Business|Deluxe|Eco)/);
    if (classMatch) classes = classMatch[1];
    
    // Clean price: remove commas and VND
    let cleaned_price = null;
    if (total_price) {
        cleaned_price = total_price
            .replace(/,/g, '') // Remove commas
            .replace(/\s*VND\s*/g, '') // Remove VND and surrounding spaces
            .replace(/\s*₫\s*/g, '') // Remove Vietnamese dong symbol if present
            .trim();
    }
    
    return {
        flight_number,
        departure_airport: departure_airport.code,
        arrival_airport: arrival_airport.code,
        departure_time,
        arrival_time,
        classes,
        total_price: cleaned_price
    };
}

/**
 * Crawls VietJet flight data by clicking on price elements using Puppeteer.
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @param {string} dateString - The date string for the flight search.
 * @param {Object} departure_airport - Departure airport object with code property.
 * @param {Object} arrival_airport - Arrival airport object with code property.
 * @returns {Promise<Object>} Flight data results.
 */
export async function crawlData_byDate_from_VietJetPage(page, dateString, departure_airport, arrival_airport) {
    const allResults = [];
    
    // Parse DD/MM/YYYY format
    const parts = dateString.split('/');
    const startDay = parseInt(parts[0]);
    const startMonth = parseInt(parts[1]) - 1; // Month is 0-indexed in Date
    const startYear = parseInt(parts[2]);
    
    // Build a map of flight numbers to aircraft types from the main list.
    const aircraftTypeMap = await page.evaluate(() => {
        const flightAircraftMap = {};
        // Find all spans that look like flight numbers. This is a stable starting point.
        const flightSpans = Array.from(document.querySelectorAll('span')).filter(s => s.textContent.trim().match(/^VJ\d{3,4}$/));

        flightSpans.forEach(flightSpan => {
            const flightNumber = flightSpan.textContent.trim();
            let aircraftType = null;
            
            // Heuristic to find the container for a single flight's info.
            // We traverse up the DOM tree from the flight number span until we find an element
            // that also contains the text "Bay thẳng" (Direct Flight), which is a reliable
            // marker for a flight row in Vietjet's UI. We limit the search to 8 levels up
            // to prevent scanning the entire page.
            let current = flightSpan;
            let container = null;
            for (let i = 0; i < 8; i++) {
                if (!current.parentElement) break;
                current = current.parentElement;
                const text = current.textContent || '';
                // Check if the container has both the flight number and the direct flight marker.
                if (text.includes('Bay thẳng') && text.includes(flightNumber)) {
                    container = current;
                    break;
                }
            }

            if (container) {
                // Once we have the flight container, we find a span within it that looks like an
                // aircraft type (e.g., starts with "Airbus" or "Boeing").
                const spansInContainer = Array.from(container.querySelectorAll('span'));
                const aircraftSpan = spansInContainer.find(s => /^(Airbus|Boeing)/i.test(s.textContent.trim()));
                if (aircraftSpan) {
                    // Extract only the aircraft name, removing extra text like "- Bay thẳng"
                    aircraftType = aircraftSpan.textContent.trim().split('-')[0].trim();
                }
            }
            
            if (flightNumber && aircraftType) {
                flightAircraftMap[flightNumber] = aircraftType;
            }
        });
        return flightAircraftMap;
    });

    console.log('✈️ Aircraft Type Map:', aircraftTypeMap);
    
    const startDate = new Date(startYear, startMonth, startDay);
    const currentMonth = startDate.getMonth();
    const currentYear = startDate.getFullYear();
    
    // Calculate the last day of the month (30 or 31 depending on the month)
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const endDay = Math.min(30, lastDayOfMonth); // Stop at day 30 or last day of month if less than 30
    
    console.log(`🚀 Starting crawl from day ${startDate.getDate()} to day ${endDay} of month ${currentMonth + 1}/${currentYear}`);
    
    let currentDateToCrawl = dateString;
    let dayCounter = startDate.getDate();
    
    while (dayCounter <= endDay) {
        console.log(`\n📅 CRAWLING DATA FOR: ${currentDateToCrawl} (Day ${dayCounter})`);
        
        const results = {
            timestamp: new Date().toISOString(),
            search_date: currentDateToCrawl,
            departure_airport: departure_airport?.code,
            arrival_airport: arrival_airport?.code,
            source: 'vietjet_by_date_puppeteer_v3',
            total_flights: 0,
            prices: [],
            errors: []
        };

        // ----------------------------------------------------------------------------------
        
        try {
            await page.waitForSelector('.MuiBox-root', { timeout: 25000 });
            
            await page.waitForSelector('p.MuiTypography-h4.MuiTypography-colorTextPrimary', { timeout: 25000 });
            
            const priceElements = await page.$$('p.MuiTypography-h4.MuiTypography-colorTextPrimary');
            
            if (priceElements.length > 0) {
                console.log(`✅ Phần giá đã sẵn sàng. Tìm thấy ${priceElements.length} giá.`);
            } else {
                throw new Error("Không tìm thấy phần tử giá nào");
            }
            
        } catch (e) {
            results.errors.push("Timeout: Could not find any prices on the page.");
            console.error("❌ Timeout: Could not find any prices on the page.");
            allResults.push(results);
            
            // Try to go to next day even if current day failed
            if (dayCounter < endDay) {
                await goToNextDay(page);
                dayCounter++;
                currentDateToCrawl = getNextDateString(currentDateToCrawl);
            }
            continue;
        }

        // ----------------------------------------------------------------------------------

        const priceOptionsCount = await page.evaluate(`(${findClickablePriceOptions.toString()})().length`);
        
        if (priceOptionsCount === 0) {
            results.errors.push("No clickable price options found.");
            console.warn("⚠️ No clickable price options were found on the page.");
            allResults.push(results);
            
            // Try to go to next day even if no prices found
            if (dayCounter < endDay) {
                await goToNextDay(page);
                dayCounter++;
                currentDateToCrawl = getNextDateString(currentDateToCrawl);
            }
            continue;
        }
        
        console.log(`FOUND ${priceOptionsCount} clickable price options.`);

        
        for (let i = 0; i < priceOptionsCount; i++) {
            console.log(`PROCESSING PRICE OPTION ${i + 1}/${priceOptionsCount}`);
            
            // First, get the price from the clickable element before clicking
            const priceInfo = await page.evaluate((evalFunction, index) => {
                const options = eval(`(${evalFunction})()`);
                if (options[index]) {
                    // Extract price from the clicked element
                    const priceContainer = options[index];
                    const priceParts = priceContainer.querySelectorAll('p');
                    let clickedPrice = null;
                    
                    if (priceParts.length >= 2) {
                        const priceNumber = priceParts[0].textContent.trim();
                        const priceCurrency = priceParts[1].textContent.trim();
                        clickedPrice = `${priceNumber}${priceCurrency}`;
                    }
                    
                    // Click the option
                    options[index].click();
                    return {
                        clicked: true,
                        clickedPrice: clickedPrice
                    };
                }
                return { clicked: false, clickedPrice: null };
            }, findClickablePriceOptions.toString(), i);

            if (!priceInfo.clicked) {
                console.warn(`Could not click price option ${i}.`);
                results.errors.push(`Failed to click price option ${i}.`);
                continue;
            }

            // Wait for the booking details panel to update after the click
            await new Promise(resolve => setTimeout(resolve, DELAY_SHORT)); 

            // Extract comprehensive flight data including the clicked price
            const flightData = await page.evaluate((departure_airport, arrival_airport, clickedPrice, aircraftTypeMap) => {
                // The booking info is consistently in the 4th column of the main grid
                const bookingInfoContainer = document.querySelector('div.MuiGrid-grid-md-4');
                if (!bookingInfoContainer) return null;

                // Extract total price (Tổng tiền)
                let total_price = null;
                const h4Elements = bookingInfoContainer.querySelectorAll('h4');
                for (const h4 of h4Elements) {
                    if (h4.textContent.trim().includes('Tổng tiền')) {
                        const priceEl = h4.nextElementSibling;
                        if (priceEl && priceEl.textContent.trim() !== '0') {
                            total_price = priceEl.textContent.trim();
                            break;
                        }
                    }
                }
                
                // Fallback: If "Tổng tiền" is 0 or not found, try getting the price from the "Chuyến đi" section
                if (!total_price || total_price === '0 ') {
                    const tripPriceEl = Array.from(bookingInfoContainer.querySelectorAll('h4')).find(el => 
                        el.textContent.includes('') && 
                        el.previousElementSibling && 
                        el.previousElementSibling.textContent.includes('Chuyến đi')
                    );
                    if (tripPriceEl) total_price = tripPriceEl.textContent.trim();
                }
                
                // If no valid total price is found, abort
                if (!total_price || total_price === '0 ') return null;

                // Extract detailed flight information
                let flight_number = null;
                let departure_time = null;
                let arrival_time = null;
                let classes = null;
                let departure_date = null;
                let aircraft_type = null;

                const detailsText = bookingInfoContainer.textContent;
                
                // Extract flight number (VJxxxx)
                const flightMatch = detailsText.match(/(VJ\d+)/);
                if (flightMatch) flight_number = flightMatch[1];

                // Look up aircraft type from the map
                if (flight_number && aircraftTypeMap[flight_number]) {
                    aircraft_type = aircraftTypeMap[flight_number];
                }

                // Extract departure and arrival times (HH:MM - HH:MM)
                const timeMatch = detailsText.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
                if (timeMatch) {
                    departure_time = timeMatch[1];
                    arrival_time = timeMatch[2];
                }

                // Extract flight class (Eco, Business, Deluxe, Skyboss)
                const classMatch = detailsText.match(/(Skyboss|Business|Deluxe|Eco)/i);
                if (classMatch) classes = classMatch[1];

                // Extract departure date (format: T6, 20/06/2025)
                const dateMatch = detailsText.match(/T\d+,\s*(\d{2}\/\d{2}\/\d{4})/);
                if (dateMatch) departure_date = dateMatch[1];

                // Extract individual price components
                let ticket_price = null;
                let tax_fee = null;
                let service_fee = null;

                // Get ticket price (Giá vé)
                const ticketPriceEl = Array.from(bookingInfoContainer.querySelectorAll('h4')).find(el => 
                    el.previousElementSibling && 
                    el.previousElementSibling.textContent.includes('Giá vé')
                );
                if (ticketPriceEl) ticket_price = ticketPriceEl.textContent.trim();

                // Get tax and fees (Thuế, phí)
                const taxFeeEl = Array.from(bookingInfoContainer.querySelectorAll('h4')).find(el => 
                    el.previousElementSibling && 
                    el.previousElementSibling.textContent.includes('Thuế, phí')
                );
                if (taxFeeEl) tax_fee = taxFeeEl.textContent.trim();

                // Get service fee (Dịch vụ)
                const serviceFeeEl = Array.from(bookingInfoContainer.querySelectorAll('h4')).find(el => 
                    el.previousElementSibling && 
                    el.previousElementSibling.textContent.includes('Dịch vụ')
                );
                if (serviceFeeEl) service_fee = serviceFeeEl.textContent.trim();

                // Convert flight_date to ISO string
                let iso_flight_date = null;
                if (departure_date) {
                    const dateParts = departure_date.split('/');
                    if (dateParts.length === 3) {
                        const day = parseInt(dateParts[0]);
                        const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed in Date
                        const year = parseInt(dateParts[2]);
                        const dateObj = new Date(year, month, day);
                        iso_flight_date = dateObj.toISOString();
                    }
                }

                // Clean price: remove commas and VND
                let cleaned_price = null;
                if (total_price) {
                    cleaned_price = total_price
                        .replace(/,/g, '') // Remove commas
                        .replace(/\s*VND\s*/g, '') // Remove VND and surrounding spaces
                        .replace(/\s*₫\s*/g, '') // Remove Vietnamese dong symbol if present
                        .trim();
                }

                return {
                    flight_number,
                    departure_airport: departure_airport.code,
                    arrival_airport: arrival_airport.code,
                    flight_date: iso_flight_date,
                    departure_date,
                    departure_time,
                    arrival_time,
                    total_price: cleaned_price,
                    classes,
                    aircraft_type,
                    // ticket_price,
                    // tax_fee,
                    // service_fee,
                    // clicked_price: clickedPrice // Price from the clicked element
                };
            }, departure_airport, arrival_airport, priceInfo.clickedPrice, aircraftTypeMap);
            
            if (flightData && flightData.total_price) {
                // console.log("✅ EXTRACTED COMPREHENSIVE DATA:", JSON.stringify(flightData, null, 2));
                results.prices.push(flightData);
            } else {
                console.warn(`⚠️ FAILED to extract booking details for price option ${i}`);
                results.errors.push(`Failed to extract booking details for price option ${i}`);
            }
        }

        results.total_flights = new Set(results.prices.map(p => p.flight_number)).size;
        console.log(`✅ Crawling completed for ${currentDateToCrawl}. Found ${results.prices.length} price options from ${results.total_flights} flights.`);
        
        allResults.push(results);
        
        // Move to next day if not at the end
        if (dayCounter < endDay) {
            console.log(`🔄 Moving to next day...`);
            await goToNextDay(page);
            dayCounter++;
            currentDateToCrawl = getNextDateString(currentDateToCrawl);
            
            // Add delay between days to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            console.log(`🏁 Reached end day (${endDay}). Crawling complete.`);
            break;
        }
    }
    
    // Return summary of all results
    const summary = {
        total_days_crawled: allResults.length,
        total_price_options: allResults.reduce((sum, day) => sum + day.prices.length, 0),
        total_unique_flights: new Set(allResults.flatMap(day => day.prices.map(p => p.flight_number))).size,
        daily_results: allResults
    };
    
    console.log(`\n🎉 CRAWLING SUMMARY:`);
    console.log(`Days crawled: ${summary.total_days_crawled}`);
    console.log(`Total price options: ${summary.total_price_options}`);
    console.log(`Total unique flights: ${summary.total_unique_flights}`);
    
    return summary;
}

// Helper function to click the next day button
async function goToNextDay(page) {
    try {
        // Method 1: Find button by SVG path (arrow pointing right)
        const nextButton = await page.evaluate(() => {
            // Look for the SVG path that represents a right arrow
            const rightArrowPath = 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z';
            const svgElements = document.querySelectorAll('svg path');
            
            for (const path of svgElements) {
                if (path.getAttribute('d') === rightArrowPath) {
                    // Find the button that contains this SVG
                    let button = path.closest('button');
                    if (button) {
                        button.click();
                        return true;
                    }
                }
            }
            return false;
        });

        if (nextButton) {
            console.log('✅ Successfully clicked next day button (Method 1: SVG path)');
            await new Promise(resolve => setTimeout(resolve, 3000));
            return true;
        }

        // Method 2: Find button by position (usually the rightmost button in date navigation)
        const nextButtonByPosition = await page.evaluate(() => {
            // Find all buttons that contain SVG elements
            const buttonsWithSvg = Array.from(document.querySelectorAll('button')).filter(btn => 
                btn.querySelector('svg')
            );
            
            // Look for buttons that are likely navigation buttons (small, contain arrow SVG)
            const navigationButtons = buttonsWithSvg.filter(btn => {
                const svg = btn.querySelector('svg');
                if (!svg) return false;
                
                // Check if it's likely a navigation button by checking SVG viewBox
                const viewBox = svg.getAttribute('viewBox');
                if (viewBox === '0 0 24 24') {
                    const path = svg.querySelector('path');
                    if (path) {
                        const d = path.getAttribute('d');
                        // Check if it contains right arrow pattern
                        if (d && d.includes('L10 18l6-6')) {
                            btn.click();
                            return true;
                        }
                    }
                }
                return false;
            });
            
            return navigationButtons.length > 0;
        });

        if (nextButtonByPosition) {
            console.log('✅ Successfully clicked next day button (Method 2: Position)');
            await new Promise(resolve => setTimeout(resolve, 3000));
            return true;
        }

        // Method 3: Look for button near date slider
        const nextButtonByContext = await page.evaluate(() => {
            // Find the date slider container
            const slickSlider = document.querySelector('.slick-slider, [class*="slick"]');
            if (!slickSlider) return false;
            
            // Look for buttons near the slider that contain right arrow
            const nearbyButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
                const svg = btn.querySelector('svg');
                if (!svg) return false;
                
                // Check if button is close to the slider
                const btnRect = btn.getBoundingClientRect();
                const sliderRect = slickSlider.getBoundingClientRect();
                
                // Button should be horizontally aligned with slider
                const isNearSlider = Math.abs(btnRect.top - sliderRect.top) < 100;
                const isRightOfSlider = btnRect.left > sliderRect.right - 100;
                
                if (isNearSlider && isRightOfSlider) {
                    const path = svg.querySelector('path');
                    if (path && path.getAttribute('d') === 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z') {
                        btn.click();
                        return true;
                    }
                }
                return false;
            });
            
            return nearbyButtons.length > 0;
        });

        if (nextButtonByContext) {
            console.log('✅ Successfully clicked next day button (Method 3: Context)');
            await new Promise(resolve => setTimeout(resolve, 3000));
            return true;
        }

        throw new Error('Could not find next day button with any method');
        
    } catch (error) {
        console.error('❌ Failed to click next day button:', error.message);
        return false;
    }
}

// Helper function to get the next date string
function getNextDateString(currentDateString) {
    // Parse DD/MM/YYYY format
    const parts = currentDateString.split('/');
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // Month is 0-indexed in Date
    const year = parseInt(parts[2]);
    
    const currentDate = new Date(year, month, day);
    currentDate.setDate(currentDate.getDate() + 1);
    
    // Format back to DD/MM/YYYY
    const nextDay = currentDate.getDate().toString().padStart(2, '0');
    const nextMonth = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const nextYear = currentDate.getFullYear();
    
    return `${nextDay}/${nextMonth}/${nextYear}`;
}