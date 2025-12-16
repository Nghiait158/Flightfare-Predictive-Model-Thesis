const express = require('express');
const router = express.Router();
const flightController = require('../controllers/flightController');

// Search flights
router.post('/search', flightController.searchFlights);

// Get nearby date prices (for price comparison)
router.post('/nearby-prices', flightController.getNearbyDatePrices);

// Get cheapest tickets (global minimum search)
router.get('/cheapest', flightController.getCheapestTickets);

// Get airlines
router.get('/airlines', flightController.getAirlines);

// Get flight classes
router.get('/classes', flightController.getFlightClasses);

// Get price history
router.get('/price-history', flightController.getPriceHistory);

// Get price chart data (cheapest per day)
router.get('/price-chart', flightController.getPriceChartData);

// Get popular destinations
router.get('/popular-destinations', flightController.getPopularDestinations);

module.exports = router;





