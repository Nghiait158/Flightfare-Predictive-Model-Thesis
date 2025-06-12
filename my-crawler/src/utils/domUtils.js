/**
 * @fileoverview DOM interaction utilities for Puppeteer
 */

import { delay, DELAY_SHORT, TIMEOUTS } from '../constants/constants.js';

/**
 * @typedef {Object} ClickOptions
 * @property {number} [timeout] - Maximum wait time for element
 * @property {boolean} [waitForVisible=true] - Whether to wait for element to be visible
 * @property {number} [delay] - Delay after click
 */

/**
 * @typedef {Object} TypeOptions
 * @property {number} [delay=100] - Delay between keystrokes
 * @property {boolean} [clearFirst=true] - Whether to clear existing text first
 * @property {number} [timeout] - Maximum wait time for element
 */

/**
 * Safely clicks on an element with error handling and retries
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the element
 * @param {string} elementName - Descriptive name for logging
 * @param {ClickOptions} [options={}] - Click options
 * @returns {Promise<boolean>} True if click succeeded
 */
export async function safeClick(page, selector, elementName, options = {}) {
    const defaultOptions = {
        timeout: TIMEOUTS.ELEMENT_WAIT,
        waitForVisible: true,
        delay: DELAY_SHORT
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    try {
        console.log(`🖱️ Attempting to click: ${elementName} (${selector})`);
        
        // Wait for element if required
        if (finalOptions.waitForVisible) {
            await page.waitForSelector(selector, { 
                visible: true, 
                timeout: finalOptions.timeout 
            });
        }
        
        // Check if element exists and is visible
        const element = await page.$(selector);
        if (!element) {
            throw new Error(`Element not found: ${selector}`);
        }
        
        // Check visibility
        const isVisible = await element.isIntersectingViewport();
        if (!isVisible) {
            console.log(`⚠️ Element not visible, scrolling to: ${elementName}`);
            await scrollToElement(page, selector, elementName);
            await delay(DELAY_SHORT);
        }
        
        // Perform click
        await page.click(selector);
        
        // Optional delay after click
        if (finalOptions.delay > 0) {
            await delay(finalOptions.delay);
        }
        
        console.log(`✅ Successfully clicked: ${elementName}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Failed to click ${elementName}:`, error.message);
        return false;
    }
}

/**
 * Types text into an input field with error handling
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the input field
 * @param {string} text - Text to type
 * @param {string} elementName - Descriptive name for logging
 * @param {TypeOptions} [options={}] - Typing options
 * @returns {Promise<boolean>} True if typing succeeded
 */
export async function typeText(page, selector, text, elementName, options = {}) {
    const defaultOptions = {
        delay: 100,
        clearFirst: true,
        timeout: TIMEOUTS.ELEMENT_WAIT
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    try {
        console.log(`⌨️ Typing into ${elementName}: "${text}"`);
        
        // Wait for element
        await page.waitForSelector(selector, { 
            visible: true, 
            timeout: finalOptions.timeout 
        });
        
        // Focus on element
        await page.focus(selector);
        await delay(DELAY_SHORT);
        
        // Clear existing text if required
        if (finalOptions.clearFirst) {
            await page.evaluate((sel) => {
                const element = document.querySelector(sel);
                if (element) {
                    element.value = '';
                }
            }, selector);
        }
        
        // Type text
        await page.type(selector, text, { delay: finalOptions.delay });
        
        // Trigger input event to ensure React/Vue components update
        await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (element) {
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, selector);
        
        console.log(`✅ Successfully typed into ${elementName}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Failed to type into ${elementName}:`, error.message);
        return false;
    }
}

/**
 * Waits for an element to become visible
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector to wait for
 * @param {number} [timeout] - Maximum wait time in milliseconds
 * @returns {Promise<import('puppeteer').ElementHandle|null>} Element handle or null
 */
export async function waitForVisible(page, selector, timeout = TIMEOUTS.ELEMENT_WAIT) {
    try {
        console.log(`⏳ Waiting for element to be visible: ${selector}`);
        
        const element = await page.waitForSelector(selector, { 
            visible: true, 
            timeout 
        });
        
        console.log(`✅ Element is visible: ${selector}`);
        return element;
        
    } catch (error) {
        console.error(`❌ Element not visible within timeout: ${selector}`, error.message);
        return null;
    }
}

/**
 * Scrolls to an element to bring it into view
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the element
 * @param {string} elementName - Descriptive name for logging
 * @returns {Promise<boolean>} True if scroll succeeded
 */
export async function scrollToElement(page, selector, elementName) {
    try {
        console.log(`📜 Scrolling to element: ${elementName}`);
        
        const scrolled = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (element) {
                element.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center',
                    inline: 'nearest'
                });
                return true;
            }
            return false;
        }, selector);
        
        if (scrolled) {
            await delay(DELAY_SHORT * 2); // Wait for smooth scroll
            console.log(`✅ Scrolled to: ${elementName}`);
            return true;
        } else {
            console.warn(`⚠️ Element not found for scrolling: ${elementName}`);
            return false;
        }
        
    } catch (error) {
        console.error(`❌ Failed to scroll to ${elementName}:`, error.message);
        return false;
    }
}

/**
 * Selects an element based on its text content within a parent container
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} parentSelector - CSS selector for parent container
 * @param {string} textToSelect - Text content to search for
 * @param {string} itemSelector - CSS selector for individual items
 * @param {string} elementName - Descriptive name for logging
 * @param {Object} [options={}] - Selection options
 * @param {boolean} [options.exactMatch=false] - Whether to match text exactly
 * @param {boolean} [options.caseSensitive=false] - Whether search is case sensitive
 * @returns {Promise<boolean>} True if selection succeeded
 */
export async function selectElementByText(page, parentSelector, textToSelect, itemSelector, elementName, options = {}) {
    const defaultOptions = {
        exactMatch: false,
        caseSensitive: false
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    try {
        console.log(`🔍 Searching for "${textToSelect}" in ${elementName}`);
        
        // Wait for parent container
        await waitForVisible(page, parentSelector);
        
        const found = await page.evaluate((parentSel, itemSel, searchText, opts) => {
            const parent = document.querySelector(parentSel);
            if (!parent) {
                console.log('Parent container not found');
                return false;
            }
            
            const items = parent.querySelectorAll(itemSel);
            console.log(`Found ${items.length} items to search through`);
            
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const itemText = item.textContent || '';
                
                let isMatch = false;
                if (opts.exactMatch) {
                    isMatch = opts.caseSensitive ? 
                        itemText.trim() === searchText : 
                        itemText.trim().toLowerCase() === searchText.toLowerCase();
                } else {
                    isMatch = opts.caseSensitive ? 
                        itemText.includes(searchText) : 
                        itemText.toLowerCase().includes(searchText.toLowerCase());
                }
                
                if (isMatch) {
                    console.log(`Found matching item: ${itemText.substring(0, 50)}...`);
                    
                    // Scroll item into view
                    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // Click the item
                    item.click();
                    return true;
                }
            }
            
            console.log('No matching item found');
            return false;
        }, parentSelector, itemSelector, textToSelect, finalOptions);
        
        if (found) {
            console.log(`✅ Successfully selected "${textToSelect}" in ${elementName}`);
            await delay(DELAY_SHORT);
            return true;
        } else {
            console.warn(`⚠️ Could not find "${textToSelect}" in ${elementName}`);
            return false;
        }
        
    } catch (error) {
        console.error(`❌ Failed to select "${textToSelect}" in ${elementName}:`, error.message);
        return false;
    }
}

/**
 * Gets the text content of an element
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the element
 * @returns {Promise<string|null>} Element text content or null
 */
export async function getElementText(page, selector) {
    try {
        const text = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            return element ? element.textContent.trim() : null;
        }, selector);
        
        return text;
        
    } catch (error) {
        console.error(`❌ Failed to get text from ${selector}:`, error.message);
        return null;
    }
}

/**
 * Gets the value of an input element
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the input element
 * @returns {Promise<string|null>} Input value or null
 */
export async function getInputValue(page, selector) {
    try {
        const value = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            return element ? element.value : null;
        }, selector);
        
        return value;
        
    } catch (error) {
        console.error(`❌ Failed to get value from ${selector}:`, error.message);
        return null;
    }
}

/**
 * Checks if an element exists and is visible
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the element
 * @returns {Promise<boolean>} True if element exists and is visible
 */
export async function isElementVisible(page, selector) {
    try {
        const isVisible = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (!element) return false;
            
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && element.offsetParent !== null;
        }, selector);
        
        return isVisible;
        
    } catch (error) {
        console.error(`❌ Failed to check visibility of ${selector}:`, error.message);
        return false;
    }
}

/**
 * Waits for an element to disappear from the page
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the element
 * @param {number} [timeout] - Maximum wait time in milliseconds
 * @returns {Promise<boolean>} True if element disappeared
 */
export async function waitForHidden(page, selector, timeout = TIMEOUTS.ELEMENT_WAIT) {
    try {
        console.log(`⏳ Waiting for element to disappear: ${selector}`);
        
        await page.waitForSelector(selector, { 
            hidden: true, 
            timeout 
        });
        
        console.log(`✅ Element disappeared: ${selector}`);
        return true;
        
    } catch (error) {
        console.warn(`⚠️ Element did not disappear within timeout: ${selector}`);
        return false;
    }
} 