const axios = require('axios');

// ML API Configuration
const ML_API_URL = process.env.ML_API_URL || 'http://localhost:5000';

/**
 * Service for communicating with the ML prediction API
 */
class MLService {

  async predictFlightPrice(flightData) {
    try {
      const response = await axios.post(`${ML_API_URL}/api/predict`, flightData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      return {
        success: true,
        data: response.data.data
      };
    } catch (error) {
      console.error('ML Service Error:', error.message);

      if (error.response) {
        // The request was made and the server responded with a status code
        return {
          success: false,
          error: error.response.data.error || 'ML prediction failed',
          statusCode: error.response.status
        };
      } else if (error.request) {
        // The request was made but no response was received
        return {
          success: false,
          error: 'ML API service is not available. Please ensure the Python ML service is running.',
          details: 'No response from ML API server'
        };
      } else {
        // Something happened in setting up the request
        return {
          success: false,
          error: 'Failed to communicate with ML service',
          details: error.message
        };
      }
    }
  }

  /**
   * Batch prediction for multiple flights
   * @param {Array} flights - Array of flight information objects
   * @returns {Promise<Object>} Batch prediction results
   */
  async batchPredict(flights) {
    try {
      const response = await axios.post(`${ML_API_URL}/api/batch-predict`, {
        flights
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 second timeout for batch
      });

      return {
        success: true,
        data: response.data.data
      };
    } catch (error) {
      console.error('ML Batch Service Error:', error.message);

      return {
        success: false,
        error: error.response?.data?.error || 'Batch prediction failed',
        statusCode: error.response?.status
      };
    }
  }

  /**
   * Normalize class name based on airline
   * @param {string} airline - Airline code
   * @param {string} className - Class name to normalize
   * @returns {Promise<Object>} Normalized class name
   */
  async normalizeClassName(airline, className) {
    try {
      const response = await axios.post(`${ML_API_URL}/api/normalize-class`, {
        airline,
        class_name: className
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      return {
        success: true,
        data: response.data.data
      };
    } catch (error) {
      console.error('ML Class Normalization Error:', error.message);

      return {
        success: false,
        error: error.response?.data?.error || 'Class normalization failed'
      };
    }
  }

  /**
   * Check if ML service is healthy
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${ML_API_URL}/health`, {
        timeout: 5000
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: 'ML API service is not available',
        details: error.message
      };
    }
  }
}

module.exports = new MLService();
