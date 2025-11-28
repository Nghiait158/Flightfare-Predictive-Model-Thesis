/**
 * Debug utility for testing crawler integration
 * Open browser console and run: window.testCrawler()
 */

import crawlerService from '../services/crawlerService';

export const testCrawlerConnection = async () => {
  console.log('🔍 Testing Crawler Connection...');
  console.log('================================');
  
  // Step 1: Check environment variable
  const crawlerUrl = process.env.REACT_APP_CRAWLER_URL || 'http://localhost:3000/api/crawl';
  console.log('1️⃣ Crawler URL:', crawlerUrl);
  
  // Step 2: Test basic connectivity
  console.log('2️⃣ Testing basic connectivity...');
  try {
    const response = await fetch('http://localhost:3000/api/health');
    if (response.ok) {
      console.log('✅ Crawler server is running!');
    } else {
      console.error('❌ Crawler server responded but not healthy');
    }
  } catch (err) {
    console.error('❌ Cannot connect to crawler server:', err.message);
    console.error('   Make sure crawler is running on port 3000');
    return false;
  }
  
  // Step 3: Test crawl API
  console.log('3️⃣ Testing crawl API with test data...');
  const testParams = {
    from: 'SGN',
    to: 'HAN',
    departDate: '2025-12-25',
    adults: 1,
    children: 0,
    tripType: 'one-way'
  };
  
  console.log('   Test params:', testParams);
  
  try {
    console.log('   Calling smartCrawl...');
    const result = await crawlerService.smartCrawl(testParams);
    console.log('✅ Crawl successful!', result);
    return true;
  } catch (err) {
    console.error('❌ Crawl failed:', err.message);
    console.error('   Full error:', err);
    return false;
  }
};

// Make available globally for easy testing
if (typeof window !== 'undefined') {
  window.testCrawler = testCrawlerConnection;
  console.log('💡 Debug utility loaded! Run window.testCrawler() to test crawler connection');
}

export default { testCrawlerConnection };



