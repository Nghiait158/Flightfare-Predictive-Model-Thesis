# Debug Guide: Cheapest Tickets Feature

## Error: "Failed to load cheapest tickets"

### Quick Diagnosis Steps

#### Step 1: Check if Backend Server is Running

```bash
# Make sure backend is running on port 3003
curl http://localhost:3003/api/health

# Expected response:
# {"status":"ok","timestamp":"2024-..."}
```

If this fails, start the backend server:
```bash
cd flight_prediction_system/web-app/server
npm start
```

#### Step 2: Check Database Data

Run the database check script:
```bash
cd flight_prediction_system/web-app/server
node check-database-data.js
```

**Expected Output:**
```
✈️  Airports: 20+ records
🏢 Airlines: 3+ records
📅 Flight Schedules: 100+ records
💰 Flight Prices: 1000+ records
```

**If Flight Prices = 0:**
- ❌ You need to crawl flight data first!
- The cheapest tickets feature requires price data in the database

#### Step 3: Test the API Endpoint Directly

```bash
cd flight_prediction_system/web-app/server
node test-cheapest-endpoint.js
```

This will test multiple routes and show if data exists.

#### Step 4: Check Browser Console

Open browser DevTools (F12) and check Console tab:
- Look for error messages from the frontend
- Check Network tab to see the API request/response

### Common Issues & Solutions

#### Issue 1: "No flights available for this route"
**Cause:** Database doesn't have price data for this specific route  
**Solution:** 
1. Check which routes have data: `node check-database-data.js`
2. Crawl data for your desired route
3. Try a different route that has data (e.g., SGN → HAN)

#### Issue 2: Backend returns 500 error
**Cause:** Database connection or query error  
**Solution:**
1. Check `.env` file has correct database credentials:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=flight_prediction
   DB_USER=your_user
   DB_PASSWORD=your_password
   ```
2. Check database is running: `psql -U your_user -d flight_prediction`

#### Issue 3: CORS Error
**Cause:** Frontend can't connect to backend  
**Solution:**
- Backend should be on port 3003
- Frontend should be on port 3000
- Check backend has CORS enabled (already configured in index.js)

#### Issue 4: "Network Error" 
**Cause:** Backend not running or wrong URL  
**Solution:**
1. Verify backend is running on http://localhost:3003
2. Check `flightService.js` has correct API_BASE_URL
3. Restart backend server

### Manual API Test

Test the endpoint manually with curl:

```bash
# Test cheapest tickets for SGN → PQC
curl "http://localhost:3003/api/flights/cheapest?from=SGN&to=PQC&daysAhead=90&limit=10"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "flights": [
      {
        "scheduleId": 1,
        "price": 850000,
        "currency": "VND",
        "date": "Sun, Jan 11",
        "time": "5:50am — 6:50am",
        "duration": "1h",
        "flightType": "Direct",
        "airlineCode": "VJ"
      }
    ],
    "count": 1
  }
}
```

### How to Populate Database with Flight Data

If you have no flight price data, you need to crawl it first:

```bash
# Option 1: Use the crawler service
cd flight_prediction_system
npm start

# Then use the web interface to crawl flights
# OR use the API:
curl -X POST http://localhost:3000/api/crawl/baydep \
  -H "Content-Type: application/json" \
  -d '{
    "from": "SGN",
    "to": "PQC",
    "departDate": "2024-12-15",
    "adult": 1
  }'
```

### Debugging Checklist

- [ ] Backend server running on port 3003
- [ ] Database has flight_prices data (> 0 records)
- [ ] Routes exist in database (check with test script)
- [ ] No errors in backend console logs
- [ ] No errors in browser console
- [ ] API returns 200 OK status
- [ ] Response has `success: true`

### Still Not Working?

Check the detailed logs:

1. **Backend logs:** Look at terminal where backend is running
2. **Frontend console:** Press F12 in browser → Console tab
3. **Network tab:** F12 → Network → Look for `/api/flights/cheapest` request

Share these logs for further debugging!

