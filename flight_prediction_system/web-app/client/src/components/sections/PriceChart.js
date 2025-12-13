import React, { useState, useEffect } from 'react';
import flightService from '../../services/flightService';
import './PriceChart.css';

const PriceChart = ({ fromAirport, toAirport, onSelectDate }) => {
  const [priceData, setPriceData] = useState([]);
  const [selectedBar, setSelectedBar] = useState(null);
  const [tripType, setTripType] = useState('one-way');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (fromAirport && toAirport) {
      fetchNext15DaysPrices();
    }
  }, [fromAirport, toAirport]);

  const fetchNext15DaysPrices = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('📊 Fetching 15 days prices:', { 
        from: fromAirport, 
        to: toAirport
      });
      
      // Get prices for next 15 days using cheapest tickets API
      const response = await flightService.getCheapestTickets({
        from: fromAirport,
        to: toAirport,
        daysAhead: 15,
        limit: 15
      });

      console.log('📈 Price chart response:', response);

      if (response.success && response.data.flights) {
        // Transform to array format for chart
        const chartData = response.data.flights.map(flight => ({
          date: flight.flightDate,
          dateFormatted: flight.date,
          price: flight.price,
          currency: flight.currency,
          time: flight.time,
          duration: flight.duration,
          airline: flight.airlineName
        }));

        // Sort by date
        chartData.sort((a, b) => new Date(a.date) - new Date(b.date));

        console.log('✅ Chart data loaded:', chartData.length, 'days');
        setPriceData(chartData);
      } else {
        console.warn('⚠️ No price data in response');
        setPriceData([]);
      }
    } catch (err) {
      console.error('❌ Error fetching price chart data:', err);
      console.error('Error details:', err.response?.data || err.message);
      
      let errorMessage = 'Failed to load price data';
      if (err.response) {
        errorMessage = `Server error: ${err.response.data?.message || err.response.statusText}`;
      } else if (err.request) {
        errorMessage = 'Cannot connect to server. Please check if backend is running.';
      } else {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setPriceData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatPrice = (price, currency) => {
    if (!price) return null;
    
    if (currency === 'VND') {
      return `${Math.floor(price / 1000)}k`;
    }
    return `$${Math.round(price)}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    return { day, month, weekday };
  };

  const getMaxPrice = () => {
    if (priceData.length === 0) return 0;
    return Math.max(...priceData.map(d => d.price));
  };

  const getMinPrice = () => {
    if (priceData.length === 0) return 0;
    return Math.min(...priceData.map(d => d.price));
  };

  const handleBarClick = (index) => {
    setSelectedBar(selectedBar === index ? null : index);
  };

  const handleSelectDateClick = () => {
    if (selectedBar !== null && priceData[selectedBar] && onSelectDate) {
      const selectedFlight = priceData[selectedBar];
      // Convert flightDate to YYYY-MM-DD format using local timezone
      const date = new Date(selectedFlight.date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      onSelectDate(dateString);
      console.log('Date selected from PriceChart:', dateString, 'Original:', selectedFlight.date);
    }
  };

  const maxPrice = getMaxPrice();
  const minPrice = getMinPrice();
  const lowestPriceIndex = priceData.findIndex(d => d.price === minPrice);

  return (
    <div className="price-chart-container">
      <div className="price-chart-header">
        <h2 className="price-chart-title">Price chart</h2>
        
        <div className="trip-type-toggle">
          <button
            className={`trip-type-btn ${tripType === 'one-way' ? 'active' : ''}`}
            onClick={() => setTripType('one-way')}
          >
            One-way
          </button>
          <button
            className={`trip-type-btn ${tripType === 'round-trip' ? 'active' : ''}`}
            onClick={() => setTripType('round-trip')}
          >
            Round trip
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="price-chart-loading">
          <div className="loading-spinner"></div>
          <span>Loading price chart...</span>
        </div>
      ) : error ? (
        <div className="price-chart-error">
          <span>{error}</span>
        </div>
      ) : priceData.length === 0 ? (
        <div className="no-prices-message">
          <p>No flight prices available for the next 15 days.</p>
          <p style={{ fontSize: '12px', marginTop: '8px', color: '#64748b' }}>
            Try a different route or check if flight data exists.
          </p>
        </div>
      ) : (
        <div className="price-chart-content">
          {/* Price Range Info */}
          <div className="price-range-info">
            <div className="price-info-item">
              <span className="price-info-label">Lowest</span>
              <span className="price-info-value">{formatPrice(minPrice, priceData[0]?.currency)}</span>
            </div>
            <div className="price-info-item">
              <span className="price-info-label">Highest</span>
              <span className="price-info-value">{formatPrice(maxPrice, priceData[0]?.currency)}</span>
            </div>
            <div className="price-info-item">
              <span className="price-info-label">Average</span>
              <span className="price-info-value">
                {formatPrice(
                  Math.round(priceData.reduce((sum, d) => sum + d.price, 0) / priceData.length),
                  priceData[0]?.currency
                )}
              </span>
            </div>
          </div>

          {/* Bar Chart */}
          <div className="bar-chart-wrapper">
            <div className="bar-chart">
              {priceData.map((data, index) => {
                const heightPercent = (data.price / maxPrice) * 100;
                const isLowest = index === lowestPriceIndex;
                const isSelected = selectedBar === index;
                const dateInfo = formatDate(data.date);

                return (
                  <div
                    key={index}
                    className={`bar-item ${isLowest ? 'lowest' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleBarClick(index)}
                  >
                    <div className="bar-column">
                      <div className="bar-price-label">
                        {formatPrice(data.price, data.currency)}
                      </div>
                      <div 
                        className="bar-fill"
                        style={{ height: `${heightPercent}%` }}
                      >
                        {isLowest && (
                          <span className="best-deal-badge">Best</span>
                        )}
                      </div>
                    </div>
                    <div className="bar-label">
                      <div className="bar-date-day">{dateInfo.day}</div>
                      <div className="bar-date-month">{dateInfo.month}</div>
                      <div className="bar-date-weekday">{dateInfo.weekday}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Select Date Button */}
          {selectedBar !== null && priceData[selectedBar] && (
            <button 
              className="select-date-btn"
              onClick={handleSelectDateClick}
            >
              Select {formatDate(priceData[selectedBar].date).month} {formatDate(priceData[selectedBar].date).day}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PriceChart;
