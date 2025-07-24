import React from 'react';
import './Header.css'; 

const Header = () => (
  <header class="header">
    <div class="logo-container">
      <div class="logo-icon-placeholder"></div>
      <span class="logo-text">FareForecast</span>
    </div>
    <nav class="nav-links">
      <a href="#contact">CONTACT</a>
      <a href="#home">HOME</a>
      <a href="#tour">TOUR</a>
    </nav>
    <button class="register-button">Register</button>
  </header>
);

export default Header;