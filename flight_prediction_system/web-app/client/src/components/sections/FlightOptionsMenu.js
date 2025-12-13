import React from 'react';
import './FlightOptionsMenu.css';

const FlightOptionsMenu = ({ fromAirport, toAirport, onSelectOption, selectedOption = 'cheapest' }) => {
  const handleOptionClick = (option) => {
    if (onSelectOption) {
      onSelectOption(option);
    }
  };

  return (
    <div className="flight-options-menu">
      <div className="flight-options-header">
        <h3 className="flight-route-title">
          {fromAirport && toAirport ? `${fromAirport} — ${toAirport}` : 'Select Route'}
        </h3>
      </div>
      
      <div className="flight-options-list">
        <button 
          className={`flight-option-item ${selectedOption === 'cheapest' ? 'active' : ''}`}
          onClick={() => handleOptionClick('cheapest')}
        >
          <div className="option-icon cheapest-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
            </svg>
          </div>
          <span className="option-text">Cheapest tickets</span>
        </button>

        <button 
          className={`flight-option-item ${selectedOption === 'pricechart' ? 'active' : ''}`}
          onClick={() => handleOptionClick('pricechart')}
        >
          <div className="option-icon chart-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M8 12h8M8 16h8M16 8h0"/>
            </svg>
          </div>
          <span className="option-text">Price chart</span>
        </button>

        <button 
          className={`flight-option-item ${selectedOption === 'schedule' ? 'active' : ''}`}
          onClick={() => handleOptionClick('schedule')}
        >
          <div className="option-icon schedule-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <span className="option-text">Direct flights schedule</span>
        </button>
      </div>
    </div>
  );
};

export default FlightOptionsMenu;


