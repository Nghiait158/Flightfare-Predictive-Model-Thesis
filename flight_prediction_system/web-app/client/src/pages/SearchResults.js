import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './SearchResults.css';
import Header from '../components/layout/header';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import Select from '../components/common/Select';
import Checkbox from '../components/common/Checkbox';
import EditSearchForm from '../components/form/EditSearchForm';
import flightService from '../services/flightService';
import crawlerService from '../services/crawlerService';
import MLAnalysisModal from '../components/common/MLAnalysisModal';
import EmailSubscriptionModal from '../components/common/EmailSubscriptionModal';

// Helper function to normalize time format
const normalizeTimeFormat = (timeStr) => {
  if (!timeStr) return '';

  // Remove any existing seconds
  const timeParts = timeStr.split(':');

  // If already has format HH:MM, return as is
  if (timeParts.length === 2) {
    return timeStr;
  }

  // If has seconds (HH:MM:SS), remove them
  if (timeParts.length === 3) {
    return `${timeParts[0]}:${timeParts[1]}`;
  }

  return timeStr;
};

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

  // Actual price range from flight data (for slider bounds)
  // eslint-disable-next-line no-unused-vars
  const [actualPriceRange, setActualPriceRange] = useState({
    min: 0,
    max: 10000000
  });

  const [sortBy, setSortBy] = useState('recommended');
  // eslint-disable-next-line no-unused-vars
  const [viewMode, setViewMode] = useState('list');
  const [showEditModal, setShowEditModal] = useState(false);
  const [modalData, setModalData] = useState(initialSearchParams);
  const [currentPage, setCurrentPage] = useState(1);
  const [airlines, setAirlines] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [flightClasses, setFlightClasses] = useState([]);
  const [dataFreshness, setDataFreshness] = useState(null);
  const [nearbyDatePrices, setNearbyDatePrices] = useState([]);
  const [loadingNearbyPrices, setLoadingNearbyPrices] = useState(false);
  const [isNearbyDateClick, setIsNearbyDateClick] = useState(false);
  const [searchMode, setSearchMode] = useState('normal');

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
        // Skip auto-crawl if this is from nearby date click (we know there's data)
        const shouldSkipCrawl = skipCrawl || isNearbyDateClick;
        if (response.data.flights.length === 0 && !shouldSkipCrawl) {
          // No flights found - trigger automatic crawl
          console.log('No flights found in database, triggering automatic crawl...');
          const crawlSuccess = await crawlAndRetry();
          if (crawlSuccess) {
            // Recursively fetch again with skipCrawl = true
            return fetchFlights(true);
          }
          return; // Exit early if crawl failed
        }
        
        // Reset nearby date click flag
        if (isNearbyDateClick) {
          setIsNearbyDateClick(false);
        }

        // Check if data is too old (> 6 hours) and auto-crawl
        // But also check if we have just crawled (to avoid re-crawling immediately)
        const AUTO_CRAWL_THRESHOLD = 6; // hours
        
        console.log(`🔍 Checking data freshness:`, {
          newestDataHours: response.data.dataFreshness?.newestDataHours,
          oldestDataHours: response.data.dataFreshness?.oldestDataHours,
          isStale: response.data.dataFreshness?.isStale,
          threshold: AUTO_CRAWL_THRESHOLD,
          skipCrawl: skipCrawl,
          flightCount: response.data.flights.length
        });
        
        // Backend already checks if data is truly stale (considers if ANY data is fresh)
        // Only auto-crawl if backend says data is stale AND we haven't just crawled
        if (response.data.dataFreshness?.isStale && !skipCrawl && response.data.flights.length > 0) {
          console.log(`⚠️ Data is stale (newest: ${response.data.dataFreshness.newestDataHours}h, oldest: ${response.data.dataFreshness.oldestDataHours}h), triggering automatic crawl...`);
          const crawlSuccess = await crawlAndRetry();
          if (crawlSuccess) {
            // Recursively fetch again with skipCrawl = true
            return fetchFlights(true);
          }
          return; // Exit early if crawl failed
        }

        // If data is not stale, it means we have fresh data (< 1 hour)
        if (!response.data.dataFreshness?.isStale && response.data.flights.length > 0) {
          console.log(`✅ Data is fresh (newest: ${response.data.dataFreshness?.newestDataHours}h), showing results directly`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Group flights by airline with all departure times
  const groupedFlights = useMemo(() => {
    const grouped = new Map();
    
    filteredFlights.forEach(flight => {
      const airlineCode = flight.airline.code;
      
      if (!grouped.has(airlineCode)) {
        grouped.set(airlineCode, {
          airline: flight.airline,
          departureTimes: [],
          minPrice: Infinity,
          currency: 'VND'
        });
      }
      
      const group = grouped.get(airlineCode);
      
      // Add departure time with flight info
      group.departureTimes.push({
        time: flight.departure.time,
        duration: flight.duration,
        arrival: flight.arrival,
        classes: flight.classes,
        scheduleId: flight.scheduleId,
        stops: flight.stops,
        aircraft: flight.aircraft || flight.planeType || '',  // Include aircraft type
        flightNumber: flight.flightNumber || flight.scheduleId  // Include actual flight number
      });
      
      // Track minimum price
      const flightMinPrice = Math.min(...flight.classes.map(c => c.price));
      if (flightMinPrice < group.minPrice) {
        group.minPrice = flightMinPrice;
        group.currency = flight.classes[0].currency;
      }
    });
    
    // Sort departure times within each airline
    grouped.forEach(group => {
      group.departureTimes.sort((a, b) => {
        const timeA = a.time.split(':').map(Number);
        const timeB = b.time.split(':').map(Number);
        return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
      });
    });
    
    // Convert to array and sort by min price
    return Array.from(grouped.values()).sort((a, b) => a.minPrice - b.minPrice);
  }, [filteredFlights]);

  // AI-powered recommendations: Cheapest, Fastest, Optimal
  const recommendations = useMemo(() => {
    if (filteredFlights.length === 0) return null;

    // Find cheapest flight
    const cheapest = filteredFlights.reduce((min, flight) => {
      const flightMinPrice = Math.min(...flight.classes.map(c => c.price));
      const currentMinPrice = Math.min(...min.classes.map(c => c.price));
      return flightMinPrice < currentMinPrice ? flight : min;
    });

    // Find fastest flight (shortest duration)
    const fastest = filteredFlights.reduce((min, flight) => 
      flight.durationMinutes < min.durationMinutes ? flight : min
    );

    // Find optimal flight (best balance: 40% price + 30% time + 30% duration)
    const optimal = filteredFlights.reduce((best, flight) => {
      const flightMinPrice = Math.min(...flight.classes.map(c => c.price));
      const bestMinPrice = Math.min(...best.classes.map(c => c.price));
      
      // Normalize scores (0-1)
      const priceRange = Math.max(...filteredFlights.map(f => Math.min(...f.classes.map(c => c.price)))) - 
                        Math.min(...filteredFlights.map(f => Math.min(...f.classes.map(c => c.price))));
      const durationRange = Math.max(...filteredFlights.map(f => f.durationMinutes)) - 
                           Math.min(...filteredFlights.map(f => f.durationMinutes));
      
      const priceScore = priceRange > 0 ? 1 - (flightMinPrice - Math.min(...filteredFlights.map(f => Math.min(...f.classes.map(c => c.price))))) / priceRange : 0.5;
      const durationScore = durationRange > 0 ? 1 - (flight.durationMinutes - Math.min(...filteredFlights.map(f => f.durationMinutes))) / durationRange : 0.5;
      
      // Departure time score (prefer morning/afternoon)
      const hour = parseInt(flight.departure.time.split(':')[0]);
      const timeScore = (hour >= 6 && hour <= 18) ? 1 : 0.5;
      
      const flightScore = (priceScore * 0.4) + (timeScore * 0.3) + (durationScore * 0.3);
      
      const bestPriceScore = priceRange > 0 ? 1 - (bestMinPrice - Math.min(...filteredFlights.map(f => Math.min(...f.classes.map(c => c.price))))) / priceRange : 0.5;
      const bestDurationScore = durationRange > 0 ? 1 - (best.durationMinutes - Math.min(...filteredFlights.map(f => f.durationMinutes))) / durationRange : 0.5;
      const bestHour = parseInt(best.departure.time.split(':')[0]);
      const bestTimeScore = (bestHour >= 6 && bestHour <= 18) ? 1 : 0.5;
      const bestScore = (bestPriceScore * 0.4) + (bestTimeScore * 0.3) + (bestDurationScore * 0.3);
      
      return flightScore > bestScore ? flight : best;
    });

    return { cheapest, fastest, optimal };
  }, [filteredFlights]);

  // Pagination
  // eslint-disable-next-line no-unused-vars
  const totalPages = Math.ceil(filteredFlights.length / itemsPerPage);
  // eslint-disable-next-line no-unused-vars
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
    setFilters(prev => {
      const newValue = parseInt(value);
      
      // Validate: min cannot be greater than max, and vice versa
      if (minOrMax === 'min') {
        return {
          ...prev,
          priceMin: Math.min(newValue, prev.priceMax - 100000) // Keep 100k gap minimum
        };
      } else {
        return {
          ...prev,
          priceMax: Math.max(newValue, prev.priceMin + 100000) // Keep 100k gap minimum
        };
      }
    });
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
    // Parse date string safely to avoid timezone issues
    // If dateString is in YYYY-MM-DD format, parse it as local date
    let date;
    if (dateString && typeof dateString === 'string' && dateString.includes('-')) {
      const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
      date = new Date(year, month - 1, day);
    } else {
      date = new Date(dateString);
    }
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDateShort = (dateString) => {
    // Parse date string safely to avoid timezone issues
    // If dateString is in YYYY-MM-DD format, parse it as local date
    let date;
    if (dateString && typeof dateString === 'string' && dateString.includes('-')) {
      const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
      date = new Date(year, month - 1, day);
    } else {
      date = new Date(dateString);
    }
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return {
      day: days[date.getDay()],
      date: date.getDate(),
      month: months[date.getMonth()]
    };
  };

  // Generate nearby dates (3 days before and 3 days after)
  const generateNearbyDates = useMemo(() => {
    const dates = [];
    // Parse date string safely to avoid timezone issues
    let currentDate;
    if (searchParams.departDate && typeof searchParams.departDate === 'string' && searchParams.departDate.includes('-')) {
      const [year, month, day] = searchParams.departDate.split('T')[0].split('-').map(Number);
      currentDate = new Date(year, month - 1, day);
    } else {
      currentDate = new Date(searchParams.departDate);
    }
    
    for (let i = -3; i <= 3; i++) {
      const date = new Date(currentDate);
      date.setDate(currentDate.getDate() + i);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      dates.push({
        date: `${year}-${month}-${day}`,
        isSelected: i === 0
      });
    }
    
    return dates;
  }, [searchParams.departDate]);

  // Fetch prices for nearby dates (only fresh data)
  useEffect(() => {
    const fetchNearbyPrices = async () => {
      if (flights.length === 0 || generateNearbyDates.length === 0) {
        setNearbyDatePrices([]);
        setLoadingNearbyPrices(false);
        return;
      }

      setLoadingNearbyPrices(true);

      try {
        // Step 1: Get cheapest price from current search results (today's selected date)
        const prices = flights.flatMap(f => f.classes.map(c => c.price));
        const selectedDatePrice = prices.length > 0 ? Math.min(...prices) : null;

        if (!selectedDatePrice) {
          setNearbyDatePrices([]);
          setLoadingNearbyPrices(false);
          return;
        }

        // Step 2: Get prices for OTHER nearby dates (exclude selected date)
        const datesToFetch = generateNearbyDates
          .filter(d => !d.isSelected)
          .map(d => d.date);

        // Fetch prices for nearby dates
        const response = await flightService.getNearbyDatePrices(
          searchParams.from,
          searchParams.to,
          datesToFetch
        );

        if (response.success) {
          const pricesData = response.data.prices;
          
          console.log(`\n📊 Nearby Dates Comparison`);
          console.log(`   Base (selected date): ${selectedDatePrice.toLocaleString()}đ`);
          
          // Step 3: Calculate price differences
          const pricesByDate = generateNearbyDates.map(dateInfo => {
            // Selected date
            if (dateInfo.isSelected) {
              return {
                ...dateInfo,
                price: selectedDatePrice,
                priceDiff: 0,
                isFresh: true
              };
            }

            // Other nearby dates
            const datePrice = pricesData[dateInfo.date];
            
            if (datePrice && datePrice.isFresh) {
              const diff = datePrice.minPrice - selectedDatePrice;
              console.log(`   ${dateInfo.date}: ${datePrice.minPrice.toLocaleString()}đ → ${diff >= 0 ? '+' : ''}${diff.toLocaleString()}đ`);
              
              return {
                ...dateInfo,
                price: datePrice.minPrice,
                priceDiff: diff,
                isFresh: true,
                hoursOld: datePrice.hoursOld
              };
            }

            // No fresh data for this date
            return null;
          }).filter(item => item !== null);

          setNearbyDatePrices(pricesByDate);
        }
      } catch (error) {
        console.error('Error fetching nearby date prices:', error);
        // Fallback: show only selected date
        const prices = flights.flatMap(f => f.classes.map(c => c.price));
        const selectedDatePrice = prices.length > 0 ? Math.min(...prices) : null;
        
        if (selectedDatePrice) {
          setNearbyDatePrices([{
            date: searchParams.departDate,
            isSelected: true,
            price: selectedDatePrice,
            priceDiff: 0,
            isFresh: true
          }]);
        }
      } finally {
        setLoadingNearbyPrices(false);
      }
    };

    fetchNearbyPrices();
  }, [flights, generateNearbyDates, searchParams.from, searchParams.to, searchParams.departDate]);

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
            <div className="search-results__header-top">
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
            <Select
              value={searchMode}
              onChange={(e) => setSearchMode(e.target.value)}
              options={[
                { value: 'normal', label: 'Normal Search' },
                { value: 'smart', label: 'Smart Search' }
              ]}
            />
          </div>
            </div>

            {/* Nearby Dates Price Selector */}
            {(nearbyDatePrices.length > 0 || loadingNearbyPrices) && (
              <div className="nearby-dates">
                <div className="nearby-dates__label">
                  <span className="nearby-dates__icon">📅</span>
                  <span>Prices for nearby dates</span>
                  {/* {nearbyDatePrices.length === 1 && !loadingNearbyPrices && (
                    <span className="nearby-dates__info">(Only fresh data shown)</span>
                  )} */}
                </div>
                {loadingNearbyPrices ? (
                  <div className="nearby-dates__loading">
                    <div className="spinner-small"></div>
                    <span>Loading prices...</span>
                  </div>
                ) : (
                <div className="nearby-dates__list">
                {nearbyDatePrices.map((dateInfo) => {
                  const formatted = formatDateShort(dateInfo.date);
                  const isSelected = dateInfo.isSelected;
                  const priceDiff = dateInfo.priceDiff || 0;
                  
                  // Format price difference
                  let priceDisplay = '';
                  if (isSelected) {
                    priceDisplay = formatPrice(dateInfo.price);
                  } else if (Math.abs(priceDiff) < 10000) {
                    // Less than 10k difference, consider it same price
                    priceDisplay = '≈ Same';
                  } else if (priceDiff > 0) {
                    // Format without VND symbol for cleaner look
                    const diffAmount = new Intl.NumberFormat('vi-VN').format(Math.abs(priceDiff));
                    priceDisplay = `+${diffAmount}đ`;
                  } else {
                    const diffAmount = new Intl.NumberFormat('vi-VN').format(Math.abs(priceDiff));
                    priceDisplay = `-${diffAmount}đ`;
                  }
                  
                  return (
                    <button
                      key={dateInfo.date}
                      className={`nearby-date-item ${isSelected ? 'nearby-date-item--selected' : ''} ${priceDiff < 0 ? 'nearby-date-item--cheaper' : ''} ${priceDiff > 0 ? 'nearby-date-item--expensive' : ''}`}
                      onClick={() => {
                        if (!isSelected) {
                          // Set flag to indicate this is a nearby date click
                          // This prevents auto-crawl since we know this date has data
                          setIsNearbyDateClick(true);
                          const newParams = {
                            ...searchParams,
                            departDate: dateInfo.date
                          };
                          setSearchParams(newParams);
                          setCurrentPage(1);
                        }
                      }}
                      disabled={isSelected}
                    >
                      <div className="nearby-date-item__price">
                        {priceDisplay}
                      </div>
                      <div className="nearby-date-item__day">{formatted.day}</div>
                      <div className="nearby-date-item__date">
                        {formatted.month} {formatted.date}
                      </div>
                    </button>
                  );
                })}
                </div>
                )}
              </div>
            )}
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

            {/* Sort By */}
            <div className="filter-group">
              <h3 className="filter-group__title">Sort By</h3>
              <div className="filter-group__content">
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

            <div className="filter-divider"></div>

            {/* Price Range - Dual Range Slider */}
            <div className="filter-group">
              <h3 className="filter-group__title">Price Range</h3>
              <div className="filter-group__content">
                <div className="price-range-dual">
                  {/* Price labels */}
                  <div className="price-range-dual__labels">
                    <span className="price-label price-label--min">
                      {formatPrice(filters.priceMin)}
                    </span>
                    <span className="price-label price-label--max">
                      {formatPrice(filters.priceMax)}
                    </span>
                  </div>

                  {/* Dual range slider container */}
                  <div className="dual-range-slider">
                    {/* Track background */}
                    <div className="dual-range-slider__track">
                      {/* Highlighted range between min and max */}
                      <div 
                        className="dual-range-slider__range"
                        style={{
                          left: `${((filters.priceMin - actualPriceRange.min) / (actualPriceRange.max - actualPriceRange.min)) * 100}%`,
                          right: `${100 - ((filters.priceMax - actualPriceRange.min) / (actualPriceRange.max - actualPriceRange.min)) * 100}%`
                        }}
                      />
                    </div>

                    {/* Min range input */}
                    <input
                      type="range"
                      min={actualPriceRange.min}
                      max={actualPriceRange.max}
                      step="100000"
                      value={filters.priceMin}
                      onChange={(e) => handlePriceChange('min', e.target.value)}
                      className="dual-range-slider__input dual-range-slider__input--min"
                      aria-label="Minimum price"
                    />

                    {/* Max range input */}
                    <input
                      type="range"
                      min={actualPriceRange.min}
                      max={actualPriceRange.max}
                      step="100000"
                      value={filters.priceMax}
                      onChange={(e) => handlePriceChange('max', e.target.value)}
                      className="dual-range-slider__input dual-range-slider__input--max"
                      aria-label="Maximum price"
                    />
                  </div>

                  {/* Min/Max bounds display */}
                  <div className="price-range-dual__bounds">
                    <span>{formatPrice(actualPriceRange.min)}</span>
                    <span>{formatPrice(actualPriceRange.max)}</span>
                  </div>
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

            {/* <div className="filter-divider"></div> */}

            {/* Duration */}
            {/* <div className="filter-group">
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
            </div> */}

            {/* <div className="filter-divider"></div> */}

            {/* Stops */}
            {/* <div className="filter-group">
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
            </div> */}

            {/* Ticket Class */}
            {/* {flightClasses.length > 0 && (
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
            )} */}
          </Card>
        </aside>

        {/* Flight List */}
        <main className="flight-list">
          {groupedFlights.length === 0 ? (
            <Card>
              <div className="flight-list__empty">
                <h3>No Matching Flights Found</h3>
                {filteredFlights.length === 0 && flights.length > 0 ? (
                  <>
                    <p>No flights match your current filters.</p>
                    <Button onClick={() => setFilters({
                      priceMin: actualPriceRange.min,
                      priceMax: actualPriceRange.max,
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
            <div className="flights-grouped">
              <div className="flights-grouped__header">
                <h3>Direct flights</h3>
                <span className="flights-grouped__count">
                  {groupedFlights.length} airline{groupedFlights.length !== 1 ? 's' : ''} • {filteredFlights.length} flight{filteredFlights.length !== 1 ? 's' : ''}
                </span>
              </div>

              {groupedFlights.map((airlineGroup) => (
                <AirlineFlightCard
                  key={airlineGroup.airline.code}
                  airlineGroup={airlineGroup}
                  formatPrice={formatPrice}
                  searchParams={searchParams}
                />
              ))}
            </div>
          )}

          {/* AI-Powered Recommendations */}
          {recommendations && filteredFlights.length > 0 && (
            <div className="recommendations-section">
              {/* <h3 className="recommendations-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
                AI Recommendations
              </h3> */}
              <div className="recommendations-grid">
                <RecommendationCard
                  type="optimal"
                  flight={recommendations.optimal}
                  formatPrice={formatPrice}
                  title="Best Value"
                  description="Optimal balance of price, time, and duration"
                />
                <RecommendationCard
                  type="cheapest"
                  flight={recommendations.cheapest}
                  formatPrice={formatPrice}
                  title="Cheapest"
                  description="Lowest price available"
                />
                <RecommendationCard
                  type="fastest"
                  flight={recommendations.fastest}
                  formatPrice={formatPrice}
                  title="Fastest"
                  description="Shortest flight duration"
                />
              </div>
            </div>
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

// Airline Flight Card Component - Grouped by airline
const AirlineFlightCard = ({ airlineGroup, formatPrice, searchParams }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);
  const [mlFlightData, setMlFlightData] = useState(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSubscriptionData, setEmailSubscriptionData] = useState(null);
  const timesScrollRef = useRef(null);

  const formatTime = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')}${period}`;
  };

  const scrollTimes = (direction) => {
    if (timesScrollRef.current) {
      const scrollAmount = 200; // pixels to scroll
      const newScrollLeft = timesScrollRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
      timesScrollRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="airline-flight-card">
      <div className="airline-flight-card__main">
        {/* Top Row: Airline Info and Price */}
        <div className="airline-flight-card__header">
          <div className="airline-flight-card__airline">
            <div className="airline-logo-compact">
              {airlineGroup.airline.code}
            </div>
            <div className="airline-name-compact">
              {airlineGroup.airline.name}
            </div>
          </div>

          <div className="airline-flight-card__price">
            <span className="price-from">from</span>
            <span className="price-value">{formatPrice(airlineGroup.minPrice)}</span>
            <svg 
              className="price-arrow" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        </div>

        {/* Bottom Row: Departure Times with Scroll Buttons */}
        <div className="airline-flight-card__times-container">
          <button 
            className="times-scroll-btn times-scroll-btn--left"
            onClick={() => scrollTimes('left')}
            aria-label="Scroll left"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>

          <div className="airline-flight-card__times" ref={timesScrollRef}>
            {airlineGroup.departureTimes.map((timeSlot, index) => (
              <button
                key={index}
                className={`time-button ${selectedTime === index ? 'time-button--selected' : ''}`}
                onClick={() => {
                  setSelectedTime(selectedTime === index ? null : index);
                  setShowDetails(!showDetails || selectedTime !== index);
                }}
              >
                {formatTime(timeSlot.time)}
              </button>
            ))}
          </div>

          <button 
            className="times-scroll-btn times-scroll-btn--right"
            onClick={() => scrollTimes('right')}
            aria-label="Scroll right"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {showDetails && selectedTime !== null && (
        <div className="airline-flight-card__details">
          <div className="flight-details">
            <div className="flight-details__duration">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M2 12h20"/>
              </svg>
              <span>{airlineGroup.departureTimes[selectedTime].duration}</span>
            </div>

            <div className="flight-details__route">
              <span>Arrives {formatTime(airlineGroup.departureTimes[selectedTime].arrival.time)}</span>
              <span className="separator">•</span>
              <span>
                {airlineGroup.departureTimes[selectedTime].stops === 0 
                  ? 'Nonstop' 
                  : `${airlineGroup.departureTimes[selectedTime].stops} stop(s)`
                }
              </span>
            </div>

            <div className="flight-details__classes">
              {airlineGroup.departureTimes[selectedTime].classes.map((cls, idx) => (
                <div 
                  key={idx} 
                  className={`class-option ${selectedClass === idx ? 'class-option--selected' : ''}`}
                  onClick={() => {
                    console.log('📦 Class clicked:', idx, cls.className);
                    console.log('Current selectedClass:', selectedClass);
                    setSelectedClass(idx);
                    console.log('After setSelectedClass, selectedClass should be:', idx);
                  }}
                >
                  <span className="class-name">{cls.className}</span>
                  <span className="class-price">{formatPrice(cls.price)}</span>
                </div>
              ))}
            </div>

            <Button
              size="sm"
              variant="primary"
              className="details-button"
              onClick={(e) => {
                // Test log đơn giản nhất - nếu không thấy log này nghĩa là onClick không chạy
                console.log('BUTTON CLICKED!!!');
                console.log('Event:', e);
                console.log('Selected Class:', selectedClass);
                console.log('Selected Time:', selectedTime);
                console.log('Button Disabled?', selectedClass === null);
                
                // Log ngay đầu hàm để đảm bảo onClick được trigger
                console.log('🔘 BUTTON CLICKED - Analyze Flight button pressed');
                console.log('Selected Class:', selectedClass);
                console.log('Selected Time:', selectedTime);
                console.log('Button Disabled?', selectedClass === null);
                
                if (selectedClass !== null && selectedTime !== null) {
                  console.log('✅ Conditions met, proceeding with data preparation...');

                  const timeSlot = airlineGroup.departureTimes[selectedTime];
                  const classInfo = timeSlot.classes[selectedClass];

                  // Prepare flight data for ML API
                  // FIXED: Get actual data from selected flight

                  // Normalize times to HH:MM format (remove seconds if present)
                  const departureTime = normalizeTimeFormat(timeSlot.time);
                  const arrivalTime = normalizeTimeFormat(timeSlot.arrival?.time || '');

                  // Get flight number - ensure it's a string, not a number
                  let flightNumber = '';
                  if (timeSlot.flightNumber) {
                    flightNumber = String(timeSlot.flightNumber);
                  } else if (timeSlot.scheduleId) {
                    flightNumber = String(timeSlot.scheduleId);
                  } else {
                    // Fallback: create from airline code
                    flightNumber = `${airlineGroup.airline.code}${String(selectedTime).padStart(3, '0')}`;
                  }

                  const flightData = {
                    flight_number: flightNumber,  // Ensure string flight number
                    departure_airport: searchParams.from,
                    arrival_airport: searchParams.to,
                    flight_date: searchParams.departDate,
                    departure_time: departureTime,  // Normalized to HH:MM format
                    arrival_time: arrivalTime,  // Normalized to HH:MM format
                    classes: classInfo.className,  // Actual class name from selection
                    current_price: classInfo.price,  // FIXED: Get actual price from selected class
                    type_of_plane: timeSlot.aircraft || ''  // Get aircraft type if available
                  };

                  // Log data being sent to ML API
                  console.log('========================================');
                  console.log('📤 SENDING DATA TO ML API');
                  console.log('========================================');
                  console.log('🔍 DEBUG - Raw Data Sources:');
                  console.log('  timeSlot.flightNumber:', timeSlot.flightNumber, '(type:', typeof timeSlot.flightNumber + ')');
                  console.log('  timeSlot.scheduleId:', timeSlot.scheduleId, '(type:', typeof timeSlot.scheduleId + ')');
                  console.log('  timeSlot.time (raw):', timeSlot.time);
                  console.log('  timeSlot.arrival.time (raw):', timeSlot.arrival?.time);
                  console.log('  classInfo.className:', classInfo.className);
                  console.log('  classInfo.price:', classInfo.price);
                  console.log('  timeSlot.aircraft:', timeSlot.aircraft);
                  console.log('\n📦 Processed Flight Data:');
                  console.log('Flight Data Object:', flightData);
                  console.log('  Flight Number:', flightData.flight_number, '(type:', typeof flightData.flight_number + ')');
                  console.log('  Route:', `${flightData.departure_airport} → ${flightData.arrival_airport}`);
                  console.log('  Flight Date:', flightData.flight_date);
                  console.log('  Departure Time:', flightData.departure_time, '(normalized)');
                  console.log('  Arrival Time:', flightData.arrival_time, '(normalized)');
                  console.log('  Class:', flightData.classes);
                  console.log('  Current Price:', flightData.current_price, 'VND');
                  console.log('  Type of Plane:', flightData.type_of_plane || '(empty)');
                  console.log('\n📋 Full JSON to be sent:');
                  console.log(JSON.stringify(flightData, null, 2));
                  console.log('========================================');

                  setMlFlightData(flightData);
                  setShowAnalyzeModal(true);
                  
                  console.log('✅ State updated: mlFlightData set, showAnalyzeModal = true');
                } else {
                  console.warn('⚠️ Button clicked but conditions not met:');
                  console.warn('  - selectedClass:', selectedClass);
                  console.warn('  - selectedTime:', selectedTime);
                  console.warn('  - Both must be non-null to proceed');
                }
              }}
              disabled={selectedClass === null}
            >
              Analyze Flight {selectedClass === null ? '(Select a class first)' : ''}
            </Button>

            <Button
              variant="secondary"
              onClick={() => {
                console.log('📧 Email button clicked');
                console.log('Selected class index:', selectedClass);
                console.log('Selected time index:', selectedTime);
                console.log('Search params:', searchParams);

                // selectedClass is an index, we need to get the actual class name
                if (selectedClass !== null && selectedClass !== undefined && selectedTime !== null) {
                  const selectedTimeSlot = airlineGroup.departureTimes[selectedTime];

                  if (selectedTimeSlot && selectedTimeSlot.classes && selectedTimeSlot.classes[selectedClass]) {
                    const actualClassName = selectedTimeSlot.classes[selectedClass].className;

                    const subscriptionData = {
                      departureCode: searchParams.from,
                      arrivalCode: searchParams.to,
                      departureDate: searchParams.departDate,
                      className: actualClassName  // Now we have the actual class name (e.g., "Eco", "Deluxe")
                    };

                    console.log('Opening email modal with data:', subscriptionData);
                    setEmailSubscriptionData(subscriptionData);
                    setShowEmailModal(true);
                  } else {
                    console.error('Could not find class data');
                  }
                } else {
                  console.warn('Please select both time and class first');
                }
              }}
              disabled={selectedClass === null || selectedTime === null}
            >
              📧 Nhận thông báo {(selectedClass === null || selectedTime === null) ? '(Select time & class first)' : ''}
            </Button>
          </div>
        </div>
      )}

      {/* ML Analysis Modal */}
      <MLAnalysisModal
        isOpen={showAnalyzeModal}
        onClose={() => setShowAnalyzeModal(false)}
        flightData={mlFlightData}
        searchParams={searchParams}
      />

      {/* Email Subscription Modal */}
      <EmailSubscriptionModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        flightData={emailSubscriptionData}
      />
    </div>
  );
};

// Recommendation Card Component
const RecommendationCard = ({ type, flight, formatPrice, title, description }) => {
  const minPrice = Math.min(...flight.classes.map(c => c.price));
  
  const typeConfig = {
    optimal: {
      icon: '',
      gradient: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
      badgeColor: '#8b5cf6'
    },
    cheapest: {
      icon: '',
      gradient: 'linear-gradient(135deg, #10b981, #059669)',
      badgeColor: '#10b981'
    },
    fastest: {
      icon: '',
      gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
      badgeColor: '#f59e0b'
    }
  };

  const config = typeConfig[type];

  return (
    <div className="recommendation-card" style={{ background: config.gradient }}>
      <div className="recommendation-card__header">
        <div className="recommendation-badge">
          <span className="recommendation-badge__icon">{config.icon}</span>
          <span className="recommendation-badge__title">{title}</span>
        </div>
        <div className="recommendation-price">{formatPrice(minPrice)}</div>
      </div>

      <p className="recommendation-description">{description}</p>

      <div className="recommendation-card__details">
        <div className="recommendation-detail">
          <span className="recommendation-detail__label">Airline</span>
          <span className="recommendation-detail__value">{flight.airline.name}</span>
        </div>
        <div className="recommendation-detail">
          <span className="recommendation-detail__label">Departure</span>
          <span className="recommendation-detail__value">{flight.departure.time}</span>
        </div>
        <div className="recommendation-detail">
          <span className="recommendation-detail__label">Duration</span>
          <span className="recommendation-detail__value">{flight.duration}</span>
        </div>
      </div>

      <Button 
        variant="primary" 
        size="sm" 
        className="recommendation-button"
        style={{ 
          background: 'rgba(255, 255, 255, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          color: 'white'
        }}
      >
        Select Flight
      </Button>
    </div>
  );
};

export default SearchResults;

