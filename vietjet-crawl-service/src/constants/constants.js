/**
 * @fileoverview Common constants for the flight crawler application
 */

/**
 * Delay constants in milliseconds
 */
// export const DELAY_SHORT = 500;
// export const DELAY_MEDIUM = 1000;
// export const DELAY_LONG = 2000;
// export const DELAY_EXTRA_LONG = 5000;

export const DELAY_SHORT = 5;
export const DELAY_MEDIUM = 1;
export const DELAY_LONG = 2;
export const DELAY_EXTRA_LONG = 5;

/**
 * Creates a delay with optional randomization to simulate human behavior
 * @param {number} ms - Base delay in milliseconds
 * @param {boolean} randomize - Whether to add random variation (default: true)
 * @returns {Promise<void>} Promise that resolves after the delay
 */
export const delay = (ms, randomize = true) => {
    const variance = randomize ? Math.random() * 1000 : 0;
    return new Promise(resolve => setTimeout(resolve, ms + variance));
};

/**
 * Browser configuration constants
 */
export const BROWSER_CONFIG = {
    HEADLESS: true,
    ARGS: [
        '--start-maximized',
        '--window-size=1920,1080',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--no-sandbox',
        '--disable-dev-shm-usage'
    ],
    USER_AGENT:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    DEFAULT_VIEWPORT: null,
    VIEWPORT_WIDTH: 1920,
    VIEWPORT_HEIGHT: 1080
};

/**
 * Timeout constants in milliseconds
 */
export const TIMEOUTS = {
    DEFAULT: 30000,
    NAVIGATION: 60000,
    ELEMENT_WAIT: 10000,
    NETWORK_IDLE: 5000,
    SCRIPT_EXECUTION: 8000
};

/**
 * Console message filters for browser logging
 */
export const CONSOLE_FILTERS = [
    'CORS',
    'Failed to load resource',
    'net::ERR_FAILED',
    'REACT_APP_',
    'JSHandle@object',
    'DOMNodeInserted',
    'Retargeting',
    'cdn-media.vinbase.ai'
];

/**
 * Application URLs
 */
export const URLS = {
    VIETJET_INSURANCE: 'https://www.vietjetair.com/vi/pages/bao-hiem-du-lich-sky-care-1681121104781'
};

/**
 * Application modes
 */
export const MODES = {
    PRODUCTION: 'production',
    DEVELOPMENT: 'development',
    DEBUG: 'debug'
}; 