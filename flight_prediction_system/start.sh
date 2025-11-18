#!/bin/bash

# Flight Prediction System - Monolithic Start Script

echo "🚀 Starting Flight Price Prediction System..."
echo "=============================================="

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Copying from .env.example..."
    cp .env.example .env
fi

# Start the server
echo "🌐 Starting server..."
npm start






