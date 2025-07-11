import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { 
    BROWSER_CONFIG, 
    CONSOLE_FILTERS, 
    TIMEOUTS, 
    delay, 
    DELAY_MEDIUM 
} from '../constants/constants.js';
import { COOKIE_SELECTORS } from '../constants/selectors.js';
import { getTimestampedScreenshotPath } from '../constants/paths.js';

// Apply the stealth plugin
puppeteer.use(StealthPlugin());

export async function launchBrowser() {
    try {
        const isDocker = process.env.DOCKER_ENV === 'true';
        let launchArgs = [...BROWSER_CONFIG.ARGS];

        if (isDocker) {
            console.log('🐋 Running in Docker environment, applying Docker-specific args.');
            const dockerArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ];
            launchArgs.push(...dockerArgs);
        }

        // Add proxy support from environment variable
        if (process.env.PROXY_SERVER) {
            const proxy = process.env.PROXY_SERVER;
            launchArgs.push(`--proxy-server=${proxy}`);
            console.log(`🔌 Using proxy server: ${proxy}`);
        }

        const launchOptions = {
            headless: isDocker ? 'new' : BROWSER_CONFIG.HEADLESS,
            args: launchArgs,
            defaultViewport: BROWSER_CONFIG.DEFAULT_VIEWPORT,
            protocolTimeout: 90000,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            ignoreDefaultArgs: ['--enable-automation']
        };

        console.log('🚀 Launching Puppeteer with options:', JSON.stringify({ headless: launchOptions.headless, args: launchOptions.args }, null, 2));

        const browser = await puppeteer.launch(launchOptions);
        
        const page = await browser.newPage();

        await page.setUserAgent(BROWSER_CONFIG.USER_AGENT); 
        await page.setViewport({ 
            width: BROWSER_CONFIG.VIEWPORT_WIDTH,
            height: BROWSER_CONFIG.VIEWPORT_HEIGHT 
        });

        return { browser, page };
        
    } catch (error) {
        console.error('❌ Failed to launch browser:', error.message);
        throw new Error(`Browser launch failed: ${error.message}`);
    }
}


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
            // Filter out noise from analytics, tracking, and measurement requests
            const url = request.url();
            const isNoisyRequest = 
                url.includes('analytics') || 
                url.includes('tracking') || 
                url.includes('measurement') ||
                url.includes('google-analytics') ||
                url.includes('gtag') ||
                url.includes('googletagmanager') ||
                url.includes('facebook.com') ||
                url.includes('doubleclick') ||
                url.includes('ads') ||
                url.includes('conversion');
            
            // Only log significant request failures
            if (!isNoisyRequest) {
                console.warn(`🌐 Request Failed: ${request.method()} ${url}`);
            }
        });

        console.log('📋 Browser logging setup completed');
        
    } catch (error) {
        console.error('❌ Failed to setup browser logging:', error.message);
    }
}

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