// crawler_data.js - Script để xử lý trang kết quả
(function() {
    console.log('🚀 Crawler Data Script loaded!');

    // Function để handle cookie popups
    function handleCookiePopups() {
        let status = { firstButton: false, cookieButton: false };
        
        // Kiểm tra nút NC_CTA_ONE
        const btn = document.getElementById('NC_CTA_ONE');
        if (btn) {
            btn.click();
            status.firstButton = true;
            console.log('✅ First button clicked');
        }
        
        // Kiểm tra cookie button với XPath
        const muiButton = document.evaluate(
            "//button[contains(@class, 'MuiButton-root')]//h5[contains(text(), 'Đồng ý')]/..",
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
        
        if (muiButton) {
            muiButton.click();
            status.cookieButton = true;
            console.log('✅ Cookie button clicked');
        }
        
        if (!status.firstButton && !status.cookieButton) {
            console.log('ℹ️ No cookie popups found');
        }
        
        return status;
    }

    // Function để đợi một khoảng thời gian
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Function để extract dữ liệu chuyến bay
    function extractFlightData() {
        console.log('🔍 Extracting flight data...');
        
        const flights = [];
        
        // Tìm tất cả các flight cards
        const flightCards = document.querySelectorAll('[data-testid="flight-card"], .flight-item, .MuiCard-root');
        
        console.log(`Found ${flightCards.length} flight cards`);
        
        flightCards.forEach((card, index) => {
            try {
                const flightData = {
                    index: index + 1,
                    departure_time: '',
                    arrival_time: '',
                    duration: '',
                    price: '',
                    aircraft: '',
                    flight_number: ''
                };

                // Extract departure time
                const depTimeElements = card.querySelectorAll('span, div, p');
                depTimeElements.forEach(el => {
                    const text = el.textContent.trim();
                    if (/^\d{2}:\d{2}$/.test(text) && !flightData.departure_time) {
                        flightData.departure_time = text;
                    }
                });

                // Extract price
                const priceElements = card.querySelectorAll('*');
                priceElements.forEach(el => {
                    const text = el.textContent.trim();
                    if (text.includes('VND') || text.includes('₫') || /\d+\.\d+/.test(text)) {
                        if (!flightData.price && text.length < 50) {
                            flightData.price = text;
                        }
                    }
                });

                // Extract flight number
                const flightNumElements = card.querySelectorAll('*');
                flightNumElements.forEach(el => {
                    const text = el.textContent.trim();
                    if (/^VJ\d+/.test(text)) {
                        flightData.flight_number = text;
                    }
                });

                if (flightData.departure_time || flightData.price || flightData.flight_number) {
                    flights.push(flightData);
                    console.log(`Flight ${index + 1}:`, flightData);
                }
                
            } catch (error) {
                console.log(`Error extracting flight ${index + 1}:`, error);
            }
        });

        return flights;
    }

    // Function để scroll và load thêm dữ liệu nếu cần
    async function scrollAndLoadMore() {
        console.log('📜 Scrolling to load more flights...');
        
        // Scroll xuống cuối trang
        window.scrollTo(0, document.body.scrollHeight);
        await delay(2000);
        
        // Tìm nút "Load more" nếu có
        const loadMoreButtons = document.querySelectorAll('button');
        for (const button of loadMoreButtons) {
            const buttonText = button.textContent.toLowerCase();
            if (buttonText.includes('load more') || 
                buttonText.includes('xem thêm') || 
                buttonText.includes('tải thêm')) {
                console.log('🔄 Clicking load more button');
                button.click();
                await delay(3000);
                break;
            }
        }
    }

    // Main function để chạy tất cả tasks
    async function runCrawlerTasks() {
        try {
            console.log('🎯 Starting crawler tasks on results page...');
            
            // Step 1: Handle cookies
            await delay(1000);
            handleCookiePopups();
            
            // Step 2: Đợi trang load hoàn toàn
            await delay(3000);
            
            // Step 3: Scroll và load more data
            await scrollAndLoadMore();
            
            // Step 4: Extract flight data
            const flightData = extractFlightData();
            
            // Step 5: Save data to window object để main script có thể access
            window.crawlerResults = {
                timestamp: new Date().toISOString(),
                total_flights: flightData.length,
                flights: flightData
            };
            
            console.log('✅ Crawler tasks completed!');
            console.log('📊 Results saved to window.crawlerResults');
            
            return window.crawlerResults;
            
        } catch (error) {
            console.error('❌ Error in crawler tasks:', error);
            window.crawlerResults = { error: error.message };
            return window.crawlerResults;
        }
    }

    // Auto-run when script loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runCrawlerTasks);
    } else {
        // Document already loaded
        setTimeout(runCrawlerTasks, 1000);
    }

    // Expose functions globally nếu cần
    window.crawlerData = {
        handleCookiePopups,
        extractFlightData,
        scrollAndLoadMore,
        runCrawlerTasks
    };

})(); 