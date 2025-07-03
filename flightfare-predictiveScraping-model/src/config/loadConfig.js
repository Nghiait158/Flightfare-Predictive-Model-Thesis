/**
 * @fileoverview Configuration loading and validation utilities
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
 * Validates required fields in flight configuration
 * @param {Object} config - Configuration object to validate
 * @throws {Error} If required fields are missing or invalid
 */


function validateFlightConfigStructure(config) {
    const requiredFields = ['departure_airport', 'arrival_airport'];
    const missingFields = [];

    for (const field of requiredFields) {
        if (!config[field] || typeof config[field] !== 'string' || config[field].trim() === '') {
            missingFields.push(field);
        }
    }

    if (missingFields.length > 0) {
        throw new Error(`Missing or invalid required fields in flight config: ${missingFields.join(', ')}`);
    }

    // Validate search_options if present
    if (config.search_options) {
        const { trip_type, find_cheapest, departure_date } = config.search_options;
        
        if (trip_type && !['oneway', 'roundtrip'].includes(trip_type)) {
            throw new Error(`Invalid trip_type: ${trip_type}. Must be 'oneway' or 'roundtrip'`);
        }
        
        if (find_cheapest !== undefined && typeof find_cheapest !== 'boolean') {
            throw new Error(`Invalid find_cheapest: ${find_cheapest}. Must be boolean`);
        }
        
        if (departure_date && typeof departure_date !== 'string') {
            throw new Error(`Invalid departure_date: ${departure_date}. Must be string`);
        }
    }
}

// --------------------Validates airport data structure---------------------
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
            throw new Error(`Airport at index ${i} missing required fields: ${missingFields.join(', ')}`);
        }

        // Validate airport code format (should be 3 uppercase letters)
        if (!/^[A-Z]{3}$/.test(airport.code)) {
            console.warn(`⚠️ Airport code '${airport.code}' at index ${i} may not follow standard format (3 uppercase letters)`);
        }
    }
}

// -------------------Finds airport by code------------
 
function findAirportByCode(airports, code) {
    return airports.find(airport => 
        airport.code && airport.code.toUpperCase() === code.toUpperCase()
    );
}

// ---------------Validates that departure and arrival airports exist in the airports data---------------

function validateAirportAvailability(flightConfig, airports) {
    const departureAirport = findAirportByCode(airports, flightConfig.departure_airport);
    const arrivalAirport = findAirportByCode(airports, flightConfig.arrival_airport);

    if (!departureAirport) {
        throw new Error(`Departure airport '${flightConfig.departure_airport}' not found in airports database`);
    }

    if (!arrivalAirport) {
        throw new Error(`Arrival airport '${flightConfig.arrival_airport}' not found in airports database`);
    }

    if (departureAirport.code === arrivalAirport.code) {
        throw new Error('Departure and arrival airports cannot be the same');
    }

    return { departureAirport, arrivalAirport };
}

// -----------------------------Loads and validates flight configuration and airports data-----------------------------------

export async function loadFlightConfig(airportsPath = AIRPORTS_CSV_PATH, configPath = FLIGHT_CONFIG_PATH) {
    try {
        
        // read airport data
        const airports = readCSVFile(airportsPath);
        validateAirportsData(airports);

        // read fight config
        const flightConfig = readJSONFile(configPath);
        validateFlightConfigStructure(flightConfig);
        console.log(`Flight configuration loaded: ${flightConfig.departure_airport} → ${flightConfig.arrival_airport}`);

        const { departureAirport, arrivalAirport } = validateAirportAvailability(flightConfig, airports);

        
        const defaultSearchOptions = {
            trip_type: 'oneway',
            find_cheapest: true,
            departure_date: 'today'
        };

        // If there is no previous config, the default is as above
        // Nếu không có config trc thì mặc định như bên trên 
        const finalConfig = {
            ...flightConfig,
            search_options: {
                ...defaultSearchOptions,
                ...flightConfig.search_options
            }
        };
        return {
            flightConfig: finalConfig,
            airports,
            departureAirport,
            arrivalAirport
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