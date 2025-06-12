/**
 * @fileoverview File utilities for reading CSV, JSON and managing directories
 */

import fs from 'fs';
import path from 'path';
import { SCREENSHOT_DIR } from '../constants/paths.js';

/**
 * Reads and parses a CSV file
 * @param {string} filePath - Path to the CSV file
 * @returns {Array<Object>} Array of objects representing CSV rows
 * @throws {Error} If file cannot be read or parsed
 */
export function readCSVFile(filePath) {
    try {
        console.log(`📖 Reading CSV file: ${path.basename(filePath)}`);
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`CSV file not found: ${filePath}`);
        }

        const csvContent = fs.readFileSync(filePath, 'utf-8');
        const lines = csvContent.trim().split('\n');
        
        if (lines.length === 0) {
            throw new Error('CSV file is empty');
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
        
        console.log(`✅ Successfully read ${data.length} records from CSV: ${path.basename(filePath)}`);
        return data;
        
    } catch (error) {
        console.error(`❌ Error reading CSV file ${filePath}:`, error.message);
        throw new Error(`Failed to read CSV file: ${error.message}`);
    }
}

/**
 * Reads and parses a JSON file
 * @param {string} filePath - Path to the JSON file
 * @returns {Object} Parsed JSON object
 * @throws {Error} If file cannot be read or parsed
 */
export function readJSONFile(filePath) {
    try {
        console.log(`📖 Reading JSON file: ${path.basename(filePath)}`);
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`JSON file not found: ${filePath}`);
        }

        const jsonContent = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(jsonContent);
        
        console.log(`✅ Successfully read JSON file: ${path.basename(filePath)}`);
        return data;
        
    } catch (error) {
        console.error(`❌ Error reading JSON file ${filePath}:`, error.message);
        throw new Error(`Failed to read JSON file: ${error.message}`);
    }
}

/**
 * Writes data to a JSON file
 * @param {Object} data - Data to write
 * @param {string} filePath - Path to the output JSON file
 * @param {boolean} pretty - Whether to format JSON with indentation (default: true)
 * @throws {Error} If file cannot be written
 */
export function writeJSONFile(data, filePath, pretty = true) {
    try {
        console.log(`📝 Writing JSON file: ${path.basename(filePath)}`);
        
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

/**
 * Clears all files in a directory and creates it if it doesn't exist
 * @param {string} directoryPath - Path to the directory
 * @throws {Error} If directory operations fail
 */
export function clearDirectory(directoryPath) {
    try {
        console.log(`🗑️ Clearing directory: ${path.basename(directoryPath)}`);
        
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
                console.log(`🗑️ Cleared ${deletedCount} files from directory: ${path.basename(directoryPath)}`);
            } else {
                console.log(`ℹ️ Directory already empty: ${path.basename(directoryPath)}`);
            }
        } else {
            fs.mkdirSync(directoryPath, { recursive: true });
            console.log(`📁 Created directory: ${path.basename(directoryPath)}`);
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