import React, { useState, useEffect } from 'react';
import flightService from '../../services/flightService';
import './CheapestTickets.css';

const CheapestTickets = ({ fromAirport, toAirport }) => {
  const [cheapestFlights, setCheapestFlights] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (fromAirport && toAirport) {
      fetchCheapestFlights();
    }
  }, [fromAirport, toAirport]);

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

  const handleFlightClick = (flight) => {
    console.log('Selected cheapest flight:', flight);
    // TODO: Handle flight selection - navigate to search results with this date
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
        <h2 className="cheapest-tickets-title">Cheapest tickets</h2>
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
        <h2 className="cheapest-tickets-title">Cheapest tickets</h2>
        <div className="cheapest-tickets-error">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (cheapestFlights.length === 0) {
    return (
      <div className="cheapest-tickets-container">
        <h2 className="cheapest-tickets-title">Cheapest tickets</h2>
        <div className="cheapest-tickets-empty">
          <span>No flights available for this route</span>
        </div>
      </div>
    );
  }

  return (
    <div className="cheapest-tickets-container">
      <h2 className="cheapest-tickets-title">Cheapest tickets</h2>
      
      <div className="cheapest-tickets-scroll">
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

