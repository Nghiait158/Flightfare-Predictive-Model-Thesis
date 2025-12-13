
// export const DELAY_SHORT = 500;
// export const DELAY_MEDIUM = 1000;
// export const DELAY_LONG = 2000;
// export const DELAY_EXTRA_LONG = 5000;

export const DELAY_SHORT = 5;
export const DELAY_MEDIUM = 1;
export const DELAY_LONG = 2;
export const DELAY_EXTRA_LONG = 5;


export const delay = (ms, randomize = true) => {
    const variance = randomize ? Math.random() * 1000 : 0;
    return new Promise(resolve => setTimeout(resolve, ms + variance));
};


export const BROWSER_CONFIG = {
    HEADLESS: true,
    ARGS: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certifcate-errors',
        '--ignore-certifcate-errors-spki-list',
        '--disable-dev-shm-usage'
    ],
    USER_AGENT:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    DEFAULT_VIEWPORT: null,
    VIEWPORT_WIDTH: 1920,
    VIEWPORT_HEIGHT: 1080
};


export const TIMEOUTS = {
    DEFAULT: 30000,
    NAVIGATION: 90000,  // Increased from 60s to 90s for slow websites like baydep.vn
    ELEMENT_WAIT: 15000, // Increased from 10s to 15s
    NETWORK_IDLE: 10000, // Increased from 5s to 10s
    SCRIPT_EXECUTION: 15000 // Increased from 8s to 15s
};

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

export const URLS = {
    VIETJET_INSURANCE: 'https://www.vietjetair.com/vi/pages/bao-hiem-du-lich-sky-care-1681121104781'
};


export const MODES = {
    PRODUCTION: 'production',
    DEVELOPMENT: 'development',
    DEBUG: 'debug'
};






