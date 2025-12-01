import React, { useState } from 'react';
import SearchForm from '../form/search_form';
import PopularDestinations from './PopularDestinations';
import FlightOptionsMenu from './FlightOptionsMenu';
import CheapestTickets from './CheapestTickets';
import { airports } from '../../data/airports';
import './main_section.css';

const MainSection = ({ onSearch }) => {
  const [selectedFrom, setSelectedFrom] = useState('');
  const [selectedTo, setSelectedTo] = useState('');

  // Get city name from airport code
  const getCityName = (airportCode) => {
    const airport = airports.find(a => a.code === airportCode);
    return airport ? airport.city : airportCode;
  };

  const handleFromChange = (airportCode) => {
    setSelectedFrom(airportCode);
  };

  const handleToChange = (airportCode) => {
    setSelectedTo(airportCode);
  };

  const handleSelectDestination = (airportCode) => {
    setSelectedTo(airportCode);
  };

  const handleOptionSelect = (option) => {
    console.log('Selected option:', option);
    // Handle option selection here
  };

  // Check if both airports are selected
  const isCompactMode = selectedFrom && selectedTo;

  return (
    <section className={`main-section ${isCompactMode ? 'compact-mode' : ''}`}>
      {/* <div className="main-background">
        <div className="blur-circle blur-top-right"></div>
        <div className="blur-circle blur-bottom-left"></div>
      </div> */}

      <div className="main-container">
        <div className="main-header">
          {/* <div className="main-badge">
            <svg className="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3l18 18M18 6l-9 9M9 12l7-7M9 18l6-6"/>
            </svg>
            Smart Flight Price Prediction
          </div> */}

          <h1 className={`main-title ${isCompactMode ? 'hidden' : ''}`}>
            Forecasting<br />
            <span className="main-title-gradient">Smart Flight</span>
          </h1>

          <p className={`main-description ${selectedFrom ? 'hidden' : ''}`}>
            Predict with precision. Book with confidence. Save on every flight
          </p>
        </div>

        <div className={`main-search ${isCompactMode ? 'compact' : ''}`}>
          <SearchForm 
            onSubmit={onSearch}
            onFromChange={handleFromChange}
            onToChange={handleToChange}
            selectedTo={selectedTo}
            isCompactMode={isCompactMode}
          />
          
          {!isCompactMode && (
            <PopularDestinations 
              fromAirport={selectedFrom} 
              onSelectDestination={handleSelectDestination}
            />
          )}
        </div>

        {isCompactMode && (
          <div className="compact-options-wrapper">
            <FlightOptionsMenu 
              fromAirport={getCityName(selectedFrom)}
              toAirport={getCityName(selectedTo)}
              onSelectOption={handleOptionSelect}
            />
            <CheapestTickets 
              fromAirport={selectedFrom}
              toAirport={selectedTo}
            />
          </div>
        )}
      </div>
    </section>
  );
};

export default MainSection;

