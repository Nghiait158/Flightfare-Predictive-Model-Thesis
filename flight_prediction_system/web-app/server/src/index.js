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

  // Flight routes
  const flightRoutes = require('./routes/flightRoutes');
  app.use('/api/flights', flightRoutes);

  // Subscription routes (Email notifications)
  const subscriptionRoutes = require('./routes/subscriptionRoutes');
  app.use('/api/subscriptions', subscriptionRoutes);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Start scheduler for automated notifications
  const scheduler = require('./services/scheduler');
  const emailService = require('./services/emailService');

  app.listen(PORT, async () => {
    console.log(`🚀 Backend server is running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${process.env.DB_NAME || 'flight_prediction'}`);

    // Verify email service configuration
    const emailReady = await emailService.verifyConnection();
    if (emailReady) {
      console.log('📧 Email notification service: READY');

      // Start scheduler only if email service is ready
      scheduler.start();
    } else {
      console.log('⚠️ Email service not configured. Set EMAIL_USER and EMAIL_APP_PASSWORD in .env');
      console.log('⚠️ Scheduler not started. Email notifications disabled.');
    }
  });

} catch (error) {

  console.error("!!! FATAL ERROR OCCURRED !!!");
  console.error(error);
  process.exit(1); 

} 