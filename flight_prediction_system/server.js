import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import crawlRoutes from './src/server/routes/crawl.routes.js';

// Import database connection (if exists)
let pool;
try {
    const dbModule = await import('./web-app/server/src/config/database.js');
    pool = dbModule.default;
} catch (error) {
    console.warn('⚠️  Database module not found. Airport API will be disabled.');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// API Routes
app.use('/api/crawl', crawlRoutes);

// Airport API Routes (from web-app/server)
if (pool) {
    // Get all airports
    app.get('/api/airports', async (req, res) => {
        try {
            const result = await pool.query(
                'SELECT airport_id, airport_code as code, city, airport_name as name, country FROM airports ORDER BY city'
            );
            res.json({ success: true, data: result.rows });
        } catch (error) {
            console.error('Error fetching airports:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch airports', error: error.message });
        }
    });

    // Search airports
    app.get('/api/airports/search', async (req, res) => {
        try {
            const { q } = req.query;
            if (!q || q.trim() === '') {
                return res.json({ success: true, data: [] });
            }
            const searchTerm = `%${q.toLowerCase()}%`;
            const result = await pool.query(
                `SELECT airport_id, airport_code as code, city, airport_name as name, country 
                 FROM airports 
                 WHERE LOWER(city) LIKE $1 OR LOWER(airport_name) LIKE $1 OR LOWER(airport_code) LIKE $1
                 ORDER BY city LIMIT 10`,
                [searchTerm]
            );
            res.json({ success: true, data: result.rows });
        } catch (error) {
            console.error('Error searching airports:', error);
            res.status(500).json({ success: false, message: 'Failed to search airports', error: error.message });
        }
    });

    // Get airport by code
    app.get('/api/airports/:code', async (req, res) => {
        try {
            const { code } = req.params;
            const result = await pool.query(
                'SELECT airport_id, airport_code as code, city, airport_name as name, country FROM airports WHERE airport_code = $1',
                [code.toUpperCase()]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Airport not found' });
            }
            res.json({ success: true, data: result.rows[0] });
        } catch (error) {
            console.error('Error fetching airport:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch airport', error: error.message });
        }
    });
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'flight-prediction-monolith',
        version: '1.0.0'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Flight Price Prediction System - Monolithic Architecture',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            crawl: {
                baydep: 'POST /api/crawl/baydep',
                vietjet: 'POST /api/crawl/vietjet',
                config: 'GET /api/crawl/config',
                health: 'GET /api/crawl/health'
            },
            airports: {
                list: 'GET /api/airports',
                search: 'GET /api/airports/search?q=query',
                detail: 'GET /api/airports/:code'
            }
        },
        timestamp: new Date().toISOString()
    });
});

// ============================================
// Serve React Static Files (Production Only)
// ============================================
if (process.env.NODE_ENV === 'production') {
    const clientBuildPath = path.join(__dirname, 'web-app/client/build');
    
    // Serve static files from React build
    app.use(express.static(clientBuildPath));
    
    // For any route that doesn't match API, serve React app
    app.get('*', (req, res) => {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
    
    console.log('📱 Serving React app from:', clientBuildPath);
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: error.message,
        message: 'Internal server error'
    });
});

// 404 handler (only for development when not serving React)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res) => {
        res.status(404).json({
            success: false,
            error: 'Endpoint not found',
            message: 'The requested endpoint does not exist',
            available_endpoints: {
                'GET /': 'API information',
                'GET /health': 'Health check',
                'POST /api/crawl/baydep': 'Crawl BayDep flight data',
                'POST /api/crawl/vietjet': 'Crawl VietJet flight data',
                'GET /api/crawl/config': 'Get flight configuration',
                'GET /api/crawl/health': 'Crawler health check'
            }
        });
    });
}

// Start server
app.listen(PORT, () => {
    console.log('');
    console.log('Flight Price Prediction System - Monolithic');
    console.log('===============================================');
    console.log(`Server running on: http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`API Base: http://localhost:${PORT}/api`);
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log('===============================================');
    console.log('');
    console.log('Available Endpoints:');
    console.log(`  GET  /                        - API information`);
    console.log(`  GET  /health                  - Health check`);
    console.log(`  POST /api/crawl/baydep        - Crawl BayDep flights`);
    console.log(`  POST /api/crawl/vietjet       - Crawl VietJet flights`);
    console.log(`  GET  /api/crawl/config        - Get current config`);
    console.log(`  GET  /api/crawl/health        - Crawler health`);
    if (pool) {
        console.log(`  GET  /api/airports            - Get all airports`);
        console.log(`  GET  /api/airports/search     - Search airports`);
        console.log(`  GET  /api/airports/:code      - Get airport by code`);
    }
    console.log('');
});

export default app;





