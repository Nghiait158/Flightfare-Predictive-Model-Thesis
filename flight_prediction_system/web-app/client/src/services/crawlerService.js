import axios from 'axios';

// Note: Crawler runs on different port than backend API
const CRAWLER_API_URL = process.env.REACT_APP_CRAWLER_URL || 'http://localhost:3000/api/crawl';

/**
 * Crawler Service
 * Handles flight data crawling from various sources
 */
const crawlerService = {
  /**
   * Convert date from YYYY-MM-DD to DDMMYYYY format
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {string} Date in DDMMYYYY format
   */
  convertDateFormat: (dateStr) => {
    const [year, month, day] = dateStr.split('-');
    return `${day}${month}${year}`;
  },

  /**
   * Crawl flights from BayDep
   * @param {Object} params - Crawl parameters
   * @returns {Promise} Crawl results
   */
  crawlFromBayDep: async (params) => {
    try {
      const {
        from,
        to,
        departDate,
        returnDate,
        adults = 1,
        children = 0,
        infants = 0,
        tripType = 'one-way'
      } = params;

      // Convert date format
      const formattedDepartDate = crawlerService.convertDateFormat(departDate);
      const formattedReturnDate = returnDate ? crawlerService.convertDateFormat(returnDate) : null;

      const payload = {
        departure_airport: from,
        arrival_airport: to,
        departure_date: formattedDepartDate,
        return_date: formattedReturnDate,
        adult: adults,
        child: children,
        infant: infants,
        trip_type: tripType === 'return' ? 'roundtrip' : 'oneway',
        use_retry: true,
        clear_screenshots: false,
        auto_crawl_days: 0 // Only crawl the specific date
      };

      console.log('🚀 Crawling from BayDep with params:', payload);

      const response = await axios.post(`${CRAWLER_API_URL}/baydep`, payload, {
        timeout: 120000 // 2 minutes timeout for crawling
      });

      return response.data;
    } catch (error) {
      console.error('Error crawling from BayDep:', error);
      throw error;
    }
  },

  /**
   * Crawl flights from VietJet
   * NOTE: Currently not used by smartCrawl. Available for direct calls if needed.
   * @param {Object} params - Crawl parameters
   * @returns {Promise} Crawl results
   */
  crawlFromVietJet: async (params) => {
    try {
      const {
        from,
        to,
        departDate,
        returnDate,
        adults = 1,
        children = 0,
        infants = 0,
        tripType = 'one-way'
      } = params;

      // Convert date format
      const formattedDepartDate = crawlerService.convertDateFormat(departDate);
      const formattedReturnDate = returnDate ? crawlerService.convertDateFormat(returnDate) : null;

      const payload = {
        departure_airport: from,
        arrival_airport: to,
        departure_date: formattedDepartDate,
        return_date: formattedReturnDate,
        adult: adults,
        child: children,
        infant: infants,
        trip_type: tripType === 'return' ? 'roundtrip' : 'oneway',
        use_retry: true,
        clear_screenshots: false
      };

      console.log('🚀 Crawling from VietJet with params:', payload);

      const response = await axios.post(`${CRAWLER_API_URL}/vietjet`, payload, {
        timeout: 120000 // 2 minutes timeout for crawling
      });

      return response.data;
    } catch (error) {
      console.error('Error crawling from VietJet:', error);
      throw error;
    }
  },

  /**
   * Smart crawl - crawls from BayDep only
   * BayDep aggregates flights from multiple airlines (VietJet, Vietnam Airlines, etc.)
   * so we don't need to crawl individual airline sites.
   * 
   * @param {Object} params - Crawl parameters
   * @returns {Promise} Crawl results
   */
  smartCrawl: async (params) => {
    console.log('🔍 Starting crawl from BayDep...');

    // Crawl from BayDep (aggregates multiple airlines)
    try {
      const result = await crawlerService.crawlFromBayDep(params);
      if (result.success) {
        console.log('✅ Successfully crawled from BayDep');
        return result;
      } else {
        throw new Error('BayDep crawl returned unsuccessful result');
      }
    } catch (error) {
      console.error('❌ BayDep crawl failed:', error.message);
      throw new Error(`Failed to crawl flight data from BayDep: ${error.message}`);
    }
  }
};

export default crawlerService;



