import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './SearchResults.css';
import Header from '../components/layout/header';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import Select from '../components/common/Select';
import Checkbox from '../components/common/Checkbox';
import flightService from '../services/flightService';
import crawlerService from '../services/crawlerService';

// Debug: Log crawler URL on component mount
console.log('🔧 SearchResults: REACT_APP_CRAWLER_URL =', process.env.REACT_APP_CRAWLER_URL);

const SearchResults = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Get search params from navigation state or URL
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

  const itemsPerPage = 10;

  const crawlAndRetry = useCallback(async () => {
    try {
      setCrawling(true);
      setCrawlMessage('Không tìm thấy giá vé trong database. Đang tìm kiếm giá vé mới nhất...');
      
      console.log('🚀 Starting automatic crawl...');
      console.log('🔍 Search params:', searchParams);
      console.log('🌐 Crawler URL:', process.env.REACT_APP_CRAWLER_URL || 'http://localhost:3000/api/crawl');
      
      // Crawl flight data
      const crawlResult = await crawlerService.smartCrawl(searchParams);
      
      if (crawlResult.success) {
        console.log('✅ Crawl successful, fetching flights again...');
        setCrawlMessage('Đã tìm thấy giá vé! Đang tải dữ liệu...');
        
        // Wait a bit for database to be updated
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Will trigger re-fetch via return value
        return true;
      } else {
        throw new Error('Crawl failed');
      }
    } catch (err) {
      console.error('❌ Crawl error:', err);
      
      // More user-friendly error with suggestions
      let errorMessage = 'Không thể tìm kiếm giá vé mới. ';
      
      if (err.message.includes('Network Error') || err.code === 'ECONNREFUSED') {
        errorMessage += 'Không thể kết nối tới crawler server. Vui lòng kiểm tra xem crawler server có đang chạy không (port 3000).';
      } else if (err.message.includes('timeout')) {
        errorMessage += 'Quá trình tìm kiếm mất quá nhiều thời gian. Vui lòng thử lại.';
      } else {
        errorMessage += 'Vui lòng thử lại sau hoặc chọn ngày khác.';
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
        // Check if we got any flights
        if (response.data.flights.length === 0 && !skipCrawl) {
          // No flights found - trigger automatic crawl
          console.log('⚠️ No flights found in database, triggering automatic crawl...');
          const crawlSuccess = await crawlAndRetry();
          if (crawlSuccess) {
            // Recursively fetch again with skipCrawl = true
            return fetchFlights(true);
          }
          return; // Exit early if crawl failed
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

  const handleSaveSearch = () => {
    setSearchParams(modalData);
    setShowEditModal(false);
    setCurrentPage(1);
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
            <p>{crawlMessage || 'Đang tìm kiếm chuyến bay...'}</p>
            {crawling && (
              <div className="crawl-info">
                <p className="crawl-info__note">
                  ⏱️ Quá trình này có thể mất 30-60 giây
                </p>
                <p className="crawl-info__detail">
                  Đang thu thập giá vé mới nhất từ các hãng hàng không...
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
          <h2>❌ Có lỗi xảy ra</h2>
          <p>{error}</p>
          <div className="error-actions">
            <Button variant="secondary" onClick={() => {
              setError(null);
              fetchFlights(true); // Try again without crawl
            }}>
              🔄 Thử lại
            </Button>
            <Button onClick={() => navigate('/')}>
              ← Quay về trang chủ
            </Button>
          </div>
          
          {/* Troubleshooting tips */}
          <div className="error-tips">
            <h3> Gợi ý khắc phục:</h3>
            <ul>
              <li>Thử tìm kiếm với ngày khác</li>
              <li>Kiểm tra kết nối internet</li>
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
                {searchParams.adults} Người lớn
                {searchParams.children > 0 && `, ${searchParams.children} Trẻ em`}
                {searchParams.infants > 0 && `, ${searchParams.infants} Em bé`}
              </span>
            </div>
            <Button size="sm" onClick={handleEditSearch}>
              Chỉnh sửa
            </Button>
          </div>

          <div className="search-controls">
            <div className="view-toggle">
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
            </div>

            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              options={[
                { value: 'recommended', label: '✨ Đề xuất' },
                { value: 'price-low', label: '💰 Giá tăng dần' },
                { value: 'price-high', label: '💰 Giá giảm dần' },
                { value: 'duration', label: '⏱️ Thời gian bay' },
                { value: 'departure-early', label: '🕐 Khởi hành sớm nhất' },
                { value: 'departure-late', label: '🕐 Khởi hành muộn nhất' }
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
              <span>Trang chủ</span>
              <span>›</span>
              <span>Kết quả</span>
              <span>›</span>
              <span>{searchParams.from} → {searchParams.to}</span>
            </div>

            <div className="filters-sidebar__count">
              <span>{filteredFlights.length} chuyến bay</span>
            </div>

            {/* Price Range */}
            <div className="filter-group">
              <h3 className="filter-group__title">💰 Khoảng giá</h3>
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
                  <h3 className="filter-group__title">✈️ Hãng hàng không</h3>
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
              <h3 className="filter-group__title">🕐 Giờ khởi hành</h3>
              <div className="filter-group__content">
                {[
                  { value: 'morning', label: 'Sáng (6h - 12h)' },
                  { value: 'afternoon', label: 'Chiều (12h - 18h)' },
                  { value: 'evening', label: 'Tối (18h - 24h)' },
                  { value: 'night', label: 'Đêm (0h - 6h)' }
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
              <h3 className="filter-group__title">⏱️ Thời gian bay</h3>
              <div className="filter-group__content">
                {[
                  { value: 'short', label: 'Dưới 2.5 giờ' },
                  { value: 'medium', label: '2.5 - 4 giờ' },
                  { value: 'long', label: 'Trên 4 giờ' }
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
              <h3 className="filter-group__title">🛬 Điểm dừng</h3>
              <div className="filter-group__content">
                {[
                  { value: '0', label: 'Bay thẳng' },
                  { value: '1', label: '1 điểm dừng' },
                  { value: '2', label: '2 điểm dừng' }
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
                  <h3 className="filter-group__title">💺 Hạng vé</h3>
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
                <h3>😔 Không tìm thấy chuyến bay phù hợp</h3>
                {filteredFlights.length === 0 && flights.length > 0 ? (
                  <>
                    <p>Không có chuyến bay nào khớp với các bộ lọc của bạn.</p>
                    <Button onClick={() => setFilters({
                      priceMin: 0,
                      priceMax: 10000000,
                      airlines: [],
                      departureTime: [],
                      duration: [],
                      stops: [],
                      ticketClass: []
                    })}>
                      Xóa bộ lọc
                    </Button>
                  </>
                ) : (
                  <>
                    <p>Không có dữ liệu giá vé cho tuyến bay và ngày bạn chọn.</p>
                    <div className="empty-actions">
                      <Button 
                        variant="primary"
                        onClick={() => {
                          setError(null);
                          crawlAndRetry();
                        }}
                      >
                        🔄 Tìm kiếm giá vé mới
                      </Button>
                      <Button 
                        variant="secondary"
                        onClick={() => navigate('/')}
                      >
                        ← Tìm kiếm lại
                      </Button>
                    </div>
                    <div className="empty-tips">
                      <p className="tips-title">💡 Gợi ý:</p>
                      <ul>
                        <li>Thử tìm kiếm với ngày khác</li>
                        <li>Kiểm tra mã sân bay đúng chưa</li>
                        <li>Crawler server cần đang chạy để tìm giá mới</li>
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
                    ← Trước
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
                    Sau →
                  </Button>
                </div>
              )}
            </>
          )}
        </main>

        {/* Price Summary Sidebar */}
        <aside className="summary-sidebar">
          <Card>
            <h3 className="summary-sidebar__title">Tổng quan giá</h3>
            <div className="summary-sidebar__content">
              <div className="summary-item">
                <span className="summary-item__label">Thấp nhất</span>
                <span className="summary-item__value">
                  {filteredFlights.length > 0
                    ? formatPrice(Math.min(...filteredFlights.flatMap(f => f.classes.map(c => c.price))))
                    : '-'}
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-item__label">Trung bình</span>
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
                <span className="summary-item__label">Cao nhất</span>
                <span className="summary-item__value">
                  {filteredFlights.length > 0
                    ? formatPrice(Math.max(...filteredFlights.flatMap(f => f.classes.map(c => c.price))))
                    : '-'}
                </span>
              </div>
              <div className="summary-divider"></div>
              <div className="summary-item">
                <span className="summary-item__label">Kết quả</span>
                <span className="summary-item__value">{filteredFlights.length}</span>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      {/* Edit Search Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Chỉnh sửa tìm kiếm"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>
              Hủy
            </Button>
            <Button onClick={handleSaveSearch}>
              Tìm kiếm
            </Button>
          </>
        }
      >
        <div className="edit-search-form">
          {/* Add form fields here */}
          <p>Form chỉnh sửa tìm kiếm sẽ được thêm vào đây</p>
        </div>
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
            {flight.stops === 0 ? 'Bay thẳng' : `${flight.stops} dừng`}
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
            <Badge variant="info" size="sm">✈️ Bay thẳng</Badge>
          )}
        </div>
        <Button size="sm">
          Chọn chuyến bay
        </Button>
      </div>
    </Card>
  );
};

export default SearchResults;

