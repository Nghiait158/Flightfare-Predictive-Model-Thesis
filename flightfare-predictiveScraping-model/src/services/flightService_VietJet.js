/**
 * @fileoverview Flight search service - Business logic for VietJet flight crawling
 */

import fs from 'fs';
import path from 'path';
import { delay, DELAY_SHORT, DELAY_MEDIUM } from '../constants/constants.js';
import { SELECTORS } from '../constants/selectors.js';
import { SCREENSHOT_DIR } from '../constants/paths.js';
import { 
    safeClick, 
    typeText, 
    waitForVisible, 
    scrollToElement, 
    selectElementByText,
    getElementText,
    isElementVisible
} from '../utils/domUtils.js';
import { log } from 'console';
import { crawlData_from_VietJetPage } from './crawlData_VietJet.js';
import { appendToJsonFile } from '../utils/fileUtils.js';
import { RESULT_DIR } from '../constants/paths.js';

/**
 * @typedef {Object} Airport
 * @property {string} code - Airport IATA code
 * @property {string} city - City name
 * @property {string} country - Country name
 * @property {string} airport_name - Full airport name
 */

/**
 * @typedef {Object} FlightSearchResult
 * @property {boolean} success - Whether the search was successful
 * @property {string} departureAirport - Selected departure airport
 * @property {string} arrivalAirport - Selected arrival airport
 * @property {string} selectedDate - Selected flight date
 * @property {Array} results - Flight results if available
 * @property {string} [error] - Error message if failed
 */

/**
 * Selects departure airport from VietJet dropdown
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {Airport} departureAirport - Departure airport information
 * @returns {Promise<boolean>} True if selection succeeded
 */
export async function selectDepartureAirport(page, departureAirport) {
    try {
        console.log(`Selecting departure airport: ${departureAirport.city} (${departureAirport.code})`);
        
        // Click vào input field sân bay đi
        const departureInputClicked = await safeClick(
            page, 
            SELECTORS.AIRPORTS.DEPARTURE_INPUT, 
            'Departure airport input'
        );
        
        if (!departureInputClicked) {
            throw new Error('Failed to click departure airport input');
        }
        
        await delay(DELAY_SHORT);
        
        // Nhập mã sân bay
        const typed = await typeText(
            page, 
            SELECTORS.AIRPORTS.DEPARTURE_INPUT_FIELD, 
            departureAirport.code, 
            'Departure airport code'
        );
        
        if (!typed) {
            throw new Error('Failed to type departure airport code');
        }
        
        // console.log('Departure airport code typed successfully');
        await delay(DELAY_MEDIUM); // Đợi dropdown xuất hiện
        
        // Wait for Vietnam panel using Puppeteer native methods( chờ Panel VietNam xuất hiện để click vào airport)
        await page.waitForSelector('.MuiExpansionPanel-root', { timeout: 10000 });
        await delay(DELAY_SHORT);
        
        // Find Vietnam panel using Puppeteer
        const panels = await page.$$('.MuiExpansionPanel-root');
        let vietnamPanel = null;
        
        for (const panel of panels) {
            try {
                const headerElement = await panel.$('.MuiExpansionPanelSummary-content');
                if (headerElement) {
                    const headerText = await headerElement.evaluate(el => el.textContent || '');
                    if (headerText.includes('Việt Nam')) {
                        vietnamPanel = panel;
                        break;
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        if (!vietnamPanel) {
            throw new Error('Vietnam panel not found');
        }
        
        console.log('🇻🇳 Vietnam panel found for departure airport');
        
        // Tìm và click vào departure airport
        const selected = await selectAirportFromDropdown(page, departureAirport, 'departure');
        
        if (selected) {
            // Kiểm tra giá trị input sau khi chọn
            const inputValue = await page.$eval(SELECTORS.AIRPORTS.DEPARTURE_INPUT_FIELD, el => el.value);
            console.log(`Departure airport selected. Input value: "${inputValue}"`);
            return true;
        } else {
            throw new Error(`Could not select departure airport: ${departureAirport.city}`);
        }
        
    } catch (error) {
        console.error(`❌ Failed to select departure airport:`, error.message);
        return false;
    }
}

/**
 * Selects arrival airport from VietJet dropdown
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {Airport} arrivalAirport - Arrival airport information
 * @returns {Promise<boolean>} True if selection succeeded
 */
export async function selectArrivalAirport(page, arrivalAirport) {
    try {
        console.log(`Selecting arrival airport: ${arrivalAirport.city} (${arrivalAirport.code})`);
        
        // Click vào input field sân bay đến
        const arrivalInputClicked = await safeClick(
            page, 
            SELECTORS.AIRPORTS.ARRIVAL_INPUT, 
            'Arrival airport input'
        );
        
        if (!arrivalInputClicked) {
            throw new Error('Failed to click arrival airport input');
        }
        
        await delay(DELAY_SHORT);
        
        // Nhập mã sân bay
        const typed = await typeText(
            page, 
            SELECTORS.AIRPORTS.ARRIVAL_INPUT, 
            arrivalAirport.code, 
            'Arrival airport code'
        );
        
        if (!typed) {
            throw new Error('Failed to type arrival airport code');
        }
        
        console.log('Arrival airport code typed successfully');
        await delay(DELAY_MEDIUM); // Đợi dropdown xuất hiện
        
        // Wait for arrival dropdown using Puppeteer native methods
        await page.waitForSelector('.MuiExpansionPanel-root', { timeout: 10000 });
        await delay(DELAY_SHORT);
        
        // Find Vietnam panel for arrival airport using Puppeteer
        const arrivalPanels = await page.$$('.MuiExpansionPanel-root');
        let arrivalVietnamPanel = null;
        
        for (const panel of arrivalPanels) {
            try {
                const headerElement = await panel.$('.MuiExpansionPanelSummary-content');
                if (headerElement) {
                    const headerText = await headerElement.evaluate(el => el.textContent || '');
                    if (headerText.includes('Việt Nam')) {
                        arrivalVietnamPanel = panel;
                        break;
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        if (!arrivalVietnamPanel) {
            throw new Error('Vietnam panel not found for arrival airport');
        }
        
        console.log('🇻🇳 Vietnam panel found for arrival airport');
        
        // Tìm và click vào arrival airport
        const selected = await selectAirportFromDropdown(page, arrivalAirport, 'arrival');
        
        if (selected) {
            // Kiểm tra giá trị input sau khi chọn
            const inputValue = await page.$eval(SELECTORS.AIRPORTS.ARRIVAL_INPUT, el => el.value);
            console.log(`Arrival airport selected. Input value: "${inputValue}"`);
            return true;
        } else {
            console.log(`⚠️ Could not select arrival airport from dropdown, using typed value as fallback`);
            return true; // Fallback: keep the typed value
        }
        
    } catch (error) {
        console.error(`❌ Failed to select arrival airport:`, error.message);
        console.log('🔄 Using typed value as fallback');
        return true; // Fallback approach
    }
}

/**
 * Helper function to select airport from dropdown
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {Airport} airport - Airport information
 * @param {string} type - 'departure' or 'arrival'
 * @returns {Promise<boolean>} True if selection succeeded
 */
async function selectAirportFromDropdown(page, airport, type) {
    try {
        // Get list of airports from Vietnam panel using Puppeteer
        await page.waitForSelector('.MuiExpansionPanel-root', { timeout: 10000 });
        
        // Find Vietnam panel using Puppeteer
        const panels = await page.$$('.MuiExpansionPanel-root');
        let vietnamPanel = null;
        
        for (const panel of panels) {
            try {
                const headerElement = await panel.$('.MuiExpansionPanelSummary-content');
                if (headerElement) {
                    const headerText = await headerElement.evaluate(el => el.textContent || '');
                    if (headerText.includes('Việt Nam')) {
                        vietnamPanel = panel;
                        break;
                    }
                }
            } catch (error) {
                continue;
            }
        }

        if (!vietnamPanel) {
            console.log('Vietnam panel not found');
            return [];
        }

        // Get all airport boxes using Puppeteer
        const allBoxes = await vietnamPanel.$$('.MuiBox-root');
        console.log(`Found ${allBoxes.length} airport boxes in Vietnam panel for ${type}:`);
        
        const airportList = [];
        
        // List ra những airport có tại VietNam panel  
        for (let index = 0; index < allBoxes.length; index++) {
            const box = allBoxes[index];
            try {
                const boxText = await box.evaluate(el => (el.textContent || '').trim());
                if (boxText) {
                    console.log(`${type} Box ${index + 1}: ${boxText}`);
                    airportList.push({
                        index: index,
                        element: box,
                        text: boxText,
                        hasCode: boxText.includes(airport.code),
                        hasCity: boxText.includes(airport.city),
                        hasAirportName: boxText.includes(airport.airport_name)
                    });
                }
            } catch (error) {
                console.log(`Error reading box ${index + 1}:`, error.message);
                continue;
            }
        }

        // Find target airport
        // lấy code, tên sân bay, thành phố 
        const targetAirport = airportList.find(ap => 
            ap.hasCode || ap.hasCity || ap.hasAirportName
        );
        
        if (targetAirport) {
            console.log(`Found ${type} airport ${airport.city} at index ${targetAirport.index}. Attempting to click...`);
            
            const airportElement = targetAirport.element;
            
            try {
                // kéo xuống để nhìn 
                await airportElement.scrollIntoView();
                await delay(DELAY_SHORT);
            } catch (error) {
                console.log('⚠️ Could not scroll to element:', error.message);
            }
            

            // Chọn sân bay phía dưới dropdown vì khi input trưc tiếp vào field
            // sẽ không nhận đặc thù của VietJet
            // Multiple Puppeteer click attempts
            let clicked = false;
            
            // Method 1: Direct Puppeteer click
            try {
                await airportElement.click();
                clicked = true;
                console.log(`Method 1: Puppeteer direct click successful for ${type} airport`);
            } catch (error) {
                console.log(`⚠️ Method 1 failed: ${error.message}`);
            }
            
            // Method 2: Force click with options
            if (!clicked) {
                try {
                    await airportElement.click({ force: true });
                    clicked = true;
                    console.log(`✅ Method 2: Puppeteer force click successful for ${type} airport`);
                } catch (error) {
                    console.log(`⚠️ Method 2 failed: ${error.message}`);
                }
            }
            
            // Method 3: Click airport code element within the box
            if (!clicked) {
                try {
                    const codeElement = await airportElement.$('div[translate="no"]');
                    if (codeElement) {
                        await codeElement.click();
                        clicked = true;
                        console.log(`✅ Method 3: Puppeteer code element click successful for ${type} airport`);
                    }
                } catch (error) {
                    console.log(`⚠️ Method 3 failed: ${error.message}`);
                }
            }
            
            // Method 4: Hover and click
            if (!clicked) {
                try {
                    await airportElement.hover();
                    await delay(500);
                    await airportElement.click();
                    clicked = true;
                    console.log(`✅ Method 4: Puppeteer hover+click successful for ${type} airport`);
                } catch (error) {
                    console.log(`⚠️ Method 4 failed: ${error.message}`);
                }
            }
            
            if (clicked) {
                console.log(`Clicked ${type} airport: ${airport.city}`);
                await delay(DELAY_MEDIUM);
                return true;
            }
        }
        
        console.warn(`⚠️ ${airport.city} airport not found in dropdown`);
        return false;
        
    } catch (error) {
        console.error(`❌ Error selecting ${type} airport from dropdown:`, error.message);
        return false;
    }
}

/**
 * Selects flight date - supports specific dates and today
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} [dateString] - Date string in format DD/MM/YYYY or "today"
 * @param {string} [returnDateString] - Return date string for round trip
 * @returns {Promise<boolean>} True if date selection succeeded
 */
export async function selectFlightDate(page, dateString = null, returnDateString = null) {
    try {
        
        // Click vào nút "Ngày đi"
        const dateButtonClicked = await safeClick(
            page, 
            SELECTORS.DATE.DEPARTURE_DATE_BUTTON, 
            'Departure date button'
        );
        
        if (!dateButtonClicked) {
            throw new Error('Failed to click departure date button');
        }
        
        await delay(DELAY_MEDIUM);
        
        // Select departure date
        if (!dateString || dateString === 'today') {
            // Select today's date (default behavior)
            const todaySelected = await safeClick(
                page, 
                SELECTORS.DATE.TODAY_BUTTON, 
                'Today date button'
            );
            
            if (todaySelected) {
                console.log('Today\'s date selected successfully');
            } else {
                throw new Error('Failed to select today\'s date');
            }
        } else {
            // Select specific date
            const specificDateSelected = await selectSpecificDate(page, dateString, 'departure');
            if (!specificDateSelected) {
                throw new Error(`Failed to select departure date: ${dateString}`);
            }
            console.log(`Departure date selected: ${dateString}`);
        }
        
        await delay(DELAY_MEDIUM);
        
        // Handle return date for round trip
        if (returnDateString) {
            console.log('📅 Selecting return date...');
            
            // Click return date button (if visible)
            const returnDateClicked = await safeClick(
                page,
                SELECTORS.DATE.RETURN_DATE_BUTTON || 'input[placeholder*="return"], input[placeholder*="về"], .return-date',
                'Return date button',
                { timeout: 5000 }
            );
            
            if (returnDateClicked) {
                await delay(DELAY_MEDIUM);
                
                const returnDateSelected = await selectSpecificDate(page, returnDateString, 'return');
                if (returnDateSelected) {
                    console.log(`✅ Return date selected: ${returnDateString}`);
                } else {
                    console.warn(`⚠️ Failed to select return date: ${returnDateString}`);
                }
            } else {
                console.warn('⚠️ Return date button not found or not clickable');
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Failed to select flight date:', error.message);
        return false;
    }
}

/**
 * Selects specific date from date picker
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} dateString - Date string in format DD/MM/YYYY
 * @param {string} type - 'departure' or 'return'
 * @returns {Promise<boolean>} True if date selection succeeded
 */
async function selectSpecificDate(page, dateString, type = 'departure') {
    try {
        console.log(`📅 Selecting specific ${type} date: ${dateString}`);
        
        // Parse date string (DD/MM/YYYY)
        const [day, month, year] = dateString.split('/').map(num => parseInt(num));
        const targetDate = new Date(year, month - 1, day); // month is 0-indexed
        
        if (isNaN(targetDate.getTime())) {
            throw new Error(`Invalid date format: ${dateString}. Use DD/MM/YYYY format`);
        }
        // Wait for calendar to be visible
        await page.waitForSelector('.rdrCalendarWrapper, .MuiPickersCalendar-root, .react-datepicker', { timeout: 10000 });
        await delay(DELAY_SHORT);
        
        // Navigate to target month/year if needed
        const navigated = await navigateToMonth(page, targetDate);
        if (!navigated) {
            console.warn('⚠️ Could not navigate to target month, trying to select date anyway');
        }
        
        // Try multiple selector strategies for date selection based on actual HTML structure
        const dateSelectors = [
            // React Date Range Picker - specific selectors for VietJet calendar
            `button.rdrDay:not(.rdrDayPassive):not(.rdrDayDisabled) .rdrDayNumber span:contains("${day}")`,
            `button.rdrDay:not(.rdrDayPassive):not(.rdrDayDisabled) span[title="${day}"]`,
            
            // Direct button targeting with day number
            `button.rdrDay:not(.rdrDayPassive):not(.rdrDayDisabled)`,
            
            // Backup selectors
            `button.rdrDay .rdrDayNumber span:contains("${day}")`,
            `.rdrDays button:not(.rdrDayDisabled) .rdrDayNumber span:contains("${day}")`,
            
            // Generic fallbacks
            `button[type="button"]:not([tabindex="-1"]) .rdrDayNumber span:contains("${day}")`,
            `button:contains("${day}"):not(.rdrDayPassive):not(.rdrDayDisabled)`
        ];
        
        // Use Puppeteer native methods for date selection
        console.log(`🎯 Looking for date: ${day} in month ${month}/${year}`);
        
        // Wait for calendar to stabilize
        await page.waitForSelector('button.rdrDay', { timeout: 10000 });
        await delay(DELAY_SHORT);
        
        // Get all day buttons using Puppeteer
        const dayButtons = await page.$$('button.rdrDay');
        console.log(`📅 Found ${dayButtons.length} day buttons in calendar`);
        
        let targetButton = null;
        let foundButtons = [];
        let dateSelected = false; // Initialize the variable
        
        // Check each button using Puppeteer methods
        for (let i = 0; i < dayButtons.length; i++) {
            const button = dayButtons[i];
            
            try {
                // Get day text using Puppeteer
                const dayText = await button.$eval('.rdrDayNumber span', el => el.textContent?.trim()).catch(() => null);
                
                if (dayText === day.toString()) {
                    // Check button state using Puppeteer
                    const buttonInfo = await button.evaluate(el => ({
                        isPassive: el.classList.contains('rdrDayPassive'),
                        isDisabled: el.classList.contains('rdrDayDisabled'),
                        hasTabIndex: el.getAttribute('tabindex') === '-1',
                        classes: Array.from(el.classList).join(' ')
                    }));
                    
                    const isClickable = !buttonInfo.isPassive && !buttonInfo.isDisabled && !buttonInfo.hasTabIndex;
                    
                    foundButtons.push({
                        index: i,
                        button: button,
                        dayText: dayText,
                        clickable: isClickable,
                        ...buttonInfo
                    });
                    
                    console.log(`📅 Button ${i}: Day ${dayText}, Passive: ${buttonInfo.isPassive}, Disabled: ${buttonInfo.isDisabled}, TabIndex: ${buttonInfo.hasTabIndex}`);
                    
                    if (isClickable && !targetButton) {
                        targetButton = button;
                    }
                }
            } catch (error) {
                // Skip this button if evaluation fails
                continue;
            }
        }
        
        console.log(`🔍 Found ${foundButtons.length} buttons with day ${day}`);
        
        // Try to click using Puppeteer native click
        if (targetButton) {
            try {
                console.log(`🎯 Clicking target button with Puppeteer native click`);
                
                // Scroll to button first
                await targetButton.scrollIntoView();
                await delay(500);
                
                // Try multiple Puppeteer click methods
                let clicked = false;
                
                // Method 1: Standard Puppeteer click
                try {
                    await targetButton.click();
                    clicked = true;
                    console.log(`✅ Puppeteer click successful on date: ${day}`);
                } catch (e) {
                    console.log(`⚠️ Standard click failed: ${e.message}`);
                }
                
                // Method 2: Force click with options
                if (!clicked) {
                    try {
                        await targetButton.click({ force: true });
                        clicked = true;
                        console.log(`✅ Puppeteer force click successful on date: ${day}`);
                    } catch (e) {
                        console.log(`⚠️ Force click failed: ${e.message}`);
                    }
                }
                
                // Method 3: Click the inner span
                if (!clicked) {
                    try {
                        const daySpan = await targetButton.$('.rdrDayNumber span');
                        if (daySpan) {
                            await daySpan.click();
                            clicked = true;
                            console.log(`✅ Puppeteer span click successful on date: ${day}`);
                        }
                    } catch (e) {
                        console.log(`⚠️ Span click failed: ${e.message}`);
                    }
                }
                
                if (clicked) {
                    dateSelected = true;
                }
                
            } catch (error) {
                console.log(`❌ Puppeteer click error: ${error.message}`);
            }
        }
        
        // Fallback: try any available button
        if (!dateSelected && foundButtons.length > 0) {
            const fallbackButton = foundButtons[0].button;
            console.log(`🔄 Trying fallback button with Puppeteer`);
            
            try {
                await fallbackButton.click({ force: true });
                dateSelected = true;
                console.log(`✅ Fallback Puppeteer click successful on date: ${day}`);
            } catch (error) {
                console.log(`❌ Fallback click failed: ${error.message}`);
            }
        }
        
        if (dateSelected) {
            await delay(DELAY_MEDIUM);
            console.log(`✅ ${type} date selected successfully: ${dateString}`);
            return true;
        } else {
            console.error(`❌ Could not select ${type} date: ${dateString}`);
            return false;
        }
        
    } catch (error) {
        console.error(`❌ Error selecting specific ${type} date:`, error.message);
        return false;
    }
}

/**
 * Navigates calendar to target month/year
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {Date} targetDate - Target date to navigate to
 * @returns {Promise<boolean>} True if navigation succeeded
 */
async function navigateToMonth(page, targetDate) {
    try {
        const targetMonth = targetDate.getMonth(); // 0-indexed
        const targetYear = targetDate.getFullYear();
        
        console.log(`📅 Navigating to ${targetYear}/${targetMonth + 1}`);
        
        // Get current displayed month/year using Puppeteer
        let attempts = 0;
        const maxAttempts = 12; // Max 12 months navigation
        
        while (attempts < maxAttempts) {
            // Get current month/year displayed using Puppeteer selectors
            const headerSelectors = [
                '.rdrMonthAndYearWrapper',
                '.MuiPickersCalendarHeader-monthTitleContainer', 
                '.calendar-header',
                '.datepicker-header'
            ];
            
            let currentInfo = null;
            
            for (const selector of headerSelectors) {
                try {
                    const headerElement = await page.$(selector);
                    if (headerElement) {
                        const text = await headerElement.evaluate(el => el.textContent || '');
                        console.log(`Calendar header text: ${text}`);
                        currentInfo = { text, found: true };
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            if (!currentInfo || !currentInfo.found) {
                console.log('⚠️ Could not find calendar header, skipping navigation');
                break;
            }
            
            // Check current month using Puppeteer
            let currentMonthInfo = null;
            
            try {
                const monthHeaderElement = await page.$('.rdrMonthName');
                if (monthHeaderElement) {
                    const monthText = await monthHeaderElement.evaluate(el => el.textContent.toLowerCase());
                    
                    // Extract month and year from text like "tháng 06 2025"
                    const match = monthText.match(/tháng\s+(\d+)\s+(\d+)/);
                    if (match) {
                        currentMonthInfo = {
                            month: parseInt(match[1]) - 1, // 0-indexed
                            year: parseInt(match[2]),
                            text: monthText
                        };
                    }
                }
            } catch (error) {
                console.log('⚠️ Error parsing month header:', error.message);
            }
            
            if (!currentMonthInfo) {
                console.log('⚠️ Could not parse current month, skipping navigation');
                break;
            }
            
            console.log(`📅 Current month: ${currentMonthInfo.month + 1}/${currentMonthInfo.year}, Target: ${targetMonth + 1}/${targetYear}`);
            
            // Check if we're already in the target month
            if (currentMonthInfo.month === targetMonth && currentMonthInfo.year === targetYear) {
                console.log('✅ Already in target month');
                break;
            }
            
            // Determine navigation direction
            const currentDate = new Date(currentMonthInfo.year, currentMonthInfo.month);
            const targetMonthDate = new Date(targetYear, targetMonth);
            
            const needNext = targetMonthDate.getTime() > currentDate.getTime();
            
            if (needNext) {
                // Click next month button
                const nextClicked = await safeClick(
                    page,
                    SELECTORS.DATE.CALENDAR_NEXT,
                    `Next month button (attempt ${attempts + 1})`,
                    { timeout: 3000 }
                );
                
                if (!nextClicked) {
                    console.log('⚠️ Could not click next month button');
                    break;
                }
                
                await delay(DELAY_SHORT);
            } else {
                // Click previous month button
                const prevClicked = await safeClick(
                    page,
                    SELECTORS.DATE.CALENDAR_PREV,
                    `Previous month button (attempt ${attempts + 1})`,
                    { timeout: 3000 }
                );
                
                if (!prevClicked) {
                    console.log('⚠️ Could not click previous month button');
                    break;
                }
                
                await delay(DELAY_SHORT);
            }
            
            attempts++;
        }
        
        console.log(`📅 Navigation completed after ${attempts} attempts`);
        return true;
        
    } catch (error) {
        console.error('❌ Error navigating calendar:', error.message);
        return false;
    }
}

/**
 * Selects trip type (one-way or round-trip)
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} [tripType='oneway'] - Trip type: 'oneway' or 'roundtrip'
 * @returns {Promise<boolean>} True if trip type selection succeeded
 */
export async function selectTripType(page, tripType = 'oneway') {
    try {
        console.log(`Selecting trip type: ${tripType}`);
        
        // Select trip type radio button
        if (tripType === 'roundtrip') {
            const roundtripSelected = await safeClick(
                page, 
                SELECTORS.SEARCH.ROUNDTRIP_RADIO, 
                'Round-trip radio button',
                { waitForVisible: false, timeout: 5000 }
            );
            
            if (roundtripSelected) {
                console.log('Round-trip radio button selected');
                await delay(DELAY_MEDIUM); // Allow form to adjust
                return true;
            } else {
                console.warn('⚠️ Could not select round-trip radio button');
                return false;
            }
        } else {
            const onewaySelected = await safeClick(
                page, 
                SELECTORS.SEARCH.ONEWAY_RADIO, 
                'One-way radio button',
                { waitForVisible: false, timeout: 5000 }
            );
            
            if (onewaySelected) {
                // console.log('One-way radio button selected');
                await delay(DELAY_SHORT);
                return true;
            } else {
                console.warn('⚠️ Could not select one-way radio button');
                return false;
            }
        }
        
    } catch (error) {
        console.error('❌ Failed to select trip type:', error.message);
        return false;
    }
}

/**
 * Submits the flight search form
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} [tripType='oneway'] - Trip type for validation (optional)
 * @returns {Promise<boolean>} True if form submission succeeded
 */
export async function submitSearchForm(page, tripType = 'oneway') {
    try {
        // Click cheapest ticket checkbox (if available)
        const cheapestSelected = await safeClick(
            page, 
            SELECTORS.SEARCH.CHEAPEST_CHECKBOX, 
            'Find cheapest ticket checkbox',
            { timeout: 5000 }
        );
        
        if (cheapestSelected) {
            console.log('✅ Cheapest ticket option selected');
        } else {
            console.log('ℹ️ Cheapest ticket checkbox not found or already selected');
        }
        
        await delay(DELAY_SHORT);
        
        // Click search button
        const searchButtonClicked = await safeClick(
            page, 
            SELECTORS.SEARCH.SEARCH_BUTTON, 
            'Search flight button'
        );
        
        if (searchButtonClicked) {
            console.log('✅ Search form submitted successfully');
            await delay(10000); // Wait for results to load
            return true;
        } else {
            throw new Error('Failed to click search button');
        }
        
    } catch (error) {
        console.error('❌ Failed to submit search form:', error.message);
        return false;
    }
}

/**
 * Gets flight results using crawler script injection or fallback methods
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} dateString - The date of the flight search
 * @returns {Promise<Object|null>} Flight results object or null if failed
 */
export async function getFlightResults(page, dateString, departure_airport, arrival_airport) {
    try {
        console.log('Starting Crawling flight ticket');
        
        const scriptResults = await executeCrawlerScript(page, dateString, departure_airport, arrival_airport);
        
        // Check if the crawler script returned valid results with prices
        if (scriptResults && scriptResults.prices && scriptResults.prices.length > 0) {
            console.log('✅ Results obtained via crawler script');

            // Save results to the historical data file
            const historyFilePath = path.join(RESULT_DIR, 'flight_price_history.json');
            appendToJsonFile(historyFilePath, scriptResults);

            return scriptResults;
        }
        
        // Fallback methods if crawler script fails or returns no prices
        console.log('🔄 Crawler script did not return prices, falling back to manual extraction...');
        const manualResults = await extractResultsManually(page);
        if (manualResults) {
            console.log('✅ Results obtained via manual extraction');
            return manualResults;
        }
        
        // Method 3: Basic page information as fallback
        console.log('⚠️ Using basic page information as final fallback');
        return await getBasicPageInfo(page);
        
    } catch (error) {
        console.error('❌ Failed to get flight results:', error.message);
        return null;
    }
}

/**
 * Injects crawler_data.js script and gets results
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} dateString - The date of the flight search
 * @returns {Promise<Object|null>} Results from injected script
 */
async function executeCrawlerScript(page, dateString, departure_airport, arrival_airport) {
    try {

        console.log('Appeard page need to scraping');
        
        await handleCookieConsent(page);
        // Execute the imported crawler function in the page's context
        const results = await page.evaluate(crawlData_from_VietJetPage, dateString, departure_airport, arrival_airport);
        
        if (results && !results.error) {
            console.log('Crawler script executed:', Object.keys(results));
            return results;
        } else {
            console.log('⚠️ No results found from crawler script or script returned an error.');
            if(results && results.error) {
                console.error('Crawler script error:', results.error);
            }
            return null;
        }
        
    } catch (error) {
        console.error('❌ Error executing crawler script:', error.message);
        return null;
    }
}

/**
 * Manually extracts flight results from the page
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @returns {Promise<Object|null>} Manually extracted results
 */
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

/**
 * Gets basic page information as final fallback
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @returns {Promise<Object>} Basic page information
 */
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

/**
 * Handles cookie consent popups on the page.
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @returns {Promise<void>}
 */
async function handleCookieConsent(page) {
    try {
       await delay(DELAY_MEDIUM); // Wait for popups to appear

        // This function will be executed in the browser context
        const popupsHandled = await page.evaluate(() => {
            let handled = false;
            // First possible popup
            const btn = document.getElementById('NC_CTA_ONE');
            if (btn) {
                btn.click();
                console.log('✅ First cookie button clicked');
                handled = true;
            }

            // Second possible popup
            const muiButton = document.evaluate(
                "//button[contains(@class, 'MuiButton-root')]//h5[contains(text(), 'Đồng ý')]/..",
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;

            if (muiButton) {
                muiButton.click();
                console.log('✅ Second cookie button (MUI) clicked');
                handled = true;
            }
            
            return handled;
        });

        if (popupsHandled) {
            console.log('✅ Cookie consent handled.');
            await delay(DELAY_SHORT);
        } else {
            console.log('ℹ️ No cookie popups found or handled.');
        }
    } catch (error) {
        console.warn(`⚠️ Could not handle cookie consent: ${error.message}`);
    }
}

/**
 * Performs complete flight search workflow
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {Airport} departureAirport - Departure airport information
 * @param {Airport} arrivalAirport - Arrival airport information
 * @param {Object} searchOptions - Search configuration options
 * @param {string} [searchOptions.departure_date] - Departure date (DD/MM/YYYY or 'today')
 * @param {string} [searchOptions.return_date] - Return date for round trip (DD/MM/YYYY)
 * @param {string} [searchOptions.trip_type='oneway'] - Trip type: 'oneway' or 'roundtrip'
 * @returns {Promise<FlightSearchResult>} Complete search result
 */
export async function performFlightSearch_VietJet(page, departureAirport, arrivalAirport, searchOptions = {}) {
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
        error: null
    };
    
    try {
        console.log(`Starting flight search: ${departureAirport.city} → ${arrivalAirport.city}`);
        console.log(`Departure: ${departure_date}, Return: ${return_date || 'N/A'}, Type: ${trip_type}`);
        console.log('');
        
        // Handle cookie consent first
        await handleCookieConsent(page);
        
// -----------------------------Select trip type first (để ko ảnh hưởng tới lúc chọn ngày)-----------------------------------------------
        // console.log('Setting trip type...');
        const tripTypeSelected = await selectTripType(page, trip_type);
        if (!tripTypeSelected) {
            console.warn('⚠️ Could not select trip type, continuing with default');
        }
        console.log('');
        
//------------------------------Select departure airport(sân bay đi )-----------------------------------------------------    
        
        const departureSelected = await selectDepartureAirport(page, departureAirport);
        if (!departureSelected) {
            throw new Error('Failed to select departure airport');
        }
        
        // Step 3: Select arrival airport
        const arrivalSelected = await selectArrivalAirport(page, arrivalAirport);
        if (!arrivalSelected) {
            throw new Error('Failed to select arrival airport');
        }
        
        // Step 4: Select flight dates
        const dateSelected = await selectFlightDate(page, departure_date, return_date);
        if (!dateSelected) {
            throw new Error('Failed to select flight date(s)');
        }
        
        // Step 5: Submit search form
        const formSubmitted = await submitSearchForm(page, trip_type);
        if (!formSubmitted) {
            throw new Error('Failed to submit search form');
        }
        
        // Step 5: Get flight results
        const results = await getFlightResults(page, departure_date, departureAirport,arrivalAirport );
        
        searchResult.success = true;
        searchResult.results = results;
        
        console.log('🎉 Flight search completed successfully!');
        return searchResult;
        
    } catch (error) {
        console.error('❌ Flight search failed:', error.message);
        searchResult.error = error.message;
        return searchResult;
    }
} 