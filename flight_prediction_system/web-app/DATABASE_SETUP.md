# Database Setup Guide

## Prerequisites

- PostgreSQL 12+ installed
- Node.js 14+ installed

## 🪟 **Quick Setup for Windows (Recommended)**

### Option 1: Automated Setup (PowerShell)

1. Make sure PostgreSQL is installed from: https://www.postgresql.org/download/windows/

2. Open **PowerShell as Administrator** and run:
```powershell
cd flight-prediction-monolith\web-app\database
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
.\setup_windows.ps1
```

3. Follow the prompts to enter your PostgreSQL password

4. Done! Skip to Step 8 (Install Backend Dependencies)

### Option 2: Manual Setup

Continue with steps below...

---

## Step 1: Install PostgreSQL

### Windows
1. Download from: https://www.postgresql.org/download/windows/
2. Run installer and remember the password you set for `postgres` user
3. After installation, add PostgreSQL to PATH:
   - Search "Environment Variables" in Windows
   - Edit System PATH
   - Add: `C:\Program Files\PostgreSQL\15\bin` (adjust version number)
   - **Restart Command Prompt**

### macOS
```bash
brew install postgresql
brew services start postgresql
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

## Step 2: Create Database

Open PostgreSQL command line:

```bash
# Windows (if psql not found, use full path)
"C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres

# Or if added to PATH
psql -U postgres

# macOS
psql postgres

# Linux
sudo -u postgres psql
```

Then run:

```sql
CREATE DATABASE flight_prediction;
```

Exit psql:
```
\q
```

## Step 3: Run Database Schema

```bash
cd web-app/database

# Windows (with full path if needed)
"C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -d flight_prediction -f schema.sql

# Or if added to PATH
psql -U postgres -d flight_prediction -f schema.sql

# macOS/Linux
psql -U postgres -d flight_prediction -f schema.sql
```

## Step 4: Seed Initial Data

```bash
# Windows (with full path if needed)
"C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -d flight_prediction -f seed_airports.sql

# Or if added to PATH
psql -U postgres -d flight_prediction -f seed_airports.sql

# macOS/Linux
psql -U postgres -d flight_prediction -f seed_airports.sql
```

## Step 5: Configure Backend

1. Copy environment file:
```bash
cd ../server
cp .env.example .env
```

2. Edit `.env` file with your database credentials:
```env
PORT=3003
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flight_prediction
DB_USER=postgres
DB_PASSWORD=your_password_here
```

## Step 6: Install Dependencies

```bash
# In server directory
npm install
```

## Step 7: Start Backend Server

```bash
npm start
```

Server should be running on http://localhost:3003

## Step 8: Test API

Open browser or use curl:

```bash
# Health check
curl http://localhost:3003/api/health

# Get all airports
curl http://localhost:3003/api/airports

# Search airports
curl http://localhost:3003/api/airports/search?q=hanoi
```

## Verify Database

Connect to database:
```bash
psql -U postgres -d flight_prediction
```

Check tables:
```sql
\dt
```

Check airports data:
```sql
SELECT * FROM airports;
```

## Troubleshooting

### 'psql' is not recognized (Windows)
**Solution 1**: Add PostgreSQL to PATH
1. Find PostgreSQL bin folder (usually `C:\Program Files\PostgreSQL\15\bin`)
2. Add to System PATH environment variable
3. Restart Command Prompt

**Solution 2**: Use full path
```bash
"C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres
```

**Solution 3**: Use pgAdmin GUI (installed with PostgreSQL)
1. Open pgAdmin 4
2. Connect to PostgreSQL server
3. Run SQL scripts manually

### Connection Error
- **Windows**: Check services - Search "Services" → Find "postgresql-x64-15" → Make sure it's Running
- **Linux**: `sudo systemctl status postgresql`
- **macOS**: `brew services list`
- Verify credentials in `.env` file
- Check PostgreSQL is listening on port 5432

### Permission Denied
```sql
GRANT ALL PRIVILEGES ON DATABASE flight_prediction TO your_user;
```

### Reset Database
```bash
psql -U postgres
DROP DATABASE flight_prediction;
CREATE DATABASE flight_prediction;
\q
psql -U postgres -d flight_prediction -f schema.sql
psql -U postgres -d flight_prediction -f seed_airports.sql
```

## Database Schema Overview

### Main Tables:
- **airports**: Airport information (code, city, name, country)
- **airlines**: Airline information
- **flight_schedules**: Flight route schedules
- **flight_prices**: Historical flight prices
- **price_predictions**: AI predicted prices
- **users**: User accounts
- **search_history**: User search logs
- **price_alerts**: Price alert settings
- **new_classes**: Flight classes (Economy, Business, etc.)
- **aircraft_types**: Aircraft type information

## API Endpoints

### Airports
- `GET /api/airports` - Get all airports
- `GET /api/airports/search?q=query` - Search airports
- `GET /api/airports/:code` - Get airport by code

### Example Response
```json
{
  "success": true,
  "data": [
    {
      "airport_id": 1,
      "code": "SGN",
      "city": "Tp. Hồ Chí Minh",
      "name": "Sân bay quốc tế Tân Sơn Nhất",
      "country": "Việt Nam"
    }
  ]
}
```

