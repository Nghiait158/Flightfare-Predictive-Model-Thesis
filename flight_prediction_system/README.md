# Flight Price Prediction System - Monolithic Architecture

A comprehensive flight price prediction system that combines web scraping, machine learning, and a web interface in a monolithic architecture.

## 🏗️ Architecture

This is a **monolithic refactor** of the original microservices architecture, combining:
- **BayDep Crawler**: Web scraping for flight data from BayDep.vn
- **ML Prediction Engine**: Python-based machine learning model for price predictions
- **Web Interface**: React frontend served by Express backend
- **Data Management**: Centralized data storage and processing

## 📋 Features

- ✅ Real-time flight data scraping from BayDep.vn
- ✅ Price prediction using trained ML models
- ✅ RESTful API for all operations
- ✅ Health monitoring endpoints
- ✅ Configurable search parameters
- ✅ Screenshot capture for debugging
- ✅ CSV and JSON data export

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Python 3.8+ (for ML features)
- npm or yarn

### Installation

```bash
# Navigate to project directory
cd flight-prediction-monolith

# Install dependencies
npm install

# Install Python dependencies (for ML features)
cd python
pip install -r requirements.txt
cd ..
```

### Configuration

Copy `.env.example` to `.env` and configure:

```env
PORT=3000
NODE_ENV=development
PUPPETEER_HEADLESS=true
```

Edit `data/flight-config.json` for default search parameters:

```json
{
  "departure_airport": "SGN",
  "arrival_airport": "HAN",
  "search_options": {
    "trip_type": "oneway",
    "find_cheapest": false,
    "departure_date": "03102025"
  },
  "adult": 1,
  "child": 0,
  "infant": 0
}
```

### Running the Application

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

Server will start at: `http://localhost:3000`

## 📡 API Endpoints

### Health Check
```http
GET /health
```

### Get API Information
```http
GET /
```

### Crawler Endpoints

#### Crawl BayDep Flights
```http
POST /api/crawl/baydep
Content-Type: application/json

{
  "departure_airport": "SGN",
  "arrival_airport": "HAN",
  "departure_date": "03102025",
  "adult": 1,
  "child": 0,
  "infant": 0,
  "trip_type": "oneway",
  "use_retry": true,
  "clear_screenshots": true
}
```

#### Get Current Configuration
```http
GET /api/crawl/config
```

#### Crawler Health Check
```http
GET /api/crawl/health
```

## 📊 Data Output

Crawled data is saved in two formats:

- **CSV**: `data/result/flight_price_history.csv`
- **JSON**: `data/result/flight_price_history.json`

## 🧪 Testing

### Test Crawler Functionality

```bash
# Using curl (PowerShell)
curl -Method POST http://localhost:3000/api/crawl/baydep -ContentType "application/json" -Body '{"departure_airport":"SGN","arrival_airport":"HAN","departure_date":"03102025","adult":1,"child":0,"infant":0}'

# Using curl (Linux/Mac)
curl -X POST http://localhost:3000/api/crawl/baydep \
  -H "Content-Type: application/json" \
  -d '{
    "departure_airport": "SGN",
    "arrival_airport": "HAN",
    "departure_date": "03102025",
    "adult": 1,
    "child": 0,
    "infant": 0
  }'
```

## 📁 Project Structure

```
flight-prediction-monolith/
├── server.js                    # Main entry point
├── package.json                 # Dependencies
├── .env                         # Environment variables
│
├── src/
│   └── server/
│       ├── routes/              # API routes
│       │   └── crawl.routes.js
│       ├── crawlers/            # Crawler modules
│       │   └── baydep/
│       │       ├── crawlerService.js
│       │       ├── flightService.js
│       │       └── crawlData_byDate_from_BayDepPageV2.js
│       ├── utils/               # Shared utilities
│       │   ├── browserUtils.js
│       │   ├── fileUtils.js
│       │   ├── domUtils.js
│       │   ├── constants.js
│       │   └── selectors.js
│       └── config/              # Configuration loaders
│           └── loadConfig.js
│
├── data/                        # Data directory
│   ├── airports.csv             # Airport database
│   ├── flight-config.json       # Flight search config
│   ├── models/                  # ML models
│   │   └── flight_price_model.pkl
│   └── result/                  # Output data
│       ├── flight_price_history.csv
│       └── flight_price_history.json
│
├── python/                      # Python ML scripts
│   ├── main_model.py            # Model training
│   ├── predict.py               # Prediction script
│   └── requirements.txt
│
└── screenshot/                  # Debug screenshots
```

## 🔧 Configuration Files

### Flight Configuration (`data/flight-config.json`)
```json
{
  "departure_airport": "SGN",
  "arrival_airport": "HAN",
  "search_options": {
    "trip_type": "oneway",
    "find_cheapest": false,
    "departure_date": "03102025"
  },
  "adult": 1,
  "child": 0,
  "infant": 0
}
```

### Airports Database (`data/airports.csv`)
CSV file containing airport information:
- code: Airport IATA code (e.g., SGN, HAN)
- city: City name
- airport_name: Full airport name
- country: Country

## 🐛 Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Change PORT in .env file
   PORT=3001
   ```

2. **Puppeteer download fails**
   ```bash
   # Set environment variable
   PUPPETEER_SKIP_DOWNLOAD=true
   ```

3. **Module not found errors**
   ```bash
   # Reinstall dependencies
   rm -rf node_modules
   npm install
   ```

## 📝 Development Notes

### Adding New Crawlers

1. Create crawler module in `src/server/crawlers/[crawler-name]/`
2. Implement required functions: `runCrawler`, `runCrawlerWithRetry`
3. Add route in `src/server/routes/crawl.routes.js`
4. Update server.js imports

### Modifying Crawler Logic

The BayDep crawler logic is located in:
- `src/server/crawlers/baydep/crawlerService.js` - Main orchestration
- `src/server/crawlers/baydep/flightService.js` - Search workflow
- `src/server/crawlers/baydep/crawlData_byDate_from_BayDepPageV2.js` - Data extraction

⚠️ **Important**: Crawler logic is preserved from the original microservices. Only import paths were changed.

## 🎯 Key Differences from Microservices

| Aspect | Microservices | Monolithic |
|--------|--------------|------------|
| **Architecture** | 3 separate services | 1 unified application |
| **Ports** | 3001, 3002, 3003 | 3000 (single port) |
| **Deployment** | Docker Compose | Single Node.js process |
| **Scalability** | Scale individual services | Scale entire application |
| **Complexity** | Higher (multiple containers) | Lower (single codebase) |
| **Development** | Separate repos/services | Unified codebase |

## 🚀 Production Deployment

### Using PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start server.js --name flight-prediction

# Monitor
pm2 monit

# View logs
pm2 logs flight-prediction

# Restart
pm2 restart flight-prediction

# Stop
pm2 stop flight-prediction
```

### Using Docker (Optional)

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Build and run:
```bash
docker build -t flight-prediction-monolith .
docker run -p 3000:3000 flight-prediction-monolith
```

## 📄 License

ISC

## 👤 Author

Trinh Van Trung Nghia - ITITIU21254

## 🙏 Acknowledgments

- Original microservices architecture
- BayDep.vn for flight data
- Puppeteer for web scraping capabilities






