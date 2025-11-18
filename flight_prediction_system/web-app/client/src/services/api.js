/**
 * API Service - Handles all backend API calls
 */

// API Base URL - automatically switches between development and production
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api'  // Production: same domain
  : 'http://localhost:3000/api';  // Development: backend port

/**
 * Crawl flights from BayDep
 * @param {Object} searchParams - Search parameters
 * @returns {Promise<Object>} Crawl results
 */
export const crawlBayDep = async (searchParams) => {
  try {
    const response = await fetch(`${API_BASE_URL}/crawl/baydep`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchParams),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error crawling BayDep:', error);
    throw error;
  }
};

/**
 * Crawl flights from VietJet
 * @param {Object} searchParams - Search parameters
 * @returns {Promise<Object>} Crawl results
 */
export const crawlVietJet = async (searchParams) => {
  try {
    const response = await fetch(`${API_BASE_URL}/crawl/vietjet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchParams),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error crawling VietJet:', error);
    throw error;
  }
};

/**
 * Get current flight configuration
 * @returns {Promise<Object>} Current config
 */
export const getFlightConfig = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/crawl/config`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting config:', error);
    throw error;
  }
};

/**
 * Check crawler health
 * @returns {Promise<Object>} Health status
 */
export const checkHealth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/crawl/health`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error checking health:', error);
    throw error;
  }
};

