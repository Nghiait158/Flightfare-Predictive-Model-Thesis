import path from 'path';

export const BASE_DIR = process.cwd();

export const AIRPORTS_CSV_PATH = path.join(BASE_DIR, '..', 'airports.csv');
export const FLIGHT_CONFIG_PATH = path.join(BASE_DIR, 'flight-config.json');

export const CRAWLER_DATA_SCRIPT = path.join(BASE_DIR, 'src', 'crawler_data.js');

export const SCREENSHOT_DIR = path.join(BASE_DIR, 'screenshot');
export const RESULT_DIR = path.join(BASE_DIR, 'result');

export const FLIGHT_RESULTS_PATH = path.join(SCREENSHOT_DIR, 'flight_results.json');
export const ERROR_SCREENSHOT_PATH = path.join(SCREENSHOT_DIR, 'error.png');
export const FINAL_SCREENSHOT_PATH = path.join(SCREENSHOT_DIR, 'final_result.png');
export const DEBUG_SCREENSHOT_PATH = path.join(SCREENSHOT_DIR, 'debug-airport-selection.png');

export const getTimestampedScreenshotPath = (name) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(SCREENSHOT_DIR, `${name}_${timestamp}.png`);
}; 