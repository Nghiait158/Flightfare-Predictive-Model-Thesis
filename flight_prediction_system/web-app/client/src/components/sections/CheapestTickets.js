import React, { useState, useEffect, useRef } from 'react';
import flightService from '../../services/flightService';
import './CheapestTickets.css';

const CheapestTickets = ({ fromAirport, toAirport, onSelectDate }) => {
  const [cheapestFlights, setCheapestFlights] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (fromAirport && toAirport) {
      fetchCheapestFlights();
    }
  }, [fromAirport, toAirport]);

  useEffect(() => {
    checkScrollButtons();
  }, [cheapestFlights]);

  const fetchCheapestFlights = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await flightService.getCheapestTickets({
        from: fromAirport,
        to: toAirport,
        daysAhead: 90, // Search next 90 days
        limit: 10 // Get top 10 cheapest flights
      });

      if (response.success && response.data) {
        setCheapestFlights(response.data.flights || []);
      } else {
        setError('No flights found');
        setCheapestFlights([]);
      }
    } catch (err) {
      console.error('Error fetching cheapest tickets:', err);
      setError('Failed to load cheapest tickets');
      setCheapestFlights([]);
    } finally {
      setIsLoading(false);
    }
  };

  const checkScrollButtons = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollLeft = container.scrollLeft;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;

    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  };

  const scrollToDirection = (direction) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = 296; // width of one card (280px) + gap (16px)
    const newScrollLeft = direction === 'left' 
      ? container.scrollLeft - scrollAmount 
      : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth'
    });
  };

  const handleFlightClick = (flight) => {
    console.log('Selected cheapest flight:', flight);
    if (onSelectDate && flight.flightDate) {
      // Convert flightDate to YYYY-MM-DD format using local timezone
      const date = new Date(flight.flightDate);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      onSelectDate(dateString);
      console.log('Date selected from CheapestTickets:', dateString, 'Original:', flight.flightDate);
    }
  };

  const formatPrice = (price, currency) => {
    if (currency === 'VND') {
      // Convert to millions for Vietnamese Dong
      return `${Math.floor(price / 1000)}k`;
    }
    return `$${Math.round(price)}`;
  };

  if (isLoading) {
    return (
      <div className="cheapest-tickets-container">
        <div className="cheapest-tickets-header">
          <h2 className="cheapest-tickets-title">Cheapest tickets</h2>
        </div>
        <div className="cheapest-tickets-loading">
          <div className="loading-spinner"></div>
          <span>Finding best deals...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cheapest-tickets-container">
        <div className="cheapest-tickets-header">
          <h2 className="cheapest-tickets-title">Cheapest tickets</h2>
        </div>
        <div className="cheapest-tickets-error">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (cheapestFlights.length === 0) {
    return (
      <div className="cheapest-tickets-container">
        <div className="cheapest-tickets-header">
          <h2 className="cheapest-tickets-title">Cheapest tickets</h2>
        </div>
        <div className="cheapest-tickets-empty">
          <span>No flights available for this route</span>
        </div>
      </div>
    );
  }

  return (
    <div className="cheapest-tickets-container">
      <div className="cheapest-tickets-header">
        <h2 className="cheapest-tickets-title">Cheapest tickets</h2>
        
        <div className="scroll-buttons">
          <button 
            className={`scroll-btn scroll-btn-left ${!canScrollLeft ? 'disabled' : ''}`}
            onClick={() => scrollToDirection('left')}
            disabled={!canScrollLeft}
            aria-label="Scroll left"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <button 
            className={`scroll-btn scroll-btn-right ${!canScrollRight ? 'disabled' : ''}`}
            onClick={() => scrollToDirection('right')}
            disabled={!canScrollRight}
            aria-label="Scroll right"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        </div>
      </div>
      
      <div 
        className="cheapest-tickets-scroll"
        ref={scrollContainerRef}
        onScroll={checkScrollButtons}
      >
        <div className="cheapest-tickets-list">
          {cheapestFlights.map((flight, index) => (
            <div 
              key={`${flight.scheduleId}-${flight.flightDate}-${index}`}
              className="cheapest-ticket-card"
              onClick={() => handleFlightClick(flight)}
            >
              <div className="ticket-price">
                <span className="price-amount">
                  {formatPrice(flight.price, flight.currency)}
                </span>
              </div>
              
              <div className="ticket-details">
                <div className="ticket-date">{flight.date}</div>
                
                <div className="ticket-flight-info">
                  <div className="ticket-time">
                    {flight.time}
                  </div>
                  
                  <div className="ticket-meta">
                    <span className="flight-duration">{flight.duration}</span>
                    <span className="flight-separator">/</span>
                    <span className="flight-type">{flight.flightType}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CheapestTickets;

