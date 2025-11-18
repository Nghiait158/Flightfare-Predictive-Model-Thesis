const express = require('express');
const router = express.Router();
const airportController = require('../controllers/airportController');

// GET /api/airports - Get all airports
router.get('/', airportController.getAllAirports);

// GET /api/airports/search?q=hanoi - Search airports
router.get('/search', airportController.searchAirports);

// GET /api/airports/:code - Get airport by code
router.get('/:code', airportController.getAirportByCode);

module.exports = router;

