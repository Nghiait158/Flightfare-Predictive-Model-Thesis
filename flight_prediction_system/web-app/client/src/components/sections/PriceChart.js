import React, { useState, useEffect, useCallback } from 'react';
import flightService from '../../services/flightService';
import './PriceChart.css';

const PriceChart = ({ fromAirport, toAirport, onSelectDate }) => {
  const [priceData, setPriceData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [hoveredBar, setHoveredBar] = useState(null);
  const [tripType, setTripType] = useState('one-way');

  const fetchPriceData = useCallback(async () => {
    if (!fromAirport || !toAirport) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await flightService.getPriceChartData({
        from: fromAirport,
        to: toAirport,
        days: 15
      });

      if (response.success && response.data) {
        const prices = response.data.prices || [];
        setPriceData(prices);
        
        // Auto-select today's date if available
        const today = new Date().toISOString().split('T')[0];
        const todayData = prices.find(p => 
          new Date(p.date).toISOString().split('T')[0] === today && p.hasData
        );
        
        if (todayData) {
          setSelectedDate(todayData.date);
        } else {
          // If today not available, select first available date
          const firstAvailable = prices.find(p => p.hasData);
          if (firstAvailable) {
            setSelectedDate(firstAvailable.date);
          }
        }
      } else {
        setError('No price data available');
        setPriceData([]);
      }
    } catch (err) {
      console.error('Error fetching price chart:', err);
      setError('Failed to load price chart');
      setPriceData([]);
    } finally {
      setIsLoading(false);
    }
  }, [fromAirport, toAirport]);

  useEffect(() => {
    fetchPriceData();
  }, [fetchPriceData]);

  // Calculate bar height using the formula:
  // Height% = H_min + ((Price - Price_min) / (Price_max - Price_min)) × (H_max - H_min)
  const calculateBarHeight = (price, pricesWithData) => {
    const H_MIN = 60; // Minimum height percentage (60%)
    const H_MAX = 100; // Maximum height percentage (100%)
    
    if (!price || pricesWithData.length === 0) return H_MIN;
    
    const prices = pricesWithData.map(p => p.price);
    const priceMin = Math.min(...prices);
    const priceMax = Math.max(...prices);
    
    // If all prices are the same, return middle height
    if (priceMax === priceMin) return (H_MIN + H_MAX) / 2;
    
    // Apply the formula
    const heightPercent = H_MIN + ((price - priceMin) / (priceMax - priceMin)) * (H_MAX - H_MIN);
    
    return heightPercent;
  };

  const formatPrice = (price, currency) => {
    if (!price) return 'N/A';
    
    if (currency === 'VND') {
      return `${Math.floor(price / 1000)}k`;
    }
    return `$${Math.round(price)}`;
  };

  const formatDate = (dateStr) => {
    // Parse date string manually to avoid timezone issues
    const dateString = dateStr.toString().split('T')[0]; // "2024-12-17"
    const [year, month, dayNum] = dateString.split('-').map(Number);
    
    // Create date in UTC to avoid timezone conversion
    const date = new Date(Date.UTC(year, month - 1, dayNum));
    
    return {
      day: date.getUTCDate(),
      dayName: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      month: date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    };
  };

  const handleBarClick = (dateData) => {
    if (!dateData.hasData) return;
    setSelectedDate(dateData.date);
  };

  const handleSelectDate = () => {
    if (!selectedDate) return;
    
    const selectedData = priceData.find(p => p.date === selectedDate);
    if (selectedData && onSelectDate) {
      // Extract date string directly without Date parsing to avoid timezone issues
      // Handle both "2024-12-17" and "2024-12-17T00:00:00.000Z" formats
      const dateStr = selectedDate.toString().includes('T') 
        ? selectedDate.toString().split('T')[0]  // "2024-12-17T..." → "2024-12-17"
        : selectedDate.toString();  // Already "2024-12-17"
      onSelectDate(dateStr);
    }
  };

  const getSelectedDateText = () => {
    if (!selectedDate) return 'Select a date';
    
    const selectedData = priceData.find(p => p.date === selectedDate);
    if (!selectedData) return 'Select a date';
    
    // Parse date string manually to avoid timezone issues
    const dateString = selectedDate.toString().split('T')[0]; // "2024-12-17"
    const [year, month, dayNum] = dateString.split('-').map(Number);
    
    // Create date in UTC to avoid timezone conversion
    const date = new Date(Date.UTC(year, month - 1, dayNum));
    const monthName = date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
    const day = date.getUTCDate();
    
    return `Select ${monthName} ${day}`;
  };

  // Filter data with prices for height calculation
  const pricesWithData = priceData.filter(d => d.hasData);

  if (isLoading) {
    return (
      <div className="price-chart-container">
        <div className="price-chart-header">
          <h2 className="price-chart-title">Price chart</h2>
        </div>
        <div className="price-chart-loading">
          <div className="loading-spinner"></div>
          <span>Loading price chart...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="price-chart-container">
        <div className="price-chart-header">
          <h2 className="price-chart-title">Price chart</h2>
        </div>
        <div className="price-chart-error">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (priceData.length === 0 || pricesWithData.length === 0) {
    return (
      <div className="price-chart-container">
        <div className="price-chart-header">
          <h2 className="price-chart-title">Price chart</h2>
        </div>
        <div className="price-chart-empty">
          <span>No price data available for this route</span>
        </div>
      </div>
    );
  }

  return (
    <div className="price-chart-container">
      <div className="price-chart-header">
        <h2 className="price-chart-title">Price chart</h2>
        
      </div>

      <div className="price-chart-content">
        <div className="chart-navigation">
          <button className="nav-btn nav-prev" aria-label="Previous month">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>

          <div className="chart-wrapper">
            <div className="chart-bars-container">
              {priceData.map((dayData, index) => {
                const { day, dayName } = formatDate(dayData.date);
                const isSelected = selectedDate === dayData.date;
                const isHovered = hoveredBar === index;
                const barHeight = calculateBarHeight(dayData.price, pricesWithData);

                return (
                  <div 
                    key={index} 
                    className={`chart-bar-item ${!dayData.hasData ? 'no-data' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleBarClick(dayData)}
                    onMouseEnter={() => setHoveredBar(index)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    {/* Tooltip - show on hover OR when selected */}
                    {(isHovered || isSelected) && dayData.hasData && (
                      <div className="bar-tooltip">
                        from {formatPrice(dayData.price, dayData.currency)}
                      </div>
                    )}

                    {/* Bar */}
                    <div className="bar-column">
                      {dayData.hasData ? (
                        <div 
                          className={`bar ${isWeekend(dayData.dayOfWeek) ? 'weekend' : ''}`}
                          style={{ height: `${barHeight}%` }}
                        />
                      ) : (
                        <div className="bar-empty" style={{ height: '20%' }} />
                      )}
                    </div>

                    {/* Date label */}
                    <div className="bar-label">
                      <span className="bar-day">{day}</span>
                      <span className="bar-day-name">{dayName}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button className="nav-btn nav-next" aria-label="Next month">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        </div>

        <button 
          className="select-date-btn"
          onClick={handleSelectDate}
          disabled={!selectedDate}
        >
          {getSelectedDateText()}
        </button>
      </div>
    </div>
  );
};

// Helper function to check if day is weekend
const isWeekend = (dayOfWeek) => {
  return dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
};

export default PriceChart;

