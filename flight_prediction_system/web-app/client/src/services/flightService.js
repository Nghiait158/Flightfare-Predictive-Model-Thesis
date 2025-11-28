import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3003/api';

/**
 * Flight Service
 * Handles all flight-related API calls
 */
const flightService = {
  /**
   * Search for flights based on search criteria
   * @param {Object} searchParams - Search parameters
   * @param {string} searchParams.from - Departure airport code
   * @param {string} searchParams.to - Arrival airport code
   * @param {string} searchParams.departDate - Departure date (YYYY-MM-DD)
   * @param {string} searchParams.returnDate - Return date (YYYY-MM-DD) - optional
   * @param {string} searchParams.tripType - 'one-way' or 'return'
   * @param {number} searchParams.adults - Number of adults (default: 1)
   * @param {number} searchParams.children - Number of children (default: 0)
   * @returns {Promise} Flight results
   */
  searchFlights: async (searchParams) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/flights/search`, searchParams);
      return response.data;
    } catch (error) {
      console.error('Error searching flights:', error);
      throw error;
    }
  },

  /**
   * Get flight details by ID
   * @param {number} flightId - Flight ID
   * @returns {Promise} Flight details
   */
  getFlightById: async (flightId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/flights/${flightId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching flight details:', error);
      throw error;
    }
  },

  /**
   * Get flight price history
   * @param {Object} params - Query parameters
   * @returns {Promise} Price history data
   */
  getPriceHistory: async (params) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/flights/price-history`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching price history:', error);
      throw error;
    }
  },

  /**
   * Get available airlines
   * @returns {Promise} List of airlines
   */
  getAirlines: async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/flights/airlines`);
      return response.data;
    } catch (error) {
      console.error('Error fetching airlines:', error);
      throw error;
    }
  },

  /**
   * Get flight classes
   * @returns {Promise} List of flight classes
   */
  getFlightClasses: async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/flights/classes`);
      return response.data;
    } catch (error) {
      console.error('Error fetching flight classes:', error);
      throw error;
    }
  },
};

export default flightService;



