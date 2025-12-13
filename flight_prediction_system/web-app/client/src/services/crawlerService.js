import axios from 'axios';

// Note: Crawler runs on different port than backend API
// The crawler server (server.js) runs on port 3001 by default
const CRAWLER_API_URL = process.env.REACT_APP_CRAWLER_URL || 'http://localhost:3001/api/crawl';


const crawlerService = {

  convertDateFormat: (dateStr) => {
    const [year, month, day] = dateStr.split('-');
    return `${day}${month}${year}`;
  },


  crawlFromBayDep: async (params) => {
    try {
      const {
        from,
        to,
        departDate,
        returnDate,
        adults = 1,
        children = 0,
        infants = 0
      } = params;

      // Convert date format
      const formattedDepartDate = crawlerService.convertDateFormat(departDate);
      const formattedReturnDate = returnDate ? crawlerService.convertDateFormat(returnDate) : null;

      // Determine trip type based on whether return date exists
      // If returnDate is provided → roundtrip, otherwise → oneway
      const actualTripType = formattedReturnDate ? 'roundtrip' : 'oneway';

      const payload = {
        departure_airport: from,
        arrival_airport: to,
        departure_date: formattedDepartDate,
        return_date: formattedReturnDate,
        adult: adults,
        child: children,
        infant: infants,
        trip_type: actualTripType,
        use_retry: true,
        clear_screenshots: false,
        auto_crawl_days: 0 // Only crawl the specific date
      };

      console.log('🚀 Crawling from BayDep with params:', payload);

      const response = await axios.post(`${CRAWLER_API_URL}/baydep`, payload, {
        timeout: 300000 // 5 minutes timeout for crawling (crawl can take 2-3 minutes)
      });

      return response.data;
    } catch (error) {
      console.error('Error crawling from BayDep:', error);
      throw error;
    }
  },

  crawlFromVietJet: async (params) => {
    try {
      const {
        from,
        to,
        departDate,
        returnDate,
        adults = 1,
        children = 0,
        infants = 0
      } = params;

      // Convert date format
      const formattedDepartDate = crawlerService.convertDateFormat(departDate);
      const formattedReturnDate = returnDate ? crawlerService.convertDateFormat(returnDate) : null;

      // Determine trip type based on whether return date exists
      // If returnDate is provided → roundtrip, otherwise → oneway
      const actualTripType = formattedReturnDate ? 'roundtrip' : 'oneway';

      const payload = {
        departure_airport: from,
        arrival_airport: to,
        departure_date: formattedDepartDate,
        return_date: formattedReturnDate,
        adult: adults,
        child: children,
        infant: infants,
        trip_type: actualTripType,
        use_retry: true,
        clear_screenshots: false
      };

      console.log('🚀 Crawling from VietJet with params:', payload);

      const response = await axios.post(`${CRAWLER_API_URL}/vietjet`, payload, {
        timeout: 300000 // 5 minutes timeout for crawling (crawl can take 2-3 minutes)
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



