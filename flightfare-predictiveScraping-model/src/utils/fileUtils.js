import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { SCREENSHOT_DIR } from '../constants/paths.js';

// -----------READ_CSV------------
export function readCSVFile(filePath) {
    try {
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`CSV file not found: ${filePath}`);
        }

        const csvContent = fs.readFileSync(filePath, 'utf-8');
        const lines = csvContent.trim().split('\n');
        
        if (lines.length === 0) {
            throw new Error('CSV file is empty:');    
        }
        
        const headers = lines[0].split(',').map(h => h.trim());
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const row = {};
            
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            
            data.push(row);
        }
        
        console.log(`Read ${data.length} records from CSV: ${path.basename(filePath)}`);
        return data;
        
    } catch (error) {
        console.error(`❌ Error reading CSV file ${filePath}:`, error.message);
        throw new Error(`Failed to read CSV file: ${error.message}`);
    }
}  

// -------READ_JSON----------
export function readJSONFile(filePath) {
    try {
        // console.log(`📖 Reading JSON file: ${path.basename(filePath)}`);
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`JSON file not found: ${filePath}`);
        }

        const jsonContent = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(jsonContent);
        
        console.log(`Read JSON file: ${path.basename(filePath)}`);
        return data;
        
    } catch (error) {
        console.error(`❌ Error reading JSON file ${filePath}:`, error.message);
        throw new Error(`Failed to read JSON file: ${error.message}`);
    }
}

// --------WRITE_JSON
export function writeJSONFile(data, filePath, pretty = true) {
    try {
        console.log(`Writing JSON file: ${path.basename(filePath)}`);
        
        const jsonContent = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
        
        // Ensure directory exists
        const directory = path.dirname(filePath);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
            console.log(`📁 Created directory: ${directory}`);
        }
        
        fs.writeFileSync(filePath, jsonContent, 'utf-8');
        console.log(`✅ Successfully wrote JSON file: ${path.basename(filePath)}`);
        
    } catch (error) {
        console.error(`❌ Error writing JSON file ${filePath}:`, error.message);
        throw new Error(`Failed to write JSON file: ${error.message}`);
    }
}


export function clearDirectory(directoryPath) {
    try {
        // console.log(`Clearing directory: ${path.basename(directoryPath)}`);
        
        if (fs.existsSync(directoryPath)) {
            const files = fs.readdirSync(directoryPath);
            let deletedCount = 0;
            
            for (const file of files) {
                const filePath = path.join(directoryPath, file);
                const stat = fs.statSync(filePath);
                
                if (stat.isFile()) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            }
            
            if (deletedCount > 0) {
                console.log(`Cleared ${deletedCount} files from directory: ${path.basename(directoryPath)}`);
            } else {
                console.log(`Directory already empty: ${path.basename(directoryPath)}`);
            }
        } else {
            fs.mkdirSync(directoryPath, { recursive: true });
            console.log(`Created directory: ${path.basename(directoryPath)}`);
        }
        
    } catch (error) {
        console.error(`❌ Error clearing directory ${directoryPath}:`, error.message);
        throw new Error(`Failed to clear directory: ${error.message}`);
    }
}

/**
 * Checks if a file exists
 * @param {string} filePath - Path to check
 * @returns {boolean} True if file exists
 */
export function fileExists(filePath) {
    return fs.existsSync(filePath);
}

/**
 * Gets file size in bytes
 * @param {string} filePath - Path to the file
 * @returns {number} File size in bytes
 * @throws {Error} If file doesn't exist
 */
export function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.size;
    } catch (error) {
        throw new Error(`Cannot get file size: ${error.message}`);
    }
}

/**
 * Reads a text file for script injection
 * @param {string} filePath - Path to the script file
 * @returns {string} File content as string
 * @throws {Error} If file cannot be read
 */
export function readScriptFile(filePath) {
    try {
        console.log(`📜 Reading script file: ${path.basename(filePath)}`);
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`Script file not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        console.log(`📜 Read script file: ${path.basename(filePath)} (${content.length} chars)`);
        return content;
    } catch (error) {
        console.error(`❌ Error reading script file ${filePath}:`, error.message);
        throw new Error(`Failed to read script file: ${error.message}`);
    }
}

/**
 * Initialize screenshot directory (convenience function)
 * Clears the screenshot directory used by the application
 */
export function initializeScreenshotDirectory() {
    clearDirectory(SCREENSHOT_DIR);
}

/**
 * Appends data to a JSON file. If the file doesn't exist, it's created.
 * Assumes the root of the JSON file is an array.
 * @param {string} filePath - Path to the JSON file.
 * @param {Object} dataToAppend - The new data object to add to the array.
 */
export function appendToJsonFile(filePath, dataToAppend) {
    try {
        let existingData = [];
        
        // Ensure directory exists
        const directory = path.dirname(filePath);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
            console.log(`📁 Created directory: ${directory}`);
        }

        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            // Avoid parsing empty files
            if (fileContent) {
                try {
                    existingData = JSON.parse(fileContent);
                } catch (parseError) {
                    console.error(`❌ Error parsing existing JSON file at ${filePath}. It will be overwritten.`, parseError);
                    existingData = [];
                }
            }
        }
        
        // Ensure the existing data is an array
        if (!Array.isArray(existingData)) {
            console.warn(`File at ${filePath} does not contain a JSON array. Overwriting with new data.`);
            existingData = [];
        }

        existingData.push(dataToAppend);

        fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2), 'utf-8');
        console.log(`✅ Data appended to ${filePath}`);
    } catch (error) {
        console.error(`❌ Failed to append to JSON file at ${filePath}:`, error);
    }
}

/**
 * Appends data to a CSV file.
 * Creates the file and adds headers if it doesn't exist.
 * @param {string} filePath - Path to the CSV file
 * @param {Array<Object>} records - Array of records to append
 */
export async function appendToCsvFile(filePath, records) {
    try {
        const fileExists = fs.existsSync(filePath);
        
        // Ensure directory exists
        const directory = path.dirname(filePath);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
            console.log(`📁 Created directory: ${directory}`);
        }

        const csvWriter = createObjectCsvWriter({
            path: filePath,
            header: [
                { id: 'created_at', title: 'created_at' },
                { id: 'flight_number', title: 'flight_number' },
                { id: 'aircraft_type', title: 'aircraft_type' },
                { id: 'departure_airport', title: 'departure_airport' },
                { id: 'arrival_airport', title: 'arrival_airport' },
                { id: 'flight_date', title: 'flight_date' },
                { id: 'departure_time', title: 'departure_time' },
                { id: 'arrival_time', title: 'arrival_time' },
                { id: 'classes', title: 'classes' },
                { id: 'price', title: 'price' },
            ],
            append: fileExists,
            writeHeaders: !fileExists
        });
        const currentTime = new Date().toISOString(); 
        
        const recordsWithTimestamp = records.map(record => ({
            created_at: currentTime,
            ...record
        }));

        await csvWriter.writeRecords(recordsWithTimestamp);
        
        console.log(`✅ Data appended to ${path.basename(filePath)}`);
    } catch (error) {
        console.error(`❌ Error writing to CSV file:`, error);
    }
}