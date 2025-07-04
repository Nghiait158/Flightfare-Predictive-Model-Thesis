# VietJet Crawl Service - Docker Management Script for Windows
# Uses full paths to avoid PATH issues.

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "logs", "status", "build", "help")]
    [string]$Command = "help"
)

# --- Configuration ---
$DockerComposeExe = "C:\Program Files\Docker\Docker\resources\bin\docker-compose.exe"
$ServiceName = "vietjet-crawl-service"

# --- Functions ---
function Write-Header { Write-Host "🐳 VietJet Crawl Service Docker Management" -ForegroundColor Cyan }
function Write-Info   { param([string]$Message); Write-Host "[INFO] $Message" -ForegroundColor Green }
function Write-Error  { param([string]$Message); Write-Host "[ERROR] $Message" -ForegroundColor Red }

# --- Pre-flight Checks ---
if (!(Test-Path $DockerComposeExe)) {
    Write-Error "Docker Compose not found at '$DockerComposeExe'. Is Docker Desktop installed?"
    exit 1
}

# --- Main Logic ---
Write-Header
switch ($Command.ToLower()) {
    "start" {
        Write-Info "Building and starting containers in detached mode..."
        & $DockerComposeExe up --build -d
        if ($LASTEXITCODE -ne 0) { Write-Error "Failed to start services."; exit 1 }
        Write-Info "Services started successfully."
        Write-Info "API should be available at http://localhost:3001"
        Write-Info "Use '.\run-docker.ps1 status' to check."
    }
    "stop" {
        Write-Info "Stopping all services..."
        & $DockerComposeExe down
        Write-Info "Services stopped."
    }
    "logs" {
        Write-Info "Showing logs for '$ServiceName'. Press Ctrl+C to exit."
        & $DockerComposeExe logs -f $ServiceName
    }
    "status" {
        Write-Info "Current status of containers:"
        & $DockerComposeExe ps
    }
    "build" {
        Write-Info "Force-building images without cache..."
        & $DockerComposeExe build --no-cache
        if ($LASTEXITCODE -ne 0) { Write-Error "Build failed."; exit 1 }
        Write-Info "Build completed successfully."
    }
    default {
        Write-Host ""
        Write-Host "Usage: .\run-docker.ps1 [command]" -ForegroundColor Yellow
        Write-Host "Commands:"
        Write-Host "  start     - Build and start services"
        Write-Host "  stop      - Stop all services"
        Write-Host "  logs      - View service logs"
        Write-Host "  status    - Show service status"
        Write-Host "  build     - Force rebuild of the image"
    }
} 