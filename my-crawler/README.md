# VietJet Air Flight Search Crawler

Automated flight search system for VietJet Air website using Puppeteer.

## Files Structure

- `src/main.js` - Main crawler script
- `airports.csv` - Airport database with codes, cities, and names
- `flight-config.json` - Flight search configuration
- `screenshot/` - Screenshots directory

## Configuration

### airports.csv
Contains airport information in CSV format:
```csv
code,city,airport_name,country
SGN,Tp. Hồ Chí Minh,Sân bay Tân Sơn Nhất,Việt Nam
TBB,Tuy Hòa,Sân bay Tuy Hòa,Việt Nam
...
```

### flight-config.json
Configure your flight search:
```json
{
  "departure_airport": "SGN",
  "arrival_airport": "TBB", 
  "search_options": {
    "trip_type": "oneway",
    "find_cheapest": true,
    "departure_date": "today"
  }
}
```

## Usage

1. **Update flight configuration**: Edit `flight-config.json` with desired departure and arrival airports
2. **Add new airports**: Add entries to `airports.csv` if needed
3. **Run the crawler**:
   ```bash
   npm start
   ```

## How it works

1. Reads airport data from `airports.csv`
2. Loads flight configuration from `flight-config.json`
3. Validates that both departure and arrival airports exist in the database
4. Launches browser and navigates to VietJet website
5. Automatically fills in flight search form:
   - Selects one-way trip
   - Enters departure airport and selects from dropdown
   - Enters arrival airport and selects from dropdown  
   - Selects today's date
   - Enables "find cheapest ticket" option
6. Submits search and takes screenshots

## Features

- **Flexible airport configuration** - Use any airports from the CSV database
- **Automatic dropdown selection** - Finds and clicks the correct airport options
- **Multiple click strategies** - Fallback methods if initial click fails
- **Input validation** - Verifies airport selections were successful
- **Error handling** - Screenshots and logging for debugging
- **Configurable search options** - Easy to modify trip type, dates, etc.

## Adding New Airports

To add a new airport to the system:

1. Find the airport code, city name, and full airport name
2. Add a new row to `airports.csv`:
   ```csv
   XXX,City Name,Airport Full Name,Việt Nam
   ```
3. Update `flight-config.json` to use the new airport code
4. Run the crawler

## Example Configurations

**Ho Chi Minh City to Tuy Hoa:**
```json
{
  "departure_airport": "SGN",
  "arrival_airport": "TBB"
}
```

**Hanoi to Da Nang:**
```json
{
  "departure_airport": "HAN", 
  "arrival_airport": "DAD"
}
```

**Nha Trang to Phu Quoc:**
```json
{
  "departure_airport": "CXR",
  "arrival_airport": "PQC"
}
```
