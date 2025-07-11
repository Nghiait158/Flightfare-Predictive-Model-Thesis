import { DELAY_SHORT } from '../constants/constants.js';

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




export async function crawlData_byDate_from_BayDepPage(page, dateString, departure_airport, arrival_airport) {
    const allResults = [];
    
    // Parse DD/MM/YYYY format
    const parts = dateString.split('/');
    const startDay = parseInt(parts[0]);
    const startMonth = parseInt(parts[1]) - 1; // Month is 0-indexed in Date
    const startYear = parseInt(parts[2]);
    
    const aircraftTypeMap = await page.evaluate(() => {
        const flightAircraftMap = {};
        // Find all spans that look like flight numbers. This is a stable starting point.
        const flightSpans = Array.from(document.querySelectorAll('span')).filter(s => s.textContent.trim().match(/^VJ\d{3,4}$/));

        flightSpans.forEach(flightSpan => {
            const flightNumber = flightSpan.textContent.trim();
            let aircraftType = null;
            
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
    const TimestartCrawl = Date.now();
    console.log('✈️ Aircraft Type Map:', aircraftTypeMap);
    
    const startDate = new Date(startYear, startMonth, startDay);

    const total_days_crawled= 15;

    const endDay = new Date(startDate); 
    endDay.setDate(startDate.getDate() + total_days_crawled);
    
    const endDayDate = endDay.getDate();
    const endDayMonth = endDay.getMonth() + 1; // Months are 0-indexed
    const endDayYear = endDay.getFullYear();

    console.log(`🚀 Starting crawl from day ${startDate.getDate()} to day ${endDayDate} of month ${endDayMonth}/${endDayYear}`);
    
    let currentDateToCrawl = dateString;
    let dayCounter = 0; // Counter for days processed (0 to total_days_crawled-1)
    
    while (dayCounter < total_days_crawled) {
        console.log(`\n📅 CRAWLING DATA FOR: ${currentDateToCrawl} (Day ${dayCounter + 1}/${total_days_crawled})`);
        
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
            if (dayCounter < total_days_crawled - 1) {
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
            if (dayCounter < total_days_crawled - 1) {
                await goToNextDay(page);
                dayCounter++;
                currentDateToCrawl = getNextDateString(currentDateToCrawl);
            }
            continue;
        }
        
        console.log(`FOUND ${priceOptionsCount} clickable price options.`);

        
        for (let i = 0; i < priceOptionsCount; i++) {
            // console.log(`PROCESSING PRICE OPTION ${i + 1}/${priceOptionsCount}`);
            
            // Rebuild aircraft type map for current page state (to capture dynamic content)
            const currentAircraftTypeMap = await page.evaluate(() => {
                const flightAircraftMap = {};
                const flightSpans = Array.from(document.querySelectorAll('span')).filter(s => s.textContent.trim().match(/^VJ\d{3,4}$/));

                flightSpans.forEach(flightSpan => {
                    const flightNumber = flightSpan.textContent.trim();
                    let aircraftType = null;
                    
                    let current = flightSpan;
                    let container = null;
                    for (let j = 0; j < 8; j++) {
                        if (!current.parentElement) break;
                        current = current.parentElement;
                        const text = current.textContent || '';
                        if (text.includes('Bay thẳng') && text.includes(flightNumber)) {
                            container = current;
                            break;
                        }
                    }

                    if (container) {
                        const spansInContainer = Array.from(container.querySelectorAll('span'));
                        const aircraftSpan = spansInContainer.find(s => /^(Airbus|Boeing)/i.test(s.textContent.trim()));
                        if (aircraftSpan) {
                            aircraftType = aircraftSpan.textContent.trim().split('-')[0].trim();
                        }
                    }
                    
                    if (flightNumber && aircraftType) {
                        flightAircraftMap[flightNumber] = aircraftType;
                    }
                });
                return flightAircraftMap;
            });

            // Merge with original map (prioritize current map for fresh data)
            const mergedAircraftTypeMap = { ...aircraftTypeMap, ...currentAircraftTypeMap };
            
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

            // Extract comprehensive flight data
            const flightData = await page.evaluate((departure_airport, arrival_airport, aircraftTypeMap, expectedFlightDate) => {
                const bookingInfoContainer = document.querySelector('div.MuiGrid-grid-md-4');
                if (!bookingInfoContainer) return null;

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
                
                if (!total_price || total_price === '0 ') return null;

                let flight_number = null, departure_time = null, arrival_time = null, classes = null, aircraft_type = null;
                const detailsText = bookingInfoContainer.textContent;
                const flightMatch = detailsText.match(/(VJ\d+)/);
                if (flightMatch) {
                    flight_number = flightMatch[1];
                    if (aircraftTypeMap[flight_number]) {
                        aircraft_type = aircraftTypeMap[flight_number];
                    }
                }

                const timeMatch = detailsText.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
                if (timeMatch) [ , departure_time, arrival_time] = timeMatch;

                const classMatch = detailsText.match(/(Skyboss|Business|Deluxe|Eco)/i);
                if (classMatch) classes = classMatch[1];
                
                // --- FIX: Always generate flight_date from the expected date ---
                let iso_flight_date = null;
                try {
                    const dateParts = expectedFlightDate.split('/');
                    if (dateParts.length === 3) {
                        const day = parseInt(dateParts[0]);
                        const month = parseInt(dateParts[1]) - 1;
                        const year = parseInt(dateParts[2]);
                        const dateObj = new Date(Date.UTC(year, month, day));
                        iso_flight_date = dateObj.toISOString();
                    }
                } catch (error) {
                    // This should not happen if expectedFlightDate is always correct
                }

                let cleaned_price = total_price.replace(/,/g, '').replace(/\s*VND\s*/g, '').replace(/\s*₫\s*/g, '').trim();

                return {
                    flight_number,
                    departure_airport: departure_airport.code,
                    arrival_airport: arrival_airport.code,
                    flight_date: iso_flight_date, // Correctly derived date
                    departure_time,
                    arrival_time,
                    total_price: cleaned_price,
                    classes,
                    aircraft_type,
                };
            }, departure_airport, arrival_airport, mergedAircraftTypeMap, currentDateToCrawl); // Pass currentDateToCrawl here
            
            if (flightData && flightData.total_price) {
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
        if (dayCounter < total_days_crawled - 1) {
            console.log(`🔄 Moving to next day...`);
            await goToNextDay(page);
            dayCounter++;
            currentDateToCrawl = getNextDateString(currentDateToCrawl);
            
            // Add delay between days to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            console.log(`🏁 Reached end day (${total_days_crawled} days total). Crawling complete.`);
            break;
        }
    }
    const TimeEndCrawl = Date.now();
    console.log(`⏱️ Time crawl: ${TimeEndCrawl - TimestartCrawl} ms`);
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