# VietJet Crawl Service - Docker Management Script for Windows
param(
    [Parameter(Position=0)]
    [ValidateSet("start", "up", "stop", "down", "restart", "logs", "cleanup", "status", "help")]
    [string]$Command = "help"
)

Write-Host "🐳 VietJet Crawl Service Docker Management" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check if Docker is running
try {
    docker info | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker is not running"
    }
} catch {
    Write-Error "Docker is not running. Please start Docker Desktop first."
    exit 1
}

# Check if docker-compose is available
try {
    docker-compose --version | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "docker-compose not found"
    }
} catch {
    Write-Error "docker-compose is not installed. Please install Docker Desktop or docker-compose."
    exit 1
}

# Function to build and run services
function Start-Services {
    Write-Status "Building and starting VietJet Crawl Service..."
    
    # Build images
    Write-Status "Building Docker images..."
    docker-compose build --no-cache
    
    if ($LASTEXITCODE -eq 0) {
        Write-Status "✅ Images built successfully!"
    } else {
        Write-Error "❌ Failed to build images"
        exit 1
    }
    
    # Start services
    Write-Status "Starting services..."
    docker-compose up -d
    
    if ($LASTEXITCODE -eq 0) {
        Write-Status "✅ Services started successfully!"
    } else {
        Write-Error "❌ Failed to start services"
        exit 1
    }
    
    # Wait for services to be ready
    Write-Status "Waiting for services to be ready..."
    Start-Sleep -Seconds 10
    
    # Check service health
    Write-Status "Checking service health..."
    docker-compose ps
    
    Write-Status "🎉 VietJet Crawl Service is now running!"
    Write-Status "📊 API Endpoint: http://localhost:3001"
    Write-Status "🏥 Health Check: http://localhost:3001/health"
    Write-Status ""
    Write-Status "📋 Quick Commands:"
    Write-Status "  • Check status: docker-compose ps"
    Write-Status "  • View logs: docker-compose logs -f vietjet-crawl-service"
    Write-Status "  • Stop services: docker-compose down"
    Write-Status "  • Test API: Invoke-RestMethod http://localhost:3001/health"
}

# Function to stop services
function Stop-Services {
    Write-Status "Stopping VietJet Crawl Service..."
    docker-compose down
    
    if ($LASTEXITCODE -eq 0) {
        Write-Status "✅ Services stopped successfully!"
    } else {
        Write-Error "❌ Failed to stop services"
        exit 1
    }
}

# Function to restart services
function Restart-Services {
    Write-Status "Restarting VietJet Crawl Service..."
    docker-compose restart
    
    if ($LASTEXITCODE -eq 0) {
        Write-Status "✅ Services restarted successfully!"
    } else {
        Write-Error "❌ Failed to restart services"
        exit 1
    }
}

# Function to show logs
function Show-Logs {
    Write-Status "Showing VietJet Crawl Service logs..."
    docker-compose logs -f vietjet-crawl-service
}

# Function to clean up
function Cleanup-Services {
    Write-Status "Cleaning up Docker resources..."
    docker-compose down -v --remove-orphans
    docker system prune -f
    
    Write-Status "✅ Cleanup completed!"
}

# Function to show status
function Show-Status {
    Write-Status "Current service status:"
    docker-compose ps
}

# Function to show help
function Show-Help {
    Write-Host ""
    Write-Host "Usage: .\docker-run.ps1 {start|stop|restart|logs|cleanup|status}" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Yellow
    Write-Host "  start    - Build and start all services" -ForegroundColor White
    Write-Host "  stop     - Stop all services" -ForegroundColor White
    Write-Host "  restart  - Restart all services" -ForegroundColor White
    Write-Host "  logs     - Show service logs" -ForegroundColor White
    Write-Host "  status   - Show service status" -ForegroundColor White
    Write-Host "  cleanup  - Stop services and clean up resources" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\docker-run.ps1 start     # Start the services" -ForegroundColor Gray
    Write-Host "  .\docker-run.ps1 logs      # View logs" -ForegroundColor Gray
    Write-Host "  .\docker-run.ps1 stop      # Stop services" -ForegroundColor Gray
    Write-Host ""
}

# Main execution logic
switch ($Command.ToLower()) {
    { $_ -in @("start", "up") } {
        Start-Services
    }
    { $_ -in @("stop", "down") } {
        Stop-Services
    }
    "restart" {
        Restart-Services
    }
    "logs" {
        Show-Logs
    }
    "cleanup" {
        Cleanup-Services
    }
    "status" {
        Show-Status
    }
    default {
        Show-Help
    }
} 