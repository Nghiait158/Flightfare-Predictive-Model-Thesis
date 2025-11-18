# Flight Prediction System - Monolithic Start Script (PowerShell)

Write-Host "🚀 Starting Flight Price Prediction System..." -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green

# Check if node_modules exists
if (-Not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Check if .env exists
if (-Not (Test-Path ".env")) {
    Write-Host "⚠️  .env file not found. Copying from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
}

# Start the server
Write-Host "🌐 Starting server..." -ForegroundColor Cyan
npm start






