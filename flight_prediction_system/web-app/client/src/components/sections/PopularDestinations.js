import React, { useState, useEffect, useRef } from 'react';
import flightService from '../../services/flightService';
import './PopularDestinations.css';

const PopularDestinations = ({ fromAirport, onSelectDestination }) => {
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (fromAirport) {
      fetchPopularDestinations(fromAirport);
    } else {
      setDestinations([]);
    }
  }, [fromAirport]);

  useEffect(() => {
    checkScrollButtons();
  }, [destinations]);

  const fetchPopularDestinations = async (airportCode) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await flightService.getPopularDestinations(airportCode);
      
      if (data.success) {
        setDestinations(data.data.destinations || []);
      } else {
        setError(data.message || 'Failed to load destinations');
      }
    } catch (err) {
      console.error('Error fetching popular destinations:', err);
      setError('Unable to load popular destinations');
    } finally {
      setLoading(false);
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

    const scrollAmount = 320; // width of one card + gap
    const newScrollLeft = direction === 'left' 
      ? container.scrollLeft - scrollAmount 
      : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth'
    });
  };

  const handleDestinationClick = (destination) => {
    if (onSelectDestination) {
      onSelectDestination(destination.airportCode);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };

  if (!fromAirport) {
    return null;
  }

  if (loading) {
    return (
      <div className="popular-destinations-container">
        <div className="popular-destinations-loading">
          <div className="loading-spinner"></div>
          <p>Loading popular destinations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="popular-destinations-container">
        <div className="popular-destinations-error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (destinations.length === 0) {
    return null;
  }

  return (
    <div className="popular-destinations-container">
      <div className="popular-destinations-header">
        <h3>Popular destinations from {fromAirport}</h3>
        {/* <p className="destinations-subtitle">Book your next adventure</p> */}
        
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
        className="destinations-grid"
        ref={scrollContainerRef}
        onScroll={checkScrollButtons}
      >
        {destinations.map((destination, index) => (
          <div
            key={index}
            className="destination-card"
            onClick={() => handleDestinationClick(destination)}
          >
            <div className="destination-info">
              <div className="destination-city">
                <h4>{destination.city}</h4>
                <span className="destination-code">{destination.airportCode}</span>
              </div>
              <p className="destination-airport">{destination.airportName}</p>
            </div>
            
            <div className="destination-price">
              <div className="price-label">from</div>
              <div className="price-amount">{formatPrice(destination.minPrice)}</div>
              {/* {destination.flightCount && (
                <div className="flights-count">{destination.flightCount} flights</div>
              )} */}
            </div>

            <div className="destination-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </div>
        ))}
      </div>
      
    </div>
  );
};

export default PopularDestinations;

