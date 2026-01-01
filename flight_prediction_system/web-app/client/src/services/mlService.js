import axios from 'axios';

// ML API base URL (Python Flask server on port 5000)
const ML_API_URL = process.env.REACT_APP_ML_API_URL || 'http://localhost:5000';

class MLService {
  /**
   * Get full flight analysis with ML predictions
   * Calls: POST /api/ml/predict
   *
   * @param {Object} flightData - Flight information
   * @param {string} flightData.flight_number - Flight number (e.g., "VJ156")
   * @param {string} flightData.departure_airport - Departure airport code (e.g., "SGN")
   * @param {string} flightData.arrival_airport - Arrival airport code (e.g., "HAN")
   * @param {string} flightData.flight_date - Flight date YYYY-MM-DD (e.g., "2025-12-20")
   * @param {string} flightData.departure_time - Departure time HH:MM (e.g., "06:00")
   * @param {string} flightData.arrival_time - Arrival time HH:MM (optional)
   * @param {string} flightData.classes - Flight class (e.g., "Eco", "Economy", "Business")
   * @param {string} flightData.type_of_plane - Aircraft type (optional, e.g., "Airbus A321")
   * @returns {Promise<Object>} Comprehensive flight analysis
   */
  async analyzeFlightPrice(flightData) {
    try {
      const response = await axios.post(`${ML_API_URL}/api/predict`, flightData, {
        timeout: 30000, // 30 seconds timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        data: response.data.data // Extract nested data
      };
    } catch (error) {
      let errorMessage = 'Failed to analyze flight';

      if (error.response) {
        // Server responded with error status
        errorMessage = error.response.data?.error || error.response.data?.message || errorMessage;
      } else if (error.request) {
        // No response received
        errorMessage = 'ML prediction server is not responding. Please make sure the ML API server is running on port 5000.';
      } else {
        // Error in request setup
        errorMessage = error.message;
      }

      return {
        success: false,
        message: errorMessage,
        error: error
      };
    }
  }

  /**
   * Get quick price prediction without full analysis
   * Calls: POST /api/ml/quick-predict
   *
   * @param {Object} flightData - Same structure as analyzeFlightPrice
   * @returns {Promise<Object>} Price breakdown only
   */
  async quickPredict(flightData) {
    try {
      const response = await axios.post(`${ML_API_URL}/api/ml/quick-predict`, flightData, {
        timeout: 10000, // 10 seconds timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        data: response.data.data
      };
    } catch (error) {
      console.error('Error in quick prediction:', error);

      return {
        success: false,
        message: error.response?.data?.message || 'Quick prediction failed'
      };
    }
  }

  /**
   * Get ML model information
   * Calls: GET /api/ml/model-info
   *
   * @returns {Promise<Object>} Model metadata
   */
  async getModelInfo() {
    try {
      const response = await axios.get(`${ML_API_URL}/api/ml/model-info`, {
        timeout: 5000
      });

      return {
        success: true,
        data: response.data.data
      };
    } catch (error) {
      console.error('Error fetching model info:', error);
      return {
        success: false,
        message: 'Failed to fetch model info'
      };
    }
  }

  /**
   * Check if ML API server is healthy
   * Calls: GET /health
   *
   * @returns {Promise<boolean>} True if healthy and ML engine loaded
   */
  async checkHealth() {
    try {
      const response = await axios.get(`${ML_API_URL}/health`, {
        timeout: 5000
      });

      const isHealthy = response.data.status === 'healthy' &&
                       response.data.model_loaded === true;

      return isHealthy;
    } catch (error) {
      console.error('ML API health check failed:', error.message);
      return false;
    }
  }

  /**
   * Legacy method - kept for backward compatibility
   * Use analyzeFlightPrice instead
   */
  async analyzeFlightComprehensive(flightInfo) {
    return this.analyzeFlightPrice(flightInfo);
  }

  /**
   * Legacy method - kept for backward compatibility
   * Use quickPredict instead
   */
  async predictPrice(flightInfo) {
    return this.quickPredict(flightInfo);
  }
}

const mlService = new MLService();
export default mlService;

