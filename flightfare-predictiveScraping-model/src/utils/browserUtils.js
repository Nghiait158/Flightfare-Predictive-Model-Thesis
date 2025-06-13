/**
 * @fileoverview Browser utilities for Puppeteer operations
 */

import puppeteer from 'puppeteer';
import { 
    BROWSER_CONFIG, 
    CONSOLE_FILTERS, 
    TIMEOUTS, 
    delay, 
    DELAY_MEDIUM 
} from '../constants/constants.js';
import { COOKIE_SELECTORS } from '../constants/selectors.js';
import { getTimestampedScreenshotPath } from '../constants/paths.js';

/**
 * @typedef {Object} BrowserInstance
 * @property {import('puppeteer').Browser} browser - Puppeteer browser instance
 * @property {import('puppeteer').Page} page - Puppeteer page instance
 */

/**
 * @typedef {Object} CookieResult
 * @property {boolean} firstButton - Whether first button was clicked
 * @property {boolean} cookieButton - Whether cookie button was clicked
 */

/**
 * Launches Puppeteer browser with predefined configuration
 * @returns {Promise<BrowserInstance>} Browser and page instances
 * @throws {Error} If browser launch fails
 */
export async function launchBrowser() {
    try {
        
        const browser = await puppeteer.launch({
            headless: BROWSER_CONFIG.HEADLESS, //false
            args: BROWSER_CONFIG.ARGS,
            defaultViewport: BROWSER_CONFIG.DEFAULT_VIEWPORT, //null 

        });
        
        const page = await browser.newPage();

        await page.setUserAgent(BROWSER_CONFIG.USER_AGENT); 
        await page.setViewport({ 
            width: BROWSER_CONFIG.VIEWPORT_WIDTH, //1920x1080
            height: BROWSER_CONFIG.VIEWPORT_HEIGHT 
        });

        // console.log(`Browser launched successfully (headless: ${BROWSER_CONFIG.HEADLESS})`);
        // console.log(`Viewport set to ${BROWSER_CONFIG.VIEWPORT_WIDTH}x${BROWSER_CONFIG.VIEWPORT_HEIGHT}`);
        
        return { browser, page };
        
    } catch (error) {
        console.error('❌ Failed to launch browser:', error.message);
        throw new Error(`Browser launch failed: ${error.message}`);
    }
}

/**
 * Safely closes the browser instance
 * @param {import('puppeteer').Browser} browser - Puppeteer browser instance
 * @returns {Promise<void>}
 */
export async function closeBrowser(browser) {
    if (browser) {
        try {
            await browser.close();
            console.log('🔒 Browser closed successfully');
        } catch (error) {
            console.error('⚠️ Error closing browser:', error.message);
        }
    } else {
        console.log('ℹ️ No browser instance to close');
    }
}

/**
 * Sets up browser console logging with message filtering
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @returns {void}
 */
export function setupBrowserLogging(page) {
    try {
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            
            // Filter out noise messages
            if (CONSOLE_FILTERS.some(filter => text.includes(filter))) {
                return;
            }
            
            if (type === 'log') {
                console.log(`🌐 Browser: ${text}`);
            } else if (type === 'error') {
                console.error(`🌐 Browser Error: ${text}`);
            } else if (type === 'warning') {
                console.warn(`🌐 Browser Warning: ${text}`);
            }
        });

        page.on('pageerror', error => {
            console.error('🌐 Page Error:', error.message);
        });

        page.on('requestfailed', request => {
            // Only log significant request failures
            if (!request.url().includes('analytics') && !request.url().includes('tracking')) {
                console.warn(`🌐 Request Failed: ${request.method()} ${request.url()}`);
            }
        });

        console.log('📋 Browser logging setup completed');
        
    } catch (error) {
        console.error('❌ Failed to setup browser logging:', error.message);
    }
}

/**
 * Navigates to a URL with error handling and retries
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} url - URL to navigate to
 * @param {Object} [options] - Navigation options
 * @param {string} [options.waitUntil='networkidle2'] - Wait condition
 * @param {number} [options.timeout] - Navigation timeout
 * @param {number} [options.retries=2] - Number of retry attempts
 * @returns {Promise<void>}
 * @throws {Error} If navigation fails after retries
 */
export async function gotoPage(page, url, options = {}) {
    const defaultOptions = {
        waitUntil: 'networkidle2',
        timeout: TIMEOUTS.NAVIGATION,
        retries: 2
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    const { retries, ...puppeteerOptions } = finalOptions;
    
    let lastError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`Navigation attempt ${attempt + 1}/${retries + 1} for ${url}`);
                await delay(DELAY_MEDIUM);
            }
            
            await page.goto(url, puppeteerOptions);
            
            const title = await page.title();
            console.log(`Navigated to: ${title}`);
            // console.log(` URL: ${url}`);
            
            return;
            
        } catch (error) {
            lastError = error;
            console.error(`❌ Navigation attempt ${attempt + 1} failed:`, error.message);
            
            if (attempt === retries) {
                break;
            }
        }
    }
    
    throw new Error(`Navigation to ${url} failed after ${retries + 1} attempts: ${lastError.message}`);
}

/**
 * Handles cookie popups and consent dialogs
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} [context=''] - Context description for logging
 * @returns {Promise<CookieResult>} Result of cookie handling attempts
 */
export async function handleCookiePopups(page, context = '') {
    try {
        // console.log(`🍪 Checking for cookie popups... ${context}`);
        
        const result = await page.evaluate((selectors) => {
            let status = { firstButton: false, cookieButton: false };
            
            // Try to click first button (NC_CTA_ONE)
            const firstBtn = document.getElementById(selectors.FIRST_BUTTON.replace('#', ''));
            if (firstBtn && firstBtn.offsetParent !== null) { // Check if visible
                firstBtn.click();
                status.firstButton = true;
            }
            
            // Try to click cookie consent button via XPath
            const muiButton = document.evaluate(
                selectors.COOKIE_BUTTON_XPATH,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;
            
            if (muiButton && muiButton.offsetParent !== null) { // Check if visible
                muiButton.click();
                status.cookieButton = true;
            }
            
            return status;
        }, COOKIE_SELECTORS);

        // Log results
        if (result.firstButton) {
            console.log(`${context}First button (NC_CTA_ONE) clicked`);
        }
        if (result.cookieButton) {
            console.log(`${context}Cookie consent button clicked`);
        }
        if (!result.firstButton && !result.cookieButton) {
            console.log(`${context}No cookie popups found or already handled`);
        }
        
        // Small delay to allow page to process clicks
        if (result.firstButton || result.cookieButton) {
            await delay(1000);
        }
        
        return result;
        
    } catch (error) {
        console.error(`❌ Error handling cookie popups (${context}):`, error.message);
        return { firstButton: false, cookieButton: false };
    }
}

/**
 * Takes a screenshot with automatic naming and timestamp
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} name - Base name for the screenshot
 * @param {Object} [options] - Screenshot options
 * @param {boolean} [options.fullPage=true] - Whether to capture full page
 * @param {string} [options.type='png'] - Image format
 * @returns {Promise<string>} Path to the saved screenshot
 * @throws {Error} If screenshot fails
 */
export async function takeScreenshot(page, name, options = {}) {
    try {
        const defaultOptions = {
            fullPage: true,
            type: 'png'
        };
        
        const finalOptions = { ...defaultOptions, ...options };
        const screenshotPath = getTimestampedScreenshotPath(name);
        
        await page.screenshot({ 
            path: screenshotPath, 
            ...finalOptions 
        });
        
        console.log(`📸 Screenshot saved: ${screenshotPath}`);
        return screenshotPath;
        
    } catch (error) {
        console.error(`❌ Failed to take screenshot:`, error.message);
        throw new Error(`Screenshot failed: ${error.message}`);
    }
}

/**
 * Waits for network to become idle
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {number} [timeout] - Maximum wait time in milliseconds
 * @param {number} [delayAfter] - Additional delay after network idle
 * @returns {Promise<void>}
 */
export async function waitForNetworkIdle(page, timeout = TIMEOUTS.NETWORK_IDLE, delayAfter = 1000) {
    try {
        console.log('⏳ Waiting for network to become idle...');
        
        await page.waitForLoadState?.('networkidle', { timeout }) || 
              page.waitForFunction(() => document.readyState === 'complete', { timeout });
        
        if (delayAfter > 0) {
            await delay(delayAfter);
        }
        
        console.log('✅ Network is idle');
        
    } catch (error) {
        console.warn('⚠️ Network idle timeout reached, continuing...', error.message);
    }
}

/**
 * Waits for an element to be visible on the page
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector to wait for
 * @param {number} [timeout] - Maximum wait time in milliseconds
 * @returns {Promise<import('puppeteer').ElementHandle>} Element handle
 * @throws {Error} If element is not found within timeout
 */
export async function waitForVisible(page, selector, timeout = TIMEOUTS.ELEMENT_WAIT) {
    try {
        console.log(`⏳ Waiting for element: ${selector}`);
        
        const element = await page.waitForSelector(selector, { 
            visible: true, 
            timeout 
        });
        
        console.log(`✅ Element found: ${selector}`);
        return element;
        
    } catch (error) {
        console.error(`❌ Element not found: ${selector}`, error.message);
        throw new Error(`Element ${selector} not found within ${timeout}ms`);
    }
}

/**
 * Checks if page has loaded successfully by validating title and basic elements
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @returns {Promise<boolean>} True if page appears to have loaded correctly
 */
export async function validatePageLoad(page) {
    try {
        const title = await page.title();
        const url = page.url();
        
        // Basic validation
        if (!title || title === '' || title === 'about:blank') {
            console.warn('⚠️ Page title is empty or invalid');
            return false;
        }
        
        if (!url || url === 'about:blank') {
            console.warn('⚠️ Page URL is invalid');
            return false;
        }
        
        // Check if page has basic HTML structure
        const hasBody = await page.$('body') !== null;
        if (!hasBody) {
            console.warn('⚠️ Page body not found');
            return false;
        }
        
        console.log(`Page title: "${title}"`);
        return true;
        
    } catch (error) {
        console.error('❌ Page validation failed:', error.message);
        return false;
    }
} 