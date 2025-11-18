# PostgreSQL Database Setup Script for Windows
# Run this in PowerShell as Administrator

Write-Host "=== PostgreSQL Database Setup for Flight Prediction ===" -ForegroundColor Cyan
Write-Host ""

# Find PostgreSQL installation
$pgPaths = @(
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\15\bin",
    "C:\Program Files\PostgreSQL\14\bin",
    "C:\Program Files\PostgreSQL\13\bin",
    "C:\Program Files (x86)\PostgreSQL\16\bin",
    "C:\Program Files (x86)\PostgreSQL\15\bin",
    "C:\Program Files (x86)\PostgreSQL\14\bin"
)

$psqlPath = $null
foreach ($path in $pgPaths) {
    if (Test-Path "$path\psql.exe") {
        $psqlPath = "$path\psql.exe"
        Write-Host "✓ Found PostgreSQL at: $path" -ForegroundColor Green
        break
    }
}

if ($null -eq $psqlPath) {
    Write-Host "✗ PostgreSQL not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install PostgreSQL from:" -ForegroundColor Yellow
    Write-Host "https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or specify the path manually:" -ForegroundColor Yellow
    $manualPath = Read-Host "Enter PostgreSQL bin path (or press Enter to exit)"
    
    if ($manualPath -and (Test-Path "$manualPath\psql.exe")) {
        $psqlPath = "$manualPath\psql.exe"
    } else {
        Write-Host "Exiting..." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "PostgreSQL executable: $psqlPath" -ForegroundColor Cyan

# Get database credentials
Write-Host ""
Write-Host "=== Database Configuration ===" -ForegroundColor Cyan
$dbUser = Read-Host "PostgreSQL username (default: postgres)"
if ([string]::IsNullOrWhiteSpace($dbUser)) {
    $dbUser = "postgres"
}

$dbPassword = Read-Host "PostgreSQL password" -AsSecureString
$dbPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword)
)

$dbName = "flight_prediction"

Write-Host ""
Write-Host "=== Creating Database ===" -ForegroundColor Cyan

# Set PGPASSWORD environment variable
$env:PGPASSWORD = $dbPasswordPlain

# Create database
Write-Host "Creating database: $dbName..." -ForegroundColor Yellow
$createDbCmd = "CREATE DATABASE $dbName;"
$createDbCmd | & $psqlPath -U $dbUser -h localhost -p 5432 -d postgres 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Database created successfully" -ForegroundColor Green
} else {
    Write-Host "⚠ Database might already exist (this is OK)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Running Schema ===" -ForegroundColor Cyan
$schemaFile = Join-Path $PSScriptRoot "schema.sql"
if (Test-Path $schemaFile) {
    & $psqlPath -U $dbUser -h localhost -p 5432 -d $dbName -f $schemaFile
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Schema created successfully" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to create schema" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✗ schema.sql not found at: $schemaFile" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Seeding Data ===" -ForegroundColor Cyan
$seedFile = Join-Path $PSScriptRoot "seed_airports.sql"
if (Test-Path $seedFile) {
    & $psqlPath -U $dbUser -h localhost -p 5432 -d $dbName -f $seedFile
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Data seeded successfully" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to seed data" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✗ seed_airports.sql not found at: $seedFile" -ForegroundColor Red
    exit 1
}

# Clear password from environment
$env:PGPASSWORD = $null

Write-Host ""
Write-Host "=== Creating .env file ===" -ForegroundColor Cyan
$envPath = Join-Path $PSScriptRoot "..\server\.env"
$envContent = @"
PORT=3003
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$dbName
DB_USER=$dbUser
DB_PASSWORD=$dbPasswordPlain
"@

$envContent | Out-File -FilePath $envPath -Encoding UTF8
Write-Host "✓ .env file created at: $envPath" -ForegroundColor Green

Write-Host ""
Write-Host "=== Verifying Database ===" -ForegroundColor Cyan
$verifyCmd = "SELECT COUNT(*) as airport_count FROM airports;"
$env:PGPASSWORD = $dbPasswordPlain
$result = $verifyCmd | & $psqlPath -U $dbUser -h localhost -p 5432 -d $dbName -t
$env:PGPASSWORD = $null

Write-Host "Airport records in database: $($result.Trim())" -ForegroundColor Cyan

Write-Host ""
Write-Host "=== Setup Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. cd ..\server" -ForegroundColor White
Write-Host "2. npm install" -ForegroundColor White
Write-Host "3. npm start" -ForegroundColor White
Write-Host ""
Write-Host "Server will run on: http://localhost:3003" -ForegroundColor Cyan
Write-Host ""

