/**
 * @fileoverview Configuration loading utilities
 */

import { readCSVFile, readJSONFile } from '../utils/fileUtils.js';
import { AIRPORTS_CSV_PATH, FLIGHT_CONFIG_PATH } from '../constants/paths.js';

/**
 * @typedef {Object} Airport
 * @property {string} code - Airport code (e.g., 'SGN')
 * @property {string} city - City name (e.g., 'Tp. Hồ Chí Minh')
 * @property {string} airport_name - Full airport name (e.g., 'Sân bay Tân Sơn Nhất')
 * @property {string} country - Country name (e.g., 'Việt Nam')
 */

/**
 * @typedef {Object} FlightConfig
 * @property {string} departure_airport - Departure airport code
 * @property {string} arrival_airport - Arrival airport code
 * @property {Object} search_options - Search configuration options
 * @property {string} search_options.trip_type - Trip type (oneway/roundtrip)
 * @property {boolean} search_options.find_cheapest - Whether to find cheapest ticket
 * @property {string} search_options.departure_date - Departure date
 */

/**
 * @typedef {Object} LoadedConfig
 * @property {FlightConfig} flightConfig - Validated flight configuration
 * @property {Array<Airport>} airports - Array of available airports
 * @property {Airport} departureAirport - Departure airport details
 * @property {Airport} arrivalAirport - Arrival airport details
 */

/**
 * Validates the structure and content of the airports data.
 * @param {Array<Airport>} airports - The array of airport objects to validate.
 * @throws {Error} If the airports data is invalid.
 */
function validateAirportsData(airports) {
    if (!Array.isArray(airports) || airports.length === 0) {
        throw new Error('Airports data must be a non-empty array');
    }

    const requiredFields = ['code', 'city', 'airport_name', 'country'];
    
    for (let i = 0; i < airports.length; i++) {
        const airport = airports[i];
        const missingFields = [];

        for (const field of requiredFields) {
            if (!airport[field] || typeof airport[field] !== 'string' || airport[field].trim() === '') {
                missingFields.push(field);
            }
        }

        if (missingFields.length > 0) {
            throw new Error(`Airport at index ${i} is missing required fields: ${missingFields.join(', ')}`);
        }
    }
}

/**
 * Loads the main configuration file and the airports database.
 * The main config file is expected to have 'targets' and 'global_settings'.
 * Airport validation is performed, but target-specific validation is deferred.
 * @param {string} airportsPath - Path to the airports CSV file.
 * @param {string} configPath - Path to the main JSON configuration file.
 * @returns {Promise<object>} An object containing the loaded config and airports list.
 */
export async function loadFlightConfig(airportsPath = AIRPORTS_CSV_PATH, configPath = FLIGHT_CONFIG_PATH) {
    try {
        // Read and validate airport data first
        const airports = readCSVFile(airportsPath);
        validateAirportsData(airports);

        // Read the main configuration file
        const config = readJSONFile(configPath);

        // Basic validation for the new structure
        if (!config.targets || !Array.isArray(config.targets)) {
            throw new Error("Configuration file must contain a 'targets' array.");
        }
        if (!config.global_settings) {
            console.warn("Configuration file is missing 'global_settings'.");
        }

        console.log('Configuration and airports loaded successfully.');

        return {
            ...config,
            airports,
        };

    } catch (error) {
        console.error('❌ Configuration loading failed:', error.message);
        throw new Error(`Failed to load flight configuration: ${error.message}`);
    }
}

// -----------------------Gets available airports filtered by country------------
export function getAirportsByCountry(airports, country) {
    return airports.filter(airport => 
        airport.country && airport.country.toLowerCase() === country.toLowerCase()
    );
}

// -------------------------- Gets airport details by code--------------------

// export function getAirportByCode(airports, code) {
//     return findAirportByCode(airports, code) || null;
// }

// Validates if a route (departure → arrival) is real
export function isRouteSupported(airports, departureCode, arrivalCode) {
    const departure = findAirportByCode(airports, departureCode);
    const arrival = findAirportByCode(airports, arrivalCode);
    return departure && arrival && departure.code !== arrival.code;
} 