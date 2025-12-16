import React, { useState, useRef } from 'react';
import SearchForm from '../form/search_form';
import PopularDestinations from './PopularDestinations';
import FlightOptionsMenu from './FlightOptionsMenu';
import CheapestTickets from './CheapestTickets';
import PriceChart from './PriceChart';
import { airports } from '../../data/airports';
import './main_section.css';

const MainSection = ({ onSearch }) => {
  const [selectedFrom, setSelectedFrom] = useState('');
  const [selectedTo, setSelectedTo] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  // Refs for smooth scrolling
  const cheapestTicketsRef = useRef(null);
  const priceChartRef = useRef(null);
  const searchFormRef = useRef(null);
  const rightColumnRef = useRef(null);

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
    
    // Smooth scroll within the right column container only
    if (!rightColumnRef.current) return;

    if (option === 'cheapest' && cheapestTicketsRef.current) {
      const container = rightColumnRef.current;
      const target = cheapestTicketsRef.current;
      const targetPosition = target.offsetTop - container.offsetTop;
      
      container.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    } else if (option === 'pricechart' && priceChartRef.current) {
      const container = rightColumnRef.current;
      const target = priceChartRef.current;
      const targetPosition = target.offsetTop - container.offsetTop;
      
      container.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    }
  };

  const handlePriceChartDateSelect = (date) => {
    console.log('Selected date from price chart:', date);
    setSelectedDate(date);
    
    // Scroll to search form
    if (searchFormRef.current) {
      searchFormRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
  };

  const handleCheapestTicketSelect = (date) => {
    console.log('Selected date from cheapest ticket:', date);
    setSelectedDate(date);
    
    // Scroll to search form
    if (searchFormRef.current) {
      searchFormRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
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

        <div className={`main-search ${isCompactMode ? 'compact' : ''}`} ref={searchFormRef}>
          <SearchForm 
            onSubmit={onSearch}
            onFromChange={handleFromChange}
            onToChange={handleToChange}
            selectedTo={selectedTo}
            selectedDate={selectedDate}
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
            <div className="compact-right-column" ref={rightColumnRef}>
              <div ref={cheapestTicketsRef}>
                <CheapestTickets 
                  fromAirport={selectedFrom}
                  toAirport={selectedTo}
                  onSelectFlight={handleCheapestTicketSelect}
                />
              </div>
              
              <div ref={priceChartRef}>
                <PriceChart 
                  fromAirport={selectedFrom}
                  toAirport={selectedTo}
                  onSelectDate={handlePriceChartDateSelect}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default MainSection;

