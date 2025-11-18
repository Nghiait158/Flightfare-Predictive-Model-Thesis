# VietJet Crawler Module

## Overview
This module provides automated crawling functionality for VietJet Airlines flight data. It has been integrated from the standalone `vietjet-crawl-service` microservice into the monolithic flight prediction system.

## Features
- ✈️ Flight search automation for VietJet Airlines
- 🔄 Multi-date crawling (crawl up to 15 days of flight data)
- 👨‍👩‍👧‍👦 Passenger configuration (adult, child, infant)
- 🎯 Trip type support (one-way and round-trip)
- 🔁 Automatic retry mechanism
- 📸 Screenshot capture for debugging
- 💾 CSV and JSON data export

## Module Structure

```
vietjet/
├── index.js                 # Module exports
├── crawlerService.js        # Main crawler orchestration
├── flightService.js         # Flight search workflow
├── crawlDataByDate.js       # Data extraction logic
└── README.md               # This file
```

## API Endpoint

### POST /api/crawl/vietjet

Crawl flight data from VietJet Airlines.

#### Request Body

```json
{
  "departure_airport": "SGN",           // Required: IATA airport code
  "arrival_airport": "HAN",             // Required: IATA airport code
  "departure_date": "20/12/2025",       // Required: DD/MM/YYYY format
  "return_date": "25/12/2025",          // Optional: Required for roundtrip
  "adult": 1,                           // Required: Number of adults (min: 1)
  "child": 0,                           // Required: Number of children (min: 0)
  "infant": 0,                          // Required: Number of infants (min: 0)
  "trip_type": "oneway",                // Optional: "oneway" or "roundtrip" (default: "oneway")
  "find_cheapest": false,               // Optional: Find cheapest option (default: false)
  "use_retry": true,                    // Optional: Use retry mechanism (default: true)
  "clear_screenshots": true             // Optional: Clear screenshots before crawl (default: true)
}
```

#### Response

```json
{
  "success": true,
  "message": "Crawling completed successfully",
  "data": {
    "search_parameters": {
      "departure_airport": "SGN",
      "arrival_airport": "HAN",
      "departure_date": "20/12/2025",
      "trip_type": "oneway",
      "adult": 1,
      "child": 0,
      "infant": 0
    },
    "route_info": {
      "departure": {
        "city": "Tp. Hồ Chí Minh",
        "airport_name": "Sân bay Tân Sơn Nhất",
        "code": "SGN"
      },
      "arrival": {
        "city": "Hà Nội",
        "airport_name": "Sân bay Nội Bài",
        "code": "HAN"
      }
    },
    "execution_stats": {
      "success": true,
      "execution_time_ms": 45000,
      "execution_time_formatted": "45.00 seconds",
      "steps_completed": 8,
      "screenshots_taken": 3,
      "start_time": "2025-11-17T10:00:00.000Z",
      "end_time": "2025-11-17T10:00:45.000Z"
    },
    "results": {
      "total_days_crawled": 15,
      "total_price_options": 120,
      "total_unique_flights": 8,
      "daily_results": [...]
    },
    "screenshots": [...],
    "timestamp": "2025-11-17T10:00:45.000Z"
  }
}
```

## Usage Example

### Using curl

```bash
curl -X POST http://localhost:3000/api/crawl/vietjet \
  -H "Content-Type: application/json" \
  -d '{
    "departure_airport": "SGN",
    "arrival_airport": "HAN",
    "departure_date": "20/12/2025",
    "adult": 1,
    "child": 0,
    "infant": 0,
    "trip_type": "oneway"
  }'
```

### Using JavaScript/Node.js

```javascript
const response = await fetch('http://localhost:3000/api/crawl/vietjet', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    departure_airport: 'SGN',
    arrival_airport: 'HAN',
    departure_date: '20/12/2025',
    adult: 1,
    child: 0,
    infant: 0,
    trip_type: 'oneway'
  })
});

const data = await response.json();
console.log(data);
```

## Data Output

The crawler saves flight data in two formats:

### CSV Format
Location: `data/result/flight_price_history.csv`

Columns:
- `created_at`: Timestamp when data was collected
- `flight_number`: VietJet flight number (e.g., VJ123)
- `aircraft_type`: Aircraft model (e.g., Airbus A321)
- `departure_airport`: IATA code of departure airport
- `arrival_airport`: IATA code of arrival airport
- `flight_date`: ISO date of flight
- `departure_time`: Departure time (HH:MM)
- `arrival_time`: Arrival time (HH:MM)
- `classes`: Ticket class (Eco, Deluxe, Business, Skyboss)
- `price`: Ticket price in VND
- `adult`: Number of adults
- `child`: Number of children
- `infant`: Number of infants

### JSON Format
Location: `data/result/flight_price_history.json`

Contains detailed crawl results with metadata.

## Integration Notes

This module was migrated from the standalone `vietjet-crawl-service` microservice with the following changes:

1. **Import paths updated**: All imports now reference the monolith's shared utilities
   - `../../utils/constants.js` for delays and browser config
   - `../../utils/browserUtils.js` for browser operations
   - `../../utils/domUtils.js` for DOM interactions
   - `../../utils/fileUtils.js` for file operations
   - `../../utils/selectors.js` for CSS selectors

2. **Configuration paths**: Uses the monolith's centralized config
   - `../../../config/loadConfig.js` for loading flight configurations

3. **Routes integration**: Added to `crawl.routes.js` alongside other crawlers

4. **Shared dependencies**: Uses the monolith's existing Puppeteer and CSV writer dependencies

## Dependencies

All dependencies are managed at the monolith level:
- `puppeteer`: Browser automation
- `csv-writer`: CSV file generation
- `express`: REST API
- `dotenv`: Environment configuration

## Development

### Adding New Features

1. Update the service files in this directory
2. Ensure imports use the monolith's shared utilities
3. Add tests if necessary
4. Update this README with new features

### Debugging

- Set `clear_screenshots: false` to keep screenshots for debugging
- Screenshots are saved in `screenshot/` directory
- Check console logs for detailed execution flow

## Migration from Microservice

The original microservice (`vietjet-crawl-service`) has been fully integrated. The standalone service can be deprecated or used for comparison/testing purposes.

### Original Endpoints (deprecated)
- `POST /api/v1/crawl-by-date/1adlt/vietjet`
- `POST /api/v2/crawl-by-date/vietjet`

### New Monolith Endpoint
- `POST /api/crawl/vietjet`

## Author
Trinh Van Trung Nghia - ITITIU21254

## License
ISC


