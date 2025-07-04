# VietJet Crawl Microservice API

A RESTful API microservice for crawling VietJet flight data. This service provides endpoints to search and retrieve flight information from VietJet Air.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Chrome/Chromium browser (for Puppeteer)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the API server:
```bash
npm start
# or for development
npm run dev
```

The server will start on port 3001 (or the port specified in the `PORT` environment variable).

## 📋 API Endpoints

### Health Check
**GET** `/health`

Check if the service is running.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2025-01-04T10:30:00.000Z",
  "service": "vietjet-crawl-service"
}
```

### Main Crawling Endpoint
**POST** `/api/v1/crawl/vietjet`

Perform flight search crawling with specified parameters.

**Request Body:**
```json
{
  "departure_airport": "SGN",
  "arrival_airport": "HAN", 
  "departure_date": "15/02/2025",
  "return_date": "20/02/2025",
  "trip_type": "roundtrip",
  "find_cheapest": false,
  "use_retry": true,
  "clear_screenshots": true
}
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `departure_airport` | string | ✅ | - | IATA airport code (e.g., "SGN", "HAN") |
| `arrival_airport` | string | ✅ | - | IATA airport code (e.g., "SGN", "HAN") |
| `departure_date` | string | ✅ | - | Departure date in DD/MM/YYYY format |
| `return_date` | string | ❌* | - | Return date in DD/MM/YYYY format (*required for roundtrip) |
| `trip_type` | string | ❌ | "oneway" | Trip type: "oneway" or "roundtrip" |
| `find_cheapest` | boolean | ❌ | false | Whether to find cheapest flights |
| `use_retry` | boolean | ❌ | true | Enable retry logic for failed attempts |
| `clear_screenshots` | boolean | ❌ | true | Clear screenshots directory before crawling |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Crawling completed successfully",
  "data": {
    "search_parameters": {
      "departure_airport": "SGN",
      "arrival_airport": "HAN",
      "departure_date": "15/02/2025",
      "trip_type": "oneway"
    },
    "route_info": {
      "departure": {
        "city": "Ho Chi Minh City",
        "airport_name": "Tan Son Nhat International Airport",
        "code": "SGN"
      },
      "arrival": {
        "city": "Hanoi",
        "airport_name": "Noi Bai International Airport", 
        "code": "HAN"
      }
    },
    "execution_stats": {
      "success": true,
      "execution_time_ms": 45230,
      "execution_time_formatted": "45.23 seconds",
      "steps_completed": 8,
      "screenshots_taken": 3,
      "start_time": "2025-01-04T10:30:00.000Z",
      "end_time": "2025-01-04T10:30:45.230Z"
    },
    "results": {
      "source": "vietjetair.com",
      "total_flights": 12,
      "flights": [...],
      "url": "https://www.vietjetair.com/vi/...",
      "timestamp": "2025-01-04T10:30:45.230Z"
    },
    "screenshots": [
      "screenshot/crawler-initial-page_2025-01-04T10-30-15-123Z.png",
      "screenshot/crawler-final-results_2025-01-04T10-30-45-230Z.png"
    ],
    "timestamp": "2025-01-04T10:30:45.230Z"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Missing required parameters: departure_airport, arrival_airport, departure_date",
  "required_fields": ["departure_airport", "arrival_airport", "departure_date"],
  "optional_fields": ["return_date", "trip_type", "find_cheapest", "use_retry", "clear_screenshots"]
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Browser launch failed",
  "message": "Crawling request failed due to internal error",
  "data": {
    "execution_time_ms": 5000,
    "timestamp": "2025-01-04T10:30:05.000Z"
  }
}
```

### Get Flight Configuration
**GET** `/api/v1/config/flight`

Get the current flight configuration from the config file.

**Response:**
```json
{
  "success": true,
  "data": {
    "departure_airport": "SGN",
    "arrival_airport": "HAN",
    "search_options": {
      "trip_type": "oneway",
      "find_cheapest": false,
      "departure_date": "15/02/2025"
    }
  },
  "timestamp": "2025-01-04T10:30:00.000Z"
}
```

## 🌍 Supported Airports

Common Vietnamese airports:
- **SGN** - Ho Chi Minh City (Tan Son Nhat)
- **HAN** - Hanoi (Noi Bai)
- **DAD** - Da Nang
- **CXR** - Cam Ranh (Nha Trang)
- **PQC** - Phu Quoc
- **VCA** - Can Tho
- **HUI** - Hue
- **BMV** - Buon Ma Thuot

## 📁 Data Storage

- **CSV Files**: Flight data is automatically saved to `result/flight_price_history.csv`
- **JSON Files**: Results are also available in JSON format
- **Screenshots**: Browser screenshots are saved to `screenshot/` directory for debugging

## 🔧 Usage Examples

### One-way Flight Search
```bash
curl -X POST http://localhost:3001/api/v1/crawl/vietjet \
  -H "Content-Type: application/json" \
  -d '{
    "departure_airport": "SGN",
    "arrival_airport": "HAN",
    "departure_date": "15/02/2025",
    "trip_type": "oneway"
  }'
```

### Round-trip Flight Search
```bash
curl -X POST http://localhost:3001/api/v1/crawl/vietjet \
  -H "Content-Type: application/json" \
  -d '{
    "departure_airport": "SGN", 
    "arrival_airport": "HAN",
    "departure_date": "15/02/2025",
    "return_date": "20/02/2025",
    "trip_type": "roundtrip"
  }'
```

### Health Check
```bash
curl http://localhost:3001/health
```

### Get Current Config
```bash
curl http://localhost:3001/api/v1/config/flight
```

## 🐛 Debugging

### Enable Screenshots
Set `clear_screenshots: false` in your request to keep previous screenshots for debugging.

### Browser Logs
The service logs browser console messages and network errors for debugging purposes.

### Error Screenshots
When errors occur, the service automatically takes screenshots and saves them to the `screenshot/` directory.

## 🚀 Running Original Crawler (Non-API)

If you want to run the original crawler script directly:
```bash
npm run crawler
```

## 🔄 Microservices Integration

This service is designed to be part of a larger microservices architecture. It can be easily integrated with:
- API Gateway services
- Queue management systems
- Data processing pipelines
- Database services

## 📊 Performance Notes

- Average crawling time: 30-60 seconds per request
- Browser instances are cleaned up after each request
- Concurrent requests are supported but may impact performance
- Screenshots and logs help with debugging but use disk space

## 🛠️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `NODE_ENV` | - | Environment mode |

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

ISC License - see LICENSE file for details.

## 👨‍💻 Author

Trinh Van Trung Nghia - ITITIU21254 