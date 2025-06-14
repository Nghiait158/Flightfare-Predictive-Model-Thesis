/**
 * @fileoverview crawlData_VietJet.js - Script to handle the results page for VietJet.
 * This script is intended to be executed in the browser context via Puppeteer's page.evaluate().
 */

/**
 * Pauses execution for a specified duration.
 * @param {number} ms - Milliseconds to delay.
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extracts flight data from the page.
 * @returns {Array<Object>} List of extracted flight data.
 */
function extractFlightData() {
    console.log('🔍 Extracting flight data...');
    
    const flights = [];
    
    // Find all flight cards
    const flightCards = document.querySelectorAll('[data-testid="flight-card"], .flight-item, .MuiCard-root');
    
    console.log(`Found ${flightCards.length} flight cards`);
    
    flightCards.forEach((card, index) => {
        try {
            const flightData = {
                index: index + 1,
                departure_time: '',
                arrival_time: '',
                duration: '',
                price: '',
                aircraft: '',
                flight_number: ''
            };

            // Extract departure time
            const depTimeElements = card.querySelectorAll('span, div, p');
            depTimeElements.forEach(el => {
                const text = el.textContent.trim();
                if (/^\d{2}:\d{2}$/.test(text) && !flightData.departure_time) {
                    flightData.departure_time = text;
                }
            });

            // Extract price
            const priceElements = card.querySelectorAll('*');
            priceElements.forEach(el => {
                const text = el.textContent.trim();
                if (text.includes('VND') || text.includes('₫') || /\d+\.\d+/.test(text)) {
                    if (!flightData.price && text.length < 50) {
                        flightData.price = text;
                    }
                }
            });

            // Extract flight number
            const flightNumElements = card.querySelectorAll('*');
            flightNumElements.forEach(el => {
                const text = el.textContent.trim();
                if (/^VJ\d+/.test(text)) {
                    flightData.flight_number = text;
                }
            });

            if (flightData.departure_time || flightData.price || flightData.flight_number) {
                flights.push(flightData);
                console.log(`Flight ${index + 1}:`, flightData);
            }
            
        } catch (error) {
            console.log(`Error extracting flight ${index + 1}:`, error);
        }
    });

    return flights;
}

/**
 * Scrolls the page to load more data if available.
 */
async function scrollAndLoadMore() {
    console.log('📜 Scrolling to load more flights...');
    
    // Scroll to the bottom of the page
    window.scrollTo(0, document.body.scrollHeight);
    await delay(2000);
    
    // Find and click "Load more" button if it exists
    const loadMoreButtons = document.querySelectorAll('button');
    for (const button of loadMoreButtons) {
        const buttonText = button.textContent.toLowerCase();
        if (buttonText.includes('load more') || 
            buttonText.includes('xem thêm') || 
            buttonText.includes('tải thêm')) {
            console.log('🔄 Clicking load more button');
            button.click();
            await delay(3000);
            break;
        }
    }
}

/**
 * Main function to run all crawler tasks on the results page.
 * This function is executed in the browser context.
 * @returns {Promise<Object>} The crawled flight data.
 */
export function crawlData_from_VietJetPage(dateString, departure_airport, arrival_airport) {
    try {
        console.log(`🎯 Starting crawler tasks on results page for date: ${dateString}...`);

        // Helper to get text content, returning null if element not found
        const getText = (element, selector) => {
            const el = element.querySelector(selector);
            return el ? el.textContent.trim() : null;
        };

        // 1. Extract Departure and Arrival information
        const getRouteInfo = () => {
            let departureAirport = departure_airport;
            let arrivalAirport = arrival_airport;
            const routeContainer = document.querySelector('div > img[alt="vietjet icon"]');
            if (routeContainer && routeContainer.parentElement) {
                const parent = routeContainer.parentElement;
                const divs = parent.querySelectorAll('div');
                if (divs.length >= 3) {
                    departureAirport = divs[0].textContent.trim();
                    arrivalAirport = divs[2].textContent.trim();
                }
            }
            return { departureAirport, arrivalAirport };
        };

        // 2. Get the currently displayed month and year from the active slide
        const getCurrentMonthYear = () => {
            const currentMonthEl = document.querySelector('.slick-slide.slick-current p');
            const monthYearText = currentMonthEl ? currentMonthEl.textContent.trim() : ''; // e.g., "07/2025"
            if (!monthYearText || !/^\d{2}\/\d{4}$/.test(monthYearText)) {
                // Fallback to parsing from the input dateString if the page element isn't found
                if(dateString && dateString.includes('/')) {
                    const parts = dateString.split('/');
                    return { month: parts[1], year: parts[2] };
                }
                return { month: null, year: null };
            }
            const [month, year] = monthYearText.split('/');
            return { month, year };
        };

        const { departureAirport, arrivalAirport } = getRouteInfo();
        const { month, year } = getCurrentMonthYear();

        if (!month || !year) {
            console.error('Could not determine current month and year from the page or dateString.');
            return { error: 'Could not determine current month and year.' };
        }

        // 3. Function to extract daily prices from the calendar view
        const extractDailyPrices = () => {
            const dailyPrices = [];
            // Select all day cells based on their role attribute
            const dayElements = document.querySelectorAll('div[role="button"]');

            dayElements.forEach(dayEl => {
                const dayNumberEl = dayEl.querySelector('p');
                const priceSpans = dayEl.querySelectorAll('span');

                if (dayNumberEl && priceSpans.length >= 2) {
                    const day = dayNumberEl.textContent?.trim();

                    let formattedDate = '';
                    if (day && month && year) {
                        // Đảm bảo day và month có 2 chữ số (ví dụ: 01 thay vì 1)
                        const paddedDay = day.padStart(2, '0');
                        const paddedMonth = String(month).padStart(2, '0'); // Chuyển month sang string trước khi padStart
                        formattedDate = `${paddedDay}/${paddedMonth}/${year}`;
                    }
                    // Combine price parts from spans
                    const pricePart1 = priceSpans[0].textContent?.trim().replace(/,/g, '') || '0';
                    const pricePart2Text = priceSpans[1].textContent?.trim() || '0';
                    const pricePart2 = pricePart2Text.replace(/\s*VND/i, '').replace(/\s/g, '');
                    
                    const fullPriceText = pricePart1 + pricePart2;
                    const price = parseInt(fullPriceText, 10);

                    
                    if (day && !isNaN(price) && price > 0 && formattedDate) { // Thêm điều kiện formattedDate
                        dailyPrices.push({
                            // departure_airport: departureAirport,
                            // arrival_airport: arrivalAirport,
                            // Thay thế hoặc thêm trường 'date' với định dạng dd/mm/yyyy
                            date: formattedDate, 
                            // day: day.padStart(2, '0'),
                            // month: month,
                            // year: year,
                            price: price+'VND',
                            // currency: 'VND'
                        });
                    }
                }
            });
            return dailyPrices;
        };

        const prices = extractDailyPrices();
        
        if (prices.length === 0) {
            console.log('⚠️ No daily prices found on the page. The structure might have changed.');
        } else {
            console.log(`✅ Extracted ${prices.length} daily prices.`);
        }

        return {
            timestamp: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            source: 'FlightFare_from_VietJet',
            departureAirport,
            arrivalAirport,
            total_prices_found: prices.length,
            prices
        };

    } catch (error) {
        console.error('❌ Error in crawler tasks:', error.message, error.stack);
        return { error: error.message };
    }
} 