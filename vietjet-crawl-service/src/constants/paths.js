import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVICE_ROOT = path.join(__dirname, '..', '..');
const PROJECT_ROOT = path.join(SERVICE_ROOT, '..');

export const BASE_DIR = SERVICE_ROOT;

export const AIRPORTS_CSV_PATH = path.join(PROJECT_ROOT, 'airports.csv');
export const FLIGHT_CONFIG_PATH = path.join(PROJECT_ROOT, 'flight-config.json');

// export const CRAWLER_DATA_SCRIPT = path.join(BASE_DIR, 'src', 'crawler_data.js');

export const SCREENSHOT_DIR = path.join(PROJECT_ROOT, 'screenshot');
export const RESULT_DIR = path.join(PROJECT_ROOT, 'result');

export const FLIGHT_RESULTS_PATH = path.join(SCREENSHOT_DIR, 'flight_results.json');
export const ERROR_SCREENSHOT_PATH = path.join(SCREENSHOT_DIR, 'error.png');
export const FINAL_SCREENSHOT_PATH = path.join(SCREENSHOT_DIR, 'final_result.png');
export const DEBUG_SCREENSHOT_PATH = path.join(SCREENSHOT_DIR, 'debug-airport-selection.png');

export const getTimestampedScreenshotPath = (name) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(SCREENSHOT_DIR, `${name}_${timestamp}.png`);
}; 