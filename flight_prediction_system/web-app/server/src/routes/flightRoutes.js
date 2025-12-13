const express = require('express');
const router = express.Router();
const flightController = require('../controllers/flightController');

// Search flights
router.post('/search', flightController.searchFlights);

// Get cheapest tickets (global minimum search)
router.get('/cheapest', flightController.getCheapestTickets);

// Get monthly prices (calendar view)
router.get('/monthly-prices', flightController.getMonthlyPrices);

// Get airlines
router.get('/airlines', flightController.getAirlines);

// Get flight classes
router.get('/classes', flightController.getFlightClasses);

// Get price history
router.get('/price-history', flightController.getPriceHistory);

// Get popular destinations
router.get('/popular-destinations', flightController.getPopularDestinations);

module.exports = router;





