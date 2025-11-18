const pool = require('../config/database');

// Get all airports
const getAllAirports = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT airport_id, airport_code as code, city, airport_name as name, country FROM airports ORDER BY city'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching airports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch airports',
      error: error.message
    });
  }
};

// Search airports by query (city, name, or code)
const searchAirports = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json({
        success: true,
        data: []
      });
    }

    const searchTerm = `%${q.toLowerCase()}%`;
    
    const result = await pool.query(
      `SELECT airport_id, airport_code as code, city, airport_name as name, country 
       FROM airports 
       WHERE LOWER(city) LIKE $1 
          OR LOWER(airport_name) LIKE $1 
          OR LOWER(airport_code) LIKE $1
       ORDER BY city
       LIMIT 10`,
      [searchTerm]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error searching airports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search airports',
      error: error.message
    });
  }
};

// Get airport by code
const getAirportByCode = async (req, res) => {
  try {
    const { code } = req.params;
    
    const result = await pool.query(
      'SELECT airport_id, airport_code as code, city, airport_name as name, country FROM airports WHERE airport_code = $1',
      [code.toUpperCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Airport not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching airport:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch airport',
      error: error.message
    });
  }
};

module.exports = {
  getAllAirports,
  searchAirports,
  getAirportByCode
};

