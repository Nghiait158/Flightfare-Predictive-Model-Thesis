import axios from 'axios';

const ML_API_URL = process.env.REACT_APP_ML_API_URL || 'http://localhost:5000/api/ml';

class MLService {
  /**
   * Get smart recommendations using ML model
   * @param {Object} params - Search parameters
   * @returns {Promise} ML recommendations
   */
  async getSmartRecommendations(params) {
    try {
      const response = await axios.post(`${ML_API_URL}/recommend`, {
        departure: params.from,
        arrival: params.to,
        targetDate: params.departDate,
        budget: params.budget || 5000000,
        preferences: {
          preferredTime: params.preferredTime || 'Morning',
          preferredClass: params.preferredClass || 'Eco',
          preferredAirlines: params.preferredAirlines || ['VN', 'VJ'],
          dateFlexibility: params.dateFlexibility || 3
        }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Error getting ML recommendations:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to get ML recommendations',
        error: error
      };
    }
  }

  /**
   * Predict price for a specific flight
   * @param {Object} flightInfo - Flight information
   * @returns {Promise} Price prediction
   */
  async predictPrice(flightInfo) {
    try {
      const response = await axios.post(`${ML_API_URL}/predict-price`, flightInfo);
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Error predicting price:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to predict price'
      };
    }
  }

  /**
   * Analyze flight with comprehensive details
   * @param {Object} flightInfo - Flight information
   * @returns {Promise} Flight analysis
   */
  async analyzeFlightComprehensive(flightInfo) {
    try {
      const response = await axios.post(`${ML_API_URL}/analyze-flight`, flightInfo);
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Error analyzing flight:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to analyze flight'
      };
    }
  }

  /**
   * Get price trends for a route
   * @param {Object} params - Route parameters
   * @returns {Promise} Price trends
   */
  async getPriceTrends(params) {
    try {
      const response = await axios.get(`${ML_API_URL}/price-trends`, {
        params: {
          from: params.from,
          to: params.to,
          startDate: params.startDate,
          endDate: params.endDate
        }
      });
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Error getting price trends:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to get price trends'
      };
    }
  }

  /**
   * Get buy score for a flight (should I buy now?)
   * @param {Object} flightInfo - Flight information
   * @returns {Promise} Buy score and recommendation
   */
  async getBuyScore(flightInfo) {
    try {
      const response = await axios.post(`${ML_API_URL}/buy-score`, flightInfo);
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Error getting buy score:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to get buy score'
      };
    }
  }
}

export default new MLService();

