import React, { useState, useEffect } from 'react';
import logo from './logo.svg';
import './App.css';

function App() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Fetch a greeting from the backend API
    fetch('http://localhost:3001/api/greeting')
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(err => console.error("Failed to fetch message:", err));
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
        <p style={{ marginTop: '2rem', color: '#61dafb' }}>
          Message from Backend: {message || "Loading..."}
        </p>
      </header>
    </div>
  );
}

export default App;
