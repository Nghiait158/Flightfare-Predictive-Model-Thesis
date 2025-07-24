try {
  const express = require('express');
  const cors = require('cors');

  const app = express();
  const PORT = process.env.PORT || 3003;

  
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] Received ${req.method} request for ${req.url}`);
    next(); 
  });

  // Middlewares
  app.use(cors()); // allow another rq
  app.use(express.json()); 

  
  // API 
  app.get('/api/greeting', (req, res) => {
    res.json({ message: "Message from Backend server" });
  });

  app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
  });

} catch (error) {

  console.error("!!! FATAL ERROR OCCURRED !!!");
  console.error(error);
  process.exit(1); 

} 