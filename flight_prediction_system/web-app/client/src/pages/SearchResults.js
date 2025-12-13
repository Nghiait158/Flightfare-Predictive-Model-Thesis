import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './SearchResults.css';
import Header from '../components/layout/header';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import Select from '../components/common/Select';
import Checkbox from '../components/common/Checkbox';
import EditSearchForm from '../components/form/EditSearchForm';
import flightService from '../services/flightService';
import crawlerService from '../services/crawlerService';


const SearchResults = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const editFormRef = useRef(null);
  
  const initialSearchParams = location.state?.searchParams || {
    from: 'SGN',
    to: 'HAN',
    departDate: new Date().toISOString().split('T')[0],
    returnDate: null,
    tripType: 'one-way',
    adults: 1,
    children: 0,
    infants: 0
  };

  const [searchParams, setSearchParams] = useState(initialSearchParams);
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [crawling, setCrawling] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState('');
  
  const [filters, setFilters] = useState({
    priceMin: 0,
    priceMax: 10000000,
    airlines: [],
    departureTime: [],
    duration: [],
    stops: [],
    ticketClass: []
  });

  const [sortBy, setSortBy] = useState('recommended');
  const [viewMode, setViewMode] = useState('list');
  const [showEditModal, setShowEditModal] = useState(false);
  const [modalData, setModalData] = useState(initialSearchParams);
  const [currentPage, setCurrentPage] = useState(1);
  const [airlines, setAirlines] = useState([]);
  const [flightClasses, setFlightClasses] = useState([]);
  const [dataFreshness, setDataFreshness] = useState(null);

  const itemsPerPage = 10;

  const crawlAndRetry = useCallback(async () => {
    try {
      setCrawling(true);
      setCrawlMessage('No flight prices found in database. Searching for latest prices...');
      
      console.log('Starting automatic crawl...');
      console.log('Search params:', searchParams);
      console.log('Crawler URL:', process.env.REACT_APP_CRAWLER_URL || 'http://localhost:3000/api/crawl');
      
      // Crawl flight data
      const crawlResult = await crawlerService.smartCrawl(searchParams);
      
      if (crawlResult.success) {
        console.log('Crawl successful, fetching flights again...');
        setCrawlMessage('Flight prices found! Loading data...');
        
        // Wait longer for database to be updated (increased from 2s to 5s)
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Will trigger re-fetch via return value
        return true;
      } else {
        throw new Error('Crawl failed');
      }
    } catch (err) {
      console.error('Crawl error:', err);
      
      // More user-friendly error with suggestions
      let errorMessage = 'Unable to search for new flight prices. ';
      
      if (err.message.includes('Network Error') || err.code === 'ECONNREFUSED') {
        errorMessage += 'Cannot connect to crawler server. Please check if the crawler server is running (port 3000).';
      } else if (err.message.includes('timeout')) {
        errorMessage += 'Search is taking too long. Please try again.';
      } else {
        errorMessage += 'Please try again later or choose a different date.';
      }
      
      setError(errorMessage);
      setFlights([]); // Set empty array to show empty state
      return false;
    } finally {
      setCrawling(false);
      setCrawlMessage('');
    }
  }, [searchParams]);

  const fetchFlights = useCallback(async (skipCrawl = false) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching flights with params:', searchParams);
      
      const response = await flightService.searchFlights(searchParams);
      
      console.log('API Response:', response);
      
      if (response.success) {
        // Store data freshness info
        if (response.data.dataFreshness) {
          console.log('📊 Data Freshness:', response.data.dataFreshness);
          setDataFreshness(response.data.dataFreshness);
        }

        // Check if we got any flights
        if (response.data.flights.length === 0 && !skipCrawl) {
          // No flights found - trigger automatic crawl
          console.log('No flights found in database, triggering automatic crawl...');
          const crawlSuccess = await crawlAndRetry();
          if (crawlSuccess) {
            // Recursively fetch again with skipCrawl = true
            return fetchFlights(true);
          }
          return; // Exit early if crawl failed
        }

        // Check if data is too old (> 6 hours) and auto-crawl
        // But also check if we have just crawled (to avoid re-crawling immediately)
        const AUTO_CRAWL_THRESHOLD = 6; // hours
        
        console.log(`🔍 Checking data freshness:`, {
          oldestDataHours: response.data.dataFreshness?.oldestDataHours,
          isStale: response.data.dataFreshness?.isStale,
          threshold: AUTO_CRAWL_THRESHOLD,
          skipCrawl: skipCrawl,
          flightCount: response.data.flights.length
        });
        
        if (response.data.dataFreshness?.oldestDataHours > AUTO_CRAWL_THRESHOLD && !skipCrawl && response.data.flights.length > 0) {
          console.log(`⚠️ Data is too old (${response.data.dataFreshness.oldestDataHours}h > ${AUTO_CRAWL_THRESHOLD}h), triggering automatic crawl...`);
          const crawlSuccess = await crawlAndRetry();
          if (crawlSuccess) {
            // Recursively fetch again with skipCrawl = true
            return fetchFlights(true);
          }
          return; // Exit early if crawl failed
        }

        // Check if data is stale (0-6 hours) - just show the data with refresh option
        if (response.data.dataFreshness?.isStale && response.data.dataFreshness?.oldestDataHours <= AUTO_CRAWL_THRESHOLD && !skipCrawl && response.data.flights.length > 0) {
          console.log(`✅ Data is stale but within ${AUTO_CRAWL_THRESHOLD} hours, showing data with refresh option...`);
        }
        
        if (response.data.dataFreshness?.oldestDataHours <= AUTO_CRAWL_THRESHOLD) {
          console.log(`✅ Data is fresh (${response.data.dataFreshness?.oldestDataHours}h), showing results directly`);
        }

        setFlights(response.data.flights);
        
        // Auto-adjust price filter based on results
        if (response.data.flights.length > 0) {
          const prices = response.data.flights.flatMap(f => 
            f.classes.map(c => c.price)
          );
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          
          setFilters(prev => ({
            ...prev,
            priceMin: Math.floor(minPrice * 0.9),
            priceMax: Math.ceil(maxPrice * 1.1)
          }));
        }
      } else {
        setError(response.message || 'Failed to fetch flights');
      }
    } catch (err) {
      console.error('Error fetching flights:', err);
      console.error('Error details:', err.response?.data || err.message);
      
      // More detailed error message
      let errorMessage = 'Failed to load flights. ';
      if (err.response) {
        errorMessage += `Server error: ${err.response.data?.message || err.response.statusText}`;
      } else if (err.request) {
        errorMessage += 'Cannot connect to server. Please check if the backend is running.';
      } else {
        errorMessage += err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [crawlAndRetry, searchParams]);

  const fetchAirlines = useCallback(async () => {
    try {
      const response = await flightService.getAirlines();
      if (response.success) {
        setAirlines(response.data);
      }
    } catch (err) {
      console.error('Error fetching airlines:', err);
    }
  }, []);

  const fetchFlightClasses = useCallback(async () => {
    try {
      const response = await flightService.getFlightClasses();
      if (response.success) {
        setFlightClasses(response.data);
      }
    } catch (err) {
      console.error('Error fetching flight classes:', err);
    }
  }, []);

  // Fetch flights on mount and when search params change
  useEffect(() => {
    fetchFlights();
    fetchAirlines();
    fetchFlightClasses();
  }, [fetchFlights, fetchAirlines, fetchFlightClasses]);

  // Filter and sort flights
  const filteredFlights = useMemo(() => {
    let result = flights.filter(flight => {
      // Get min price for this flight across all classes
      const minPrice = Math.min(...flight.classes.map(c => c.price));
      
      // Price filter
      if (minPrice < filters.priceMin || minPrice > filters.priceMax) {
        return false;
      }

      // Airlines filter
      if (filters.airlines.length > 0 && !filters.airlines.includes(flight.airline.code)) {
        return false;
      }

      // Departure time filter
      if (filters.departureTime.length > 0) {
        const hour = parseInt(flight.departure.time.split(':')[0]);
        let timeRange = '';
        if (hour >= 6 && hour < 12) timeRange = 'morning';
        else if (hour >= 12 && hour < 18) timeRange = 'afternoon';
        else if (hour >= 18 && hour < 24) timeRange = 'evening';
        else timeRange = 'night';

        if (!filters.departureTime.includes(timeRange)) {
          return false;
        }
      }

      // Duration filter
      if (filters.duration.length > 0) {
        const minutes = flight.durationMinutes;
        let durationRange = '';
        if (minutes <= 150) durationRange = 'short';
        else if (minutes <= 240) durationRange = 'medium';
        else durationRange = 'long';

        if (!filters.duration.includes(durationRange)) {
          return false;
        }
      }

      // Stops filter
      if (filters.stops.length > 0) {
        const stops = flight.stops.toString();
        if (!filters.stops.includes(stops)) {
          return false;
        }
      }

      // Ticket class filter
      if (filters.ticketClass.length > 0) {
        const hasMatchingClass = flight.classes.some(c => 
          filters.ticketClass.includes(c.className)
        );
        if (!hasMatchingClass) {
          return false;
        }
      }

      return true;
    });

    // Sort
    switch (sortBy) {
      case 'price-low':
        result.sort((a, b) => {
          const minA = Math.min(...a.classes.map(c => c.price));
          const minB = Math.min(...b.classes.map(c => c.price));
          return minA - minB;
        });
        break;
      case 'price-high':
        result.sort((a, b) => {
          const minA = Math.min(...a.classes.map(c => c.price));
          const minB = Math.min(...b.classes.map(c => c.price));
          return minB - minA;
        });
        break;
      case 'duration':
        result.sort((a, b) => a.durationMinutes - b.durationMinutes);
        break;
      case 'departure-early':
        result.sort((a, b) => a.departure.time.localeCompare(b.departure.time));
        break;
      case 'departure-late':
        result.sort((a, b) => b.departure.time.localeCompare(a.departure.time));
        break;
      case 'recommended':
      default:
        // Keep original order (already sorted by price in backend)
        break;
    }

    return result;
  }, [flights, filters, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredFlights.length / itemsPerPage);
  const paginatedFlights = filteredFlights.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Filter handlers
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => {
      const current = prev[filterType];
      if (Array.isArray(current)) {
        if (current.includes(value)) {
          return { ...prev, [filterType]: current.filter(item => item !== value) };
        } else {
          return { ...prev, [filterType]: [...current, value] };
        }
      }
      return prev;
    });
    setCurrentPage(1);
  };

  const handlePriceChange = (minOrMax, value) => {
    setFilters(prev => ({
      ...prev,
      [minOrMax === 'min' ? 'priceMin' : 'priceMax']: value
    }));
    setCurrentPage(1);
  };

  const handleEditSearch = () => {
    setModalData(searchParams);
    setShowEditModal(true);
  };

  const handleRefreshPrices = async () => {
    setCrawling(true);
    setCrawlMessage('Refreshing latest prices...');
    
    try {
      const crawlSuccess = await crawlAndRetry();
      if (crawlSuccess) {
        await fetchFlights(true);
      }
    } catch (err) {
      console.error('Error refreshing prices:', err);
    } finally {
      setCrawling(false);
      setCrawlMessage('');
    }
  };

  const handleSaveSearch = (updatedParams) => {
    // Only process if we receive actual form data (not an event object)
    if (updatedParams && updatedParams.from && updatedParams.to) {
      setSearchParams(updatedParams);
      setModalData(updatedParams);
      setShowEditModal(false);
      setCurrentPage(1);
    }
  };

  const handleSubmitEditForm = () => {
    // Trigger form submission by calling the form's submit method
    if (editFormRef.current) {
      editFormRef.current.dispatchEvent(
        new Event('submit', { cancelable: true, bubbles: true })
      );
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading || crawling) {
    return (
      <>
        <Header />
        <div className="search-results">
          <div className="search-results__loading">
            <div className="spinner"></div>
            <p>{crawlMessage || 'Searching for flights...'}</p>
            {crawling && (
              <div className="crawl-info">
                <p className="crawl-info__note">
                  This process may take 30-60 seconds
                </p>
                <p className="crawl-info__detail">
                  Collecting latest prices from airlines...
                </p>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <div className="search-results">
        <div className="search-results__error">
          <h2>An Error Occurred</h2>
          <p>{error}</p>
          <div className="error-actions">
            <Button variant="secondary" onClick={() => {
              setError(null);
              fetchFlights(true); // Try again without crawl
            }}>
              Try Again
            </Button>
            <Button onClick={() => navigate('/')}>
              ← Back to Home
            </Button>
          </div>
          
          {/* Troubleshooting tips */}
          <div className="error-tips">
            <h3>Troubleshooting Tips:</h3>
            <ul>
              <li>Try searching with a different date</li>
              <li>Check your internet connection</li>
            </ul>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="search-results">
        {/* Header */}
        <div className="search-results__header">
          <div className="search-results__header-content">
          <div className="search-info">
            <div className="search-info__details">
              <span className="search-info__route">
                {searchParams.from} → {searchParams.to}
              </span>
              <span className="search-info__divider">|</span>
              <span className="search-info__date">{formatDate(searchParams.departDate)}</span>
              <span className="search-info__divider">|</span>
              <span className="search-info__passengers">
                {searchParams.adults} Adult{searchParams.adults > 1 ? 's' : ''}
                {searchParams.children > 0 && `, ${searchParams.children} Child${searchParams.children > 1 ? 'ren' : ''}`}
                {searchParams.infants > 0 && `, ${searchParams.infants} Infant${searchParams.infants > 1 ? 's' : ''}`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {dataFreshness && dataFreshness.isStale && dataFreshness.oldestDataHours <= 6 && (
                <span style={{ 
                  fontSize: '12px', 
                  color: '#fbbf24',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  ⚠️ Data is {Math.round(dataFreshness.oldestDataHours)}h old
                </span>
              )}
              {dataFreshness && dataFreshness.isStale && dataFreshness.oldestDataHours <= 6 && (
                <Button 
                  size="sm" 
                  variant="secondary" 
                  onClick={handleRefreshPrices}
                  disabled={crawling}
                >
                  Refresh Prices
                </Button>
              )}
              <Button size="sm" onClick={handleEditSearch}>
                Edit Search
              </Button>
            </div>
          </div>

          <div className="search-controls">
            {/* <div className="view-toggle">
              <Button
                variant={viewMode === 'list' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                ☰
              </Button>
              <Button
                variant={viewMode === 'card' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('card')}
              >
                ⊞
              </Button>
            </div> */}

            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              options={[
                { value: 'recommended', label: 'Recommended' },
                { value: 'price-low', label: 'Price: Low to High' },
                { value: 'price-high', label: 'Price: High to Low' },
                { value: 'duration', label: 'Flight Duration' },
                { value: 'departure-early', label: 'Earliest Departure' },
                { value: 'departure-late', label: 'Latest Departure' }
              ]}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="search-results__content">
        {/* Filters Sidebar */}
        <aside className="filters-sidebar">
          <Card>
            <div className="filters-sidebar__breadcrumb">
              <span>Home</span>
              <span>›</span>
              <span>Results</span>
              <span>›</span>
              <span>{searchParams.from} → {searchParams.to}</span>
            </div>

            <div className="filters-sidebar__count">
              <span>{filteredFlights.length} flight{filteredFlights.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Price Range  */}
            <div className="filter-group">
              <h3 className="filter-group__title">Price Range</h3>
              <div className="filter-group__content">
                <div className="price-range">
                  <div className="price-range__labels">
                    <span>{formatPrice(filters.priceMin)}</span>
                    <span>{formatPrice(filters.priceMax)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10000000"
                    step="100000"
                    value={filters.priceMin}
                    onChange={(e) => handlePriceChange('min', parseInt(e.target.value))}
                    className="range-slider"
                  />
                  <input
                    type="range"
                    min="0"
                    max="10000000"
                    step="100000"
                    value={filters.priceMax}
                    onChange={(e) => handlePriceChange('max', parseInt(e.target.value))}
                    className="range-slider"
                  />
                </div>
              </div>
            </div>

            <div className="filter-divider"></div>

            {/* Airlines */}
            {airlines.length > 0 && (
              <>
                <div className="filter-group">
                  <h3 className="filter-group__title">Airlines</h3>
                  <div className="filter-group__content">
                    {airlines.map(airline => (
                      <Checkbox
                        key={airline.airline_id}
                        label={airline.airline_name}
                        checked={filters.airlines.includes(airline.airline_code)}
                        onChange={() => handleFilterChange('airlines', airline.airline_code)}
                      />
                    ))}
                  </div>
                </div>
                <div className="filter-divider"></div>
              </>
            )}

            {/* Departure Time */}
            <div className="filter-group">
              <h3 className="filter-group__title">Departure Time</h3>
              <div className="filter-group__content">
                {[
                  { value: 'morning', label: 'Morning (6AM - 12PM)' },
                  { value: 'afternoon', label: 'Afternoon (12PM - 6PM)' },
                  { value: 'evening', label: 'Evening (6PM - 12AM)' },
                  { value: 'night', label: 'Night (12AM - 6AM)' }
                ].map(time => (
                  <Checkbox
                    key={time.value}
                    label={time.label}
                    checked={filters.departureTime.includes(time.value)}
                    onChange={() => handleFilterChange('departureTime', time.value)}
                  />
                ))}
              </div>
            </div>

            <div className="filter-divider"></div>

            {/* Duration */}
            <div className="filter-group">
              <h3 className="filter-group__title">Flight Duration</h3>
              <div className="filter-group__content">
                {[
                  { value: 'short', label: 'Under 2.5 hours' },
                  { value: 'medium', label: '2.5 - 4 hours' },
                  { value: 'long', label: 'Over 4 hours' }
                ].map(duration => (
                  <Checkbox
                    key={duration.value}
                    label={duration.label}
                    checked={filters.duration.includes(duration.value)}
                    onChange={() => handleFilterChange('duration', duration.value)}
                  />
                ))}
              </div>
            </div>

            <div className="filter-divider"></div>

            {/* Stops */}
            <div className="filter-group">
              <h3 className="filter-group__title">Stops</h3>
              <div className="filter-group__content">
                {[
                  { value: '0', label: 'Nonstop' },
                  { value: '1', label: '1 Stop' },
                  { value: '2', label: '2 Stops' }
                ].map(stop => (
                  <Checkbox
                    key={stop.value}
                    label={stop.label}
                    checked={filters.stops.includes(stop.value)}
                    onChange={() => handleFilterChange('stops', stop.value)}
                  />
                ))}
              </div>
            </div>

            {/* Ticket Class */}
            {flightClasses.length > 0 && (
              <>
                <div className="filter-divider"></div>
                <div className="filter-group">
                  <h3 className="filter-group__title">Ticket Class</h3>
                  <div className="filter-group__content">
                    {flightClasses.map(cls => (
                      <Checkbox
                        key={cls.class_id}
                        label={cls.class_name}
                        checked={filters.ticketClass.includes(cls.class_name)}
                        onChange={() => handleFilterChange('ticketClass', cls.class_name)}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </Card>
        </aside>

        {/* Flight List */}
        <main className="flight-list">
          {paginatedFlights.length === 0 ? (
            <Card>
              <div className="flight-list__empty">
                <h3>No Matching Flights Found</h3>
                {filteredFlights.length === 0 && flights.length > 0 ? (
                  <>
                    <p>No flights match your current filters.</p>
                    <Button onClick={() => setFilters({
                      priceMin: 0,
                      priceMax: 10000000,
                      airlines: [],
                      departureTime: [],
                      duration: [],
                      stops: [],
                      ticketClass: []
                    })}>
                      Clear Filters
                    </Button>
                  </>
                ) : (
                  <>
                    <p>No flight price data available for the selected route and date.</p>
                    <div className="empty-actions">
                      <Button 
                        variant="primary"
                        onClick={() => {
                          setError(null);
                          crawlAndRetry();
                        }}
                      >
                        Search for New Prices
                      </Button>
                      <Button 
                        variant="secondary"
                        onClick={() => navigate('/')}
                      >
                        ← Search Again
                      </Button>
                    </div>
                    <div className="empty-tips">
                      <p className="tips-title">Tips:</p>
                      <ul>
                        <li>Try searching with a different date</li>
                        <li>Check if airport codes are correct</li>
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </Card>
          ) : (
            <>
              {paginatedFlights.map((flight) => (
                <FlightCard
                  key={flight.scheduleId}
                  flight={flight}
                  formatPrice={formatPrice}
                />
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="pagination">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                  >
                    ← Previous
                  </Button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <Button
                      key={page}
                      variant={currentPage === page ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  ))}

                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(currentPage + 1)}
                  >
                    Next →
                  </Button>
                </div>
              )}
            </>
          )}
        </main>

        {/* Price Summary Sidebar */}
        <aside className="summary-sidebar">
          <Card>
            <h3 className="summary-sidebar__title">Price Summary</h3>
            <div className="summary-sidebar__content">
              <div className="summary-item">
                <span className="summary-item__label">Lowest</span>
                <span className="summary-item__value">
                  {filteredFlights.length > 0
                    ? formatPrice(Math.min(...filteredFlights.flatMap(f => f.classes.map(c => c.price))))
                    : '-'}
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-item__label">Average</span>
                <span className="summary-item__value">
                  {filteredFlights.length > 0
                    ? formatPrice(
                        Math.round(
                          filteredFlights.reduce((sum, f) => 
                            sum + Math.min(...f.classes.map(c => c.price)), 0
                          ) / filteredFlights.length
                        )
                      )
                    : '-'}
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-item__label">Highest</span>
                <span className="summary-item__value">
                  {filteredFlights.length > 0
                    ? formatPrice(Math.max(...filteredFlights.flatMap(f => f.classes.map(c => c.price))))
                    : '-'}
                </span>
              </div>
              <div className="summary-divider"></div>
              <div className="summary-item">
                <span className="summary-item__label">Results</span>
                <span className="summary-item__value">{filteredFlights.length}</span>
              </div>
              
              {/* Data Freshness Info - Only show if data is 0-6 hours old */}
              {dataFreshness && dataFreshness.oldestDataHours <= 6 && (
                <>
                  <div className="summary-divider"></div>
                  <div className="summary-item">
                    <span className="summary-item__label">Data Age</span>
                    <span className="summary-item__value" style={{ 
                      color: dataFreshness.isStale ? '#fbbf24' : '#10b981',
                      fontSize: '14px'
                    }}>
                      {dataFreshness.oldestDataHours < 1 
                        ? `${Math.round(dataFreshness.oldestDataHours * 60)}m`
                        : `${Math.round(dataFreshness.oldestDataHours)}h`}
                    </span>
                  </div>
                  <div className="summary-note" style={{
                    fontSize: '11px',
                    color: dataFreshness.isStale ? '#fbbf24' : '#94a3b8',
                    marginTop: '8px',
                    padding: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '6px',
                    lineHeight: '1.4'
                  }}>
                    {dataFreshness.isStale ? '⚠️ ' : '✓ '}{dataFreshness.message}
                  </div>
                </>
              )}
            </div>
          </Card>
        </aside>
      </div>

      {/* Edit Search Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Search"
        size="lg"
        className="modal--edit-search"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitEditForm}>
              Search Flights
            </Button>
          </>
        }
      >
        <EditSearchForm
          ref={editFormRef}
          initialData={modalData}
          onSubmit={handleSaveSearch}
          onCancel={() => setShowEditModal(false)}
        />
      </Modal>
      </div>
    </>
  );
};

// Flight Card Component
const FlightCard = ({ flight, formatPrice }) => {
  const [selectedClass, setSelectedClass] = useState(flight.classes[0]);

  return (
    <Card hoverable className="flight-card">
      <div className="flight-card__header">
        <div className="flight-card__airline">
          <div className="airline-logo">
            {flight.airline.code}
          </div>
          <div className="airline-info">
            <div className="airline-name">{flight.airline.name}</div>
          </div>
        </div>
        <div className="flight-card__price">
          <div className="price-amount">{formatPrice(selectedClass.price)}</div>
          <div className="price-label">/ người</div>
        </div>
      </div>

      <div className="flight-card__route">
        <div className="route-segment">
          <div className="route-time">{flight.departure.time}</div>
          <div className="route-code">{flight.departure.airport.code}</div>
          <div className="route-city">{flight.departure.airport.city}</div>
        </div>

        <div className="route-info">
          <div className="route-duration">{flight.duration}</div>
          <div className="route-line"></div>
          <div className="route-stops">
            {flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}
          </div>
        </div>

        <div className="route-segment">
          <div className="route-time">{flight.arrival.time}</div>
          <div className="route-code">{flight.arrival.airport.code}</div>
          <div className="route-city">{flight.arrival.airport.city}</div>
        </div>
      </div>

      <div className="flight-card__classes">
        {flight.classes.map(cls => (
          <Badge
            key={cls.classId}
            variant={selectedClass.classId === cls.classId ? 'primary' : 'default'}
            className="class-badge"
            onClick={() => setSelectedClass(cls)}
            style={{ cursor: 'pointer' }}
          >
            {cls.className}: {formatPrice(cls.price)}
          </Badge>
        ))}
      </div>

      <div className="flight-card__footer">
        <div className="flight-card__badges">
          {flight.stops === 0 && (
            <Badge variant="info" size="sm">Nonstop</Badge>
          )}
        </div>
        <Button size="sm">
          Select Flight
        </Button>
      </div>
    </Card>
  );
};

export default SearchResults;

