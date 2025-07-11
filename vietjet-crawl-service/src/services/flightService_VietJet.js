/**
 * @fileoverview Flight search service - Business logic for VietJet flight crawling
 */

import fs from 'fs';
import path from 'path';
import { delay, DELAY_SHORT, DELAY_MEDIUM } from '../constants/constants.js';
import { SELECTORS } from '../constants/selectors.js';
import {FLIGHT_CONFIG_PATH, SCREENSHOT_DIR } from '../constants/paths.js';
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
// import { crawlData_from_VietJetPage } from './crawlData_VietJet.js';
import { crawlData_byDate_from_VietJetPage } from './crawlData_byDate_from_VietJetPage.js';
import { appendToJsonFile, appendToCsvFile } from '../utils/fileUtils.js';
import { RESULT_DIR } from '../constants/paths.js';

/**
 * Reads flight configuration from config file
 * @returns {Promise<Object>} Flight configuration object
 */
async function readFlightConfig() {
    try {
        const configData = await fs.promises.readFile(FLIGHT_CONFIG_PATH, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        console.warn('⚠️ Could not read flight config, using defaults:', error.message);
        return {
            search_options: {
                find_cheapest: false
            }
        };
    }
}

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


async function navigateToMonth(page, targetDate) {
    try {
        const targetMonth = targetDate.getMonth(); // 0-indexed
        const targetYear = targetDate.getFullYear();
        
        console.log(`📅 Navigating to ${targetYear}/${targetMonth + 1}`);
        
        // Get current displayed month/year using
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
async function selectPassengers(page, adult, child, infant) {
    try {
        console.log("Selecting passengers: Adult: "+adult+" Child: "+child+ " Infant: "+infant);
        
        // Find all increment buttons by their structure
        const incrementButtons = await page.$$('button.MuiFab-root.MuiFab-sizeSmall');
        const validButtons = [];
        
        // Filter buttons that have the plus icon
        for (const button of incrementButtons) {
            try {
                const svgPath = await button.$eval('svg path', el => el.getAttribute('d'));
                if (svgPath === 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z') {
                    validButtons.push(button);
                }
            } catch (error) {
                // Skip this button if it doesn't have the expected structure
                continue;
            }
        }
        
        console.log(`Found ${validButtons.length} increment buttons`);
        
        if (validButtons.length === 0) {
            console.warn('⚠️ No increment buttons found');
            return false;
        }
        
        // Handle Adult passengers (button 0 = adult, subtract 1 because default is usually 1 adult)
        if (adult > 1 && validButtons[0]) {
            console.log(`Adding ${adult - 1} more adult passengers...`);
            for (let i = 0; i < adult - 1; i++) {
                try {
                    await validButtons[0].click();
                    console.log(`✅ Adult passenger ${i + 2} added`);
                    await delay(DELAY_SHORT);
                } catch (error) {
                    console.warn(`⚠️ Could not add adult passenger ${i + 2}:`, error.message);
                    break;
                }
            }
        }

        // Handle Child passengers (button 1 = child)
        if (child > 0 && validButtons[1]) {
            console.log(`Adding ${child} child passengers...`);
            for (let i = 0; i < child; i++) {
                try {
                    await validButtons[1].click();
                    console.log(`✅ Child passenger ${i + 1} added`);
                    await delay(DELAY_SHORT);
                } catch (error) {
                    console.warn(`⚠️ Could not add child passenger ${i + 1}:`, error.message);
                    break;
                }
            }
        }

        // Handle Infant passengers (button 2 = infant)
        if (infant > 0 && validButtons[2]) {
            console.log(`Adding ${infant} infant passengers...`);
            for (let i = 0; i < infant; i++) {
                try {
                    await validButtons[2].click();
                    console.log(`✅ Infant passenger ${i + 1} added`);
                    await delay(DELAY_SHORT);
                } catch (error) {
                    console.warn(`⚠️ Could not add infant passenger ${i + 1}:`, error.message);
                    break;
                }
            }
        }

        console.log("✅ Passenger selection completed");
        return true;
        
    } catch (error) {
        console.error('❌ Failed to select passenger:', error.message);
        return false;
    }
}

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

// Submits the flight search form

export async function submitSearchForm(page, tripType = 'oneway') {
    try {
        // Read flight configuration
        const config = await readFlightConfig();
        const shouldFindCheapest = config.search_options?.find_cheapest || false;
        
        // Click cheapest ticket checkbox only if configured to do so
        if (shouldFindCheapest) {
            console.log('🎯 Attempting to select cheapest ticket option (enabled in config)...');
            await page.evaluate(() => {
                window.scrollBy(0, 1000);
            });
            console.log('đã scroll');
                            
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
        } else {
            console.log('ℹ️ Cheapest ticket option disabled in config, skipping...');
        }
        
        await delay(DELAY_SHORT);
       

        await delay(1000)
        
        // Click on container div first, then search button
        console.log('🔍 Attempting to find and click search button container and button...');
        
        let searchButtonClicked = false;
        
        try {
            // Strategy 1: Find search button container and click both container and button
            console.log('📍 Finding search button container and button...');
            
            // Wait for search form area to be ready
            await page.waitForSelector('button.MuiButton-contained', { timeout: 5000 });
            
            // Find the search button and its container using page evaluation
            const result = await page.evaluate(() => {
                // Find all Material-UI contained buttons
                const buttons = document.querySelectorAll('button.MuiButton-contained[type="button"]');
                
                for (const button of buttons) {
                    // Check if this is the search button by looking for "Tìm chuyến bay" text
                    const labelSpan = button.querySelector('span.MuiButton-label');
                    if (labelSpan && labelSpan.textContent && labelSpan.textContent.trim() === 'Tìm chuyến bay') {
                        
                        // Get parent container div
                        const container = button.parentElement;
                        
                        if (container) {
                            console.log('Found search button and container');
                            
                            // Scroll to container first
                            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            
                            // Small delay for scroll
                            setTimeout(() => {
                                // Click container first
                                console.log('Clicking container div...');
                                container.click();
                                
                                // Then click button
                                setTimeout(() => {
                                    console.log('Clicking search button...');
                                    button.click();
                                }, 300);
                            }, 500);
                            
                            return { success: true, found: true };
                        }
                    }
                }
                
                return { success: false, found: false };
            });
            
            if (result && result.success) {
                console.log('✅ Search button container and button clicked successfully');
                searchButtonClicked = true;
                await delay(1000); // Wait for click processing
            } else {
                console.log('⚠️ Could not find search button with expected structure');
            }
            
        } catch (error) {
            console.log('⚠️ Strategy 1 failed:', error.message);
        }
        
        // Fallback: Use original safeClick method if above strategy fails
        if (!searchButtonClicked) {
            console.log('🔄 Falling back to direct button click...');
            searchButtonClicked = await safeClick(
                page, 
                SELECTORS.SEARCH.SEARCH_BUTTON, 
                'Search flight button'
            );
        }
        
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

// Gets flight results using crawler script injection or fallback methods

export async function getFlightResults(page, dateString, departure_airport, arrival_airport, adult, child, infant) {
    try {
        console.log('Starting Crawling flight ticket');
        
        const scriptResults = await executeCrawlerScript(page, dateString, departure_airport, arrival_airport);
        
        // Check if the crawler script returned valid results with prices
        let allPrices = [];
        
        // Handle results from crawlData_byDate_from_VietJetPage (has daily_results structure)
        if (scriptResults && scriptResults.daily_results && scriptResults.daily_results.length > 0) {
            // Flatten all prices from all days
            allPrices = scriptResults.daily_results.flatMap(day => day.prices || []);
        }
        // Handle results from other crawlers (has direct prices structure)  
        else if (scriptResults && scriptResults.prices && scriptResults.prices.length > 0) {
            allPrices = scriptResults.prices;
        }
        
        if (allPrices.length > 0) {
            console.log('✅ Results obtained via crawler script');
            console.log(`📊 Found ${allPrices.length} price records`);
            console.log(`dateString`);
            
            // Save results to the historical data file
            const historyFilePath = path.join(RESULT_DIR, 'flight_price_history.json');
            appendToJsonFile(historyFilePath, scriptResults);

            // Save results to CSV file
            const csvFilePath = path.join(RESULT_DIR, 'flight_price_history.csv');
            const csvRecords = allPrices.map(flight => {
                // Use flight_date from scraper (now reliable since it uses crawl date as primary source)
                let flight_date_iso = flight.flight_date;
                
                // Only fallback to dateString conversion if scraper completely failed to provide date
                if (!flight_date_iso && dateString) {
                    try {
                        const dateParts = dateString.split('/');
                        if (dateParts.length === 3) {
                            const day = parseInt(dateParts[0]);
                            const month = parseInt(dateParts[1]) - 1;
                            const year = parseInt(dateParts[2]);
                            const dateObj = new Date(year, month, day);
                            flight_date_iso = dateObj.toISOString();
                        }
                    } catch (error) {
                        console.warn('Failed to convert dateString to ISO:', dateString);
                    }
                }

                return {
                    flight_number: flight.flight_number,
                    departure_airport: flight.departure_airport,
                    arrival_airport: flight.arrival_airport,
                    flight_date: flight_date_iso, // Trust scraper's date processing
                    departure_time: flight.departure_time,
                    arrival_time: flight.arrival_time,
                    classes: flight.classes,
                    aircraft_type: flight.aircraft_type,
                    price: flight.total_price,
                    adult: adult,
                    child: child,
                    infant: infant,
                };
            });
            await appendToCsvFile(csvFilePath, csvRecords);

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

        await handleStickClose(page);

        // Scroll to bottom to load all content
       

        // Execute scroll to bottom
        await scrollToBottom(page);
        
        // Wait a bit for content to load after scrolling
        await delay(DELAY_MEDIUM);

        // Execute the imported crawler function in the page's context
        const results = await crawlData_byDate_from_VietJetPage(page, dateString, departure_airport, arrival_airport);
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
async function handleStickClose(page) {
    try {
        const closeButton = await page.waitForSelector('button[aria-label="close"]', { 
            visible: true, 
            timeout: 5000 
        });
        
        // Kiểm tra xem nút có tồn tại trước khi click không
        if (closeButton) {
            await closeButton.click();
            console.log('✅ Clicked close button successfully!');
        } else {
            console.log('❌ Close button not found after waiting.');
        }
    } catch (error) {
        console.error('❌ Error clicking close button:', error.message);
    }
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

export async function performFlightSearch_VietJet(page, departureAirport, arrivalAirport, searchOptions = {}, adult, child, infant) {
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

            // console.log("Check variable");
            
            // console.log("Adult: "+adult);
            // console.log("Child: "+child);
            // console.log("Infant: "+infant);

        console.log(`Starting flight search: ${departureAirport.city} → ${arrivalAirport.city}`);
        console.log(`Departure: ${departure_date}, Return: ${return_date || 'N/A'}, Type: ${trip_type}`);
        console.log("Adult: "+adult);
        console.log("Child: "+child);
        console.log("Infant: "+infant);

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

        const passengersSelected= await selectPassengers(page, adult, child, infant);
        if (!passengersSelected) {
            throw new Error('Failed to select passengers(s)');
        }
       

        // Step 5: Submit search form
        const formSubmitted = await submitSearchForm(page, trip_type);
        if (!formSubmitted) {
            throw new Error('Failed to submit search form');
        }
        
        // Step 5: Get flight results
        const results = await getFlightResults(page, departure_date, departureAirport, arrivalAirport, adult, child, infant);
        
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