try {
  require('dotenv').config();
  const express = require('express');
  const cors = require('cors');
  const airportRoutes = require('./routes/airportRoutes');

  const app = express();
  const PORT = process.env.PORT || 3003;

  
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] Received ${req.method} request for ${req.url}`);
    next(); 
  });

  // Middlewares
  app.use(cors()); // allow another rq
  app.use(express.json()); 

  
  // API Routes
  app.get('/api/greeting', (req, res) => {
    res.json({ message: "Message from Backend server" });
  });

  // Airport routes
  app.use('/api/airports', airportRoutes);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.listen(PORT, () => {
    console.log(`🚀 Backend server is running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${process.env.DB_NAME || 'flight_prediction'}`);
  });

} catch (error) {

  console.error("!!! FATAL ERROR OCCURRED !!!");
  console.error(error);
  process.exit(1); 

} 