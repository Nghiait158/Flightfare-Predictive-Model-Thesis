const express = require('express');
const router = express.Router();
const flightController = require('../controllers/flightController');

// Search flights
router.post('/search', flightController.searchFlights);

// Get airlines
router.get('/airlines', flightController.getAirlines);

// Get flight classes
router.get('/classes', flightController.getFlightClasses);

// Get price history
router.get('/price-history', flightController.getPriceHistory);

module.exports = router;



