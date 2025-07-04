#!/bin/bash

# VietJet Crawl Service - Docker Management Script
echo "🐳 VietJet Crawl Service Docker Management"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    print_error "docker-compose is not installed. Please install docker-compose first."
    exit 1
fi

# Function to build and run services
run_services() {
    print_status "Building and starting VietJet Crawl Service..."
    
    # Build images
    print_status "Building Docker images..."
    docker-compose build --no-cache
    
    if [ $? -eq 0 ]; then
        print_status "✅ Images built successfully!"
    else
        print_error "❌ Failed to build images"
        exit 1
    fi
    
    # Start services
    print_status "Starting services..."
    docker-compose up -d
    
    if [ $? -eq 0 ]; then
        print_status "✅ Services started successfully!"
    else
        print_error "❌ Failed to start services"
        exit 1
    fi
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    sleep 10
    
    # Check service health
    print_status "Checking service health..."
    docker-compose ps
    
    print_status "🎉 VietJet Crawl Service is now running!"
    print_status "📊 API Endpoint: http://localhost:3001"
    print_status "🏥 Health Check: http://localhost:3001/health"
    print_status ""
    print_status "📋 Quick Commands:"
    print_status "  • Check status: docker-compose ps"
    print_status "  • View logs: docker-compose logs -f vietjet-crawl-service"
    print_status "  • Stop services: docker-compose down"
    print_status "  • Test API: curl http://localhost:3001/health"
}

# Function to stop services
stop_services() {
    print_status "Stopping VietJet Crawl Service..."
    docker-compose down
    
    if [ $? -eq 0 ]; then
        print_status "✅ Services stopped successfully!"
    else
        print_error "❌ Failed to stop services"
        exit 1
    fi
}

# Function to restart services
restart_services() {
    print_status "Restarting VietJet Crawl Service..."
    docker-compose restart
    
    if [ $? -eq 0 ]; then
        print_status "✅ Services restarted successfully!"
    else
        print_error "❌ Failed to restart services"
        exit 1
    fi
}

# Function to show logs
show_logs() {
    print_status "Showing VietJet Crawl Service logs..."
    docker-compose logs -f vietjet-crawl-service
}

# Function to clean up
cleanup() {
    print_status "Cleaning up Docker resources..."
    docker-compose down -v --remove-orphans
    docker system prune -f
    
    print_status "✅ Cleanup completed!"
}

# Main menu
case "$1" in
    "start"|"up")
        run_services
        ;;
    "stop"|"down")
        stop_services
        ;;
    "restart")
        restart_services
        ;;
    "logs")
        show_logs
        ;;
    "cleanup")
        cleanup
        ;;
    "status")
        docker-compose ps
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|logs|cleanup|status}"
        echo ""
        echo "Commands:"
        echo "  start    - Build and start all services"
        echo "  stop     - Stop all services"
        echo "  restart  - Restart all services"
        echo "  logs     - Show service logs"
        echo "  status   - Show service status"
        echo "  cleanup  - Stop services and clean up resources"
        echo ""
        echo "Examples:"
        echo "  $0 start     # Start the services"
        echo "  $0 logs      # View logs"
        echo "  $0 stop      # Stop services"
        exit 1
        ;;
esac 