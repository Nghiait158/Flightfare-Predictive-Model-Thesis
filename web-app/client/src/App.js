import React, { useState, useEffect } from 'react';
import HeaderPage from './component/header';
import './App.css';

function App() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Fetch a greeting from the backend API
    fetch('http://localhost:3003/api/greeting')
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(err => console.error("Failed to fetch message:", err));
  }, []);

  return (
    <div className="App">
      <HeaderPage />
      <p style={{ marginTop: '2rem', color: '#61dafb' }}> Message from Backend: {message || "Loading..."}</p>
    </div>
  );
}

export default App;
