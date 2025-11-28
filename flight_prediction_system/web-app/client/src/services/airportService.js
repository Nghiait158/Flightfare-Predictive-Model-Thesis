import { airports as localAirports } from '../data/airports';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export const airportService = {
  // Get all airports
  async getAllAirports() {
    try {
      const response = await fetch(`${API_BASE_URL}/airports`);
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.message || 'Failed to fetch airports');
      }
    } catch (error) {
      console.warn('Error fetching airports from API, using local data:', error);
      // Fallback to local data
      return localAirports;
    }
  },

  // Search airports
  async searchAirports(query) {
    try {
      const response = await fetch(`${API_BASE_URL}/airports/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.message || 'Failed to search airports');
      }
    } catch (error) {
      console.warn('Error searching airports from API, using local data:', error);
      // Fallback to local search
      const searchLower = query.toLowerCase();
      return localAirports.filter(airport => 
        airport.city.toLowerCase().includes(searchLower) ||
        airport.name.toLowerCase().includes(searchLower) ||
        airport.code.toLowerCase().includes(searchLower)
      );
    }
  },

  // Get airport by code
  async getAirportByCode(code) {
    try {
      const response = await fetch(`${API_BASE_URL}/airports/${code}`);
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.message || 'Failed to fetch airport');
      }
    } catch (error) {
      console.error('Error fetching airport:', error);
      throw error;
    }
  }
};

