import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3003/api';

const flightService = {

  searchFlights: async (searchParams) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/flights/search`, searchParams);
      return response.data;
    } catch (error) {
      console.error('Error searching flights:', error);
      throw error;
    }
  },

  getNearbyDatePrices: async (from, to, dates) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/flights/nearby-prices`, {
        from,
        to,
        dates
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching nearby date prices:', error);
      throw error;
    }
  },


  getFlightById: async (flightId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/flights/${flightId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching flight details:', error);
      throw error;
    }
  },


  getPriceHistory: async (params) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/flights/price-history`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching price history:', error);
      throw error;
    }
  },

  getAirlines: async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/flights/airlines`);
      return response.data;
    } catch (error) {
      console.error('Error fetching airlines:', error);
      throw error;
    }
  },

  getFlightClasses: async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/flights/classes`);
      return response.data;
    } catch (error) {
      console.error('Error fetching flight classes:', error);
      throw error;
    }
  },


  getPopularDestinations: async (airportCode) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/flights/popular-destinations`, {
        params: { from: airportCode }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching popular destinations:', error);
      throw error;
    }
  },

  getCheapestTickets: async (params) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/flights/cheapest`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching cheapest tickets:', error);
      throw error;
    }
  },

  getPriceChartData: async (params) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/flights/price-chart`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching price chart data:', error);
      throw error;
    }
  },
};

export default flightService;





