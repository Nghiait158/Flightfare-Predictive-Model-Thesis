const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001; // Port cho backend

// Middlewares
app.use(cors()); // Cho phép request từ các nguồn khác (quan trọng cho dev)
app.use(express.json()); // Cho phép parse JSON

// API route mẫu
app.get('/api/greeting', (req, res) => {
  res.json({ message: "Hello from Backend!" });
});

app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
}); 