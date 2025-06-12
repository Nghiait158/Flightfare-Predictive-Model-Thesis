import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const url = 'https://www.vietjetair.com/vi/pages/bao-hiem-du-lich-sky-care-1681121104781';

// Đọc thông tin sân bay từ CSV
function readAirportsFromCSV(filePath) {
    const csvContent = fs.readFileSync(filePath, 'utf-8');
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',');
    
    const airports = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const airport = {};
        headers.forEach((header, index) => {
            airport[header.trim()] = values[index]?.trim() || '';
        });
        airports.push(airport);
    }
    return airports;
}

// Đọc config chuyến bay từ JSON
function readFlightConfig(filePath) {
    const configContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(configContent);
}

// Load dữ liệu
const airports = readAirportsFromCSV(path.join(process.cwd(), 'airports.csv'));
const flightConfig = readFlightConfig(path.join(process.cwd(), 'flight-config.json'));

// Tìm thông tin sân bay theo code
function findAirportByCode(code) {
    return airports.find(airport => airport.code === code);
}

const departureAirport = findAirportByCode(flightConfig.departure_airport);
const arrivalAirport = findAirportByCode(flightConfig.arrival_airport);

if (!departureAirport) {
    console.error(`Departure airport ${flightConfig.departure_airport} not found in CSV`);
    process.exit(1);
}

if (!arrivalAirport) {
    console.error(`Arrival airport ${flightConfig.arrival_airport} not found in CSV`);
    process.exit(1);
}

console.log(`Flight search: ${departureAirport.city} (${departureAirport.code}) → ${arrivalAirport.city} (${arrivalAirport.code})`);

const delay = ms => new Promise(resolve => setTimeout(resolve, ms + Math.random() * 1000));

let screenshotCount = 1;

// Xóa tất cả files trong thư mục screenshot
const screenshotDir = 'screenshot';
if (fs.existsSync(screenshotDir)) {
    const files = fs.readdirSync(screenshotDir);
    for (const file of files) {
        fs.unlinkSync(path.join(screenshotDir, file));
    }
} else {
    fs.mkdirSync(screenshotDir);
}

// Function để handle cookie popups
async function handleCookiePopups(page, context = '') {
    const result = await page.evaluate(() => {
        let status = { firstButton: false, cookieButton: false };
        
        // Kiểm tra nút NC_CTA_ONE
        const btn = document.getElementById('NC_CTA_ONE');
        if (btn) {
            btn.click();
            status.firstButton = true;
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
        }
        
        return status;
    });

    if (result.firstButton) {
        console.log(`${context}First button clicked`);
    }
    if (result.cookieButton) {
        console.log(`${context}Cookie button clicked`);
    }
    if (!result.firstButton && !result.cookieButton) {
        console.log(`${context}No cookie popups found`);
    }
    
    return result;
}

(async () => {
    const browser = await puppeteer.launch({
    headless: false,
            args: [
                '--start-maximized', 
                '--window-size=1920,1080',
            '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--no-sandbox',
                '--disable-dev-shm-usage'
            ],
            defaultViewport: null,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
        
        // Capture browser console logs but filter out CORS errors
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            
            if (text.includes('CORS') || 
                text.includes('Failed to load resource') ||
                text.includes('net::ERR_FAILED')) {
                return;
            }
            
            if (type === 'log') {
                console.log(`🌐 Browser: ${text}`);
            } else if (type === 'error' && !text.includes('CORS')) {
                console.error(`🌐 Browser Error: ${text}`);
            }
        });

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        
        const title = await page.title();
        console.log(`The title of "${url}" is: ${title}.`);
        
        await delay(2000);

        // Handle cookie popups on initial page
        await handleCookiePopups(page, 'Initial page: ');

        await delay(2000);

        // Chọn radio button "oneway"
        try {
            await page.click('input[type="radio"][value="oneway"]');
                console.log('Selected oneway radio button');
        } catch (error) {
            console.log('Oneway radio button not found or already selected');
            }

        // Click vào input field và nhập sân bay đi
        await page.click('div.MuiInputBase-root.MuiOutlinedInput-root.MuiInputBase-fullWidth.MuiInputBase-formControl');
        await delay(500);

        await page.type('input.MuiInputBase-input.MuiOutlinedInput-input', departureAirport.code, {delay: 100});
        console.log('Finish input outbound airport');
        
        await delay(1500); // Đợi dropdown xuất hiện

        // Chờ panel Việt Nam xuất hiện
        try {
            await page.waitForFunction(() => {
                const panels = Array.from(document.querySelectorAll('.MuiExpansionPanel-root'));
                for (const panel of panels) {
                    const header = panel.querySelector('.MuiExpansionPanelSummary-content');
                    if (header && header.textContent.includes('Việt Nam')) {
                        const content = panel.querySelector('.MuiCollapse-wrapperInner');
                        return content;
                    }
                }
                return false;
            }, { timeout: 10000 });

            console.log('Vietnam panel found, listing airports...');

            // List tất cả các sân bay trong panel Việt Nam
            const airportList = await page.evaluate((airportInfo) => {
                const panels = Array.from(document.querySelectorAll('.MuiExpansionPanel-root'));
                const vietnamPanel = panels.find(panel => {
                    const header = panel.querySelector('.MuiExpansionPanelSummary-content');
                    return header && header.textContent.includes('Việt Nam');
                });

                if (!vietnamPanel) return [];

                const allBoxes = vietnamPanel.querySelectorAll('.MuiBox-root');
                console.log(`Found ${allBoxes.length} airport boxes in Vietnam panel:`);
                
                const airportList = [];
                allBoxes.forEach((box, index) => {
                    const boxText = (box.textContent || '').trim();
                    if (boxText) {
                        console.log(`Box ${index + 1}: ${boxText}`);
                        airportList.push({
                            index: index,
                            text: boxText,
                            hasDepartureCode: boxText.includes(airportInfo.code),
                            hasDepartureCity: boxText.includes(airportInfo.city)
                        });
                    }
                });
                return airportList;
            }, departureAirport);

            console.log('Airports found:', airportList);

            // Tìm và click vào departure airport bằng Puppeteer
            const targetDepartureAirport = airportList.find(airport => 
                airport.hasDepartureCode || airport.hasDepartureCity ||
                airport.text.includes(departureAirport.airport_name)
            );
            
            if (targetDepartureAirport) {
                console.log(`Found departure airport ${departureAirport.city} at index ${targetDepartureAirport.index}. Attempting to click...`);
                
                // Sử dụng Puppeteer để click vào departure airport box
                const boxSelector = `.MuiExpansionPanel-root .MuiCollapse-wrapperInner .MuiBox-root:nth-child(${targetDepartureAirport.index + 1})`;
                
                try {
                        // Scroll đến element
                    await page.evaluate((selector) => {
                        const element = document.querySelector(selector);
                        if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, boxSelector);
                    
                    await delay(500);
                    
                    // Thử click bằng nhiều cách
                    try {
                        console.log('Method 1: Click using selector');
                        await page.click(boxSelector);
                    } catch (e) {
                        console.log('Method 1 failed, trying method 2...');
                        
                        // Method 2: Click vào phần tử con chứa airport code
                        try {
                            const codeSelector = `${boxSelector} div[translate="no"]`;
                            await page.click(codeSelector);
                            console.log('Method 2: Clicked airport code element');
                        } catch (e2) {
                            console.log('Method 2 failed, trying method 3...');
                            
                            // Method 3: Click bằng JavaScript
                            await page.evaluate((selector) => {
                                const element = document.querySelector(selector);
                                if (element) {
                                    element.click();
                                    console.log('Method 3: JavaScript click executed');
                                }
                            }, boxSelector);
                        }
                    }
                    
                    await delay(1000);
                    
                    // Kiểm tra giá trị input sau khi click
                    const inputValue = await page.$eval('input.MuiInputBase-input.MuiOutlinedInput-input', el => el.value);
                    console.log(`✅ Departure airport selection result. Input value is now: "${inputValue}"`);
                    
                } catch (error) {
                    console.log(`❌ Failed to click ${departureAirport.city} airport:`, error.message);
                }
            } else {
                console.log(`❌ ${departureAirport.city} airport not found in the list`);
            }

        } catch (error) {
            console.log('⚠️ Error finding Vietnam panel or airports:', error.message);
            await page.screenshot({ path: 'screenshot/debug-airport-selection.png', fullPage: true });
        }
        
        await delay(2000);

        // Click và nhập sân bay đến
        await page.click('input#arrivalPlaceDesktop');
        await delay(500);
        await page.type('input#arrivalPlaceDesktop', arrivalAirport.code, {delay: 100});
        console.log('Finish input inbound airport');
        await delay(2000);

        // Chờ dropdown sân bay đến xuất hiện và chọn
        try {
            await page.waitForFunction(() => {
                const panels = Array.from(document.querySelectorAll('.MuiExpansionPanel-root'));
                for (const panel of panels) {
                    const header = panel.querySelector('.MuiExpansionPanelSummary-content');
                    if (header && header.textContent.includes('Việt Nam')) {
                        const content = panel.querySelector('.MuiCollapse-wrapperInner');
                        return content;
                    }
                }
                return false;
            }, { timeout: 10000 });

            console.log('Vietnam panel found for destination airport, listing airports...');

            // List tất cả các sân bay trong panel Việt Nam cho sân bay đến
            const destinationAirports = await page.evaluate((airportInfo) => {
                const panels = Array.from(document.querySelectorAll('.MuiExpansionPanel-root'));
                const vietnamPanel = panels.find(panel => {
                    const header = panel.querySelector('.MuiExpansionPanelSummary-content');
                    return header && header.textContent.includes('Việt Nam');
                });

                if (!vietnamPanel) return [];

                const allBoxes = vietnamPanel.querySelectorAll('.MuiBox-root');
                console.log(`Found ${allBoxes.length} destination airport boxes in Vietnam panel:`);
                
                const airportList = [];
                allBoxes.forEach((box, index) => {
                    const boxText = (box.textContent || '').trim();
                    if (boxText) {
                        console.log(`Destination Box ${index + 1}: ${boxText}`);
                        airportList.push({
                            index: index,
                            text: boxText,
                            hasArrivalCode: boxText.includes(airportInfo.code),
                            hasArrivalCity: boxText.includes(airportInfo.city)
                        });
                    }
                });
                return airportList;
            }, arrivalAirport);

            console.log('Destination airports found:', destinationAirports);

            // Tìm và click vào arrival airport bằng Puppeteer
            const targetArrivalAirport = destinationAirports.find(airport => 
                airport.hasArrivalCode || airport.hasArrivalCity ||
                airport.text.includes(arrivalAirport.airport_name)
            );
            
            if (targetArrivalAirport) {
                console.log(`Found arrival airport ${arrivalAirport.city} at index ${targetArrivalAirport.index}. Attempting to click...`);
                
                // Sử dụng Puppeteer để click vào arrival airport box
                const boxSelector = `.MuiExpansionPanel-root .MuiCollapse-wrapperInner .MuiBox-root:nth-child(${targetArrivalAirport.index + 1})`;
                
                try {
                    // Scroll đến element
                    await page.evaluate((selector) => {
                        const element = document.querySelector(selector);
                        if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, boxSelector);
                    
                    await delay(500);
                    
                    // Thử click bằng nhiều cách
                    try {
                        console.log('Method 1: Click using selector for destination');
                        await page.click(boxSelector);
                    } catch (e) {
                        console.log('Method 1 failed, trying method 2 for destination...');
                        
                        // Method 2: Click vào phần tử con chứa airport code
                        try {
                            const codeSelector = `${boxSelector} div[translate="no"]`;
                            await page.click(codeSelector);
                            console.log('Method 2: Clicked airport code element');
                        } catch (e2) {
                            console.log('Method 2 failed, trying method 3 for destination...');
                            
                            // Method 3: Click bằng JavaScript
                            await page.evaluate((selector) => {
                                const element = document.querySelector(selector);
                                if (element) {
                                    element.click();
                                    console.log('Method 3: JavaScript click executed for destination');
                                }
                            }, boxSelector);
                        }
                    }
                    
                    await delay(1000);
                    
                    // Kiểm tra giá trị input sau khi click
                    const inputValue = await page.$eval('input#arrivalPlaceDesktop', el => el.value);
                    console.log(`✅ Arrival airport selection result. Input value is now: "${inputValue}"`);
                    
                } catch (error) {
                    console.log(`❌ Failed to click ${arrivalAirport.city} airport:`, error.message);
                }
            } else {
                console.log(`❌ ${arrivalAirport.city} airport not found in the list`);
                // Fallback: keep the typed value
                console.log('Using typed value as fallback');
            }

        } catch (error) {
            console.log('⚠️ Error finding Vietnam panel for destination airport:', error.message);
            console.log('Using typed value as fallback');
        }

        await delay(2000);

        // Click vào nút "Ngày đi"
        await page.click('div[role="button"] p.MuiTypography-h3');
        console.log('Clicked departure date button');
        await delay(2000);

        // Chọn ngày hiện tại
        await page.click('button.rdrDay.rdrDayToday');
        console.log('Selected today date');
        await delay(2000);

        // Click vào checkbox "Tìm vé rẻ nhất"
        await page.click('input[type="checkbox"][aria-label="primary checkbox"][value="primary"]');
        console.log('Clicked "Find cheapest ticket" checkbox');
        await delay(1000);

        // Click vào nút "Tìm chuyến bay"
        try {
            await page.waitForSelector('button.MuiButtonBase-root.MuiButton-root.MuiButton-contained[type="button"]', { visible: true });
            await page.click('button.MuiButtonBase-root.MuiButton-root.MuiButton-contained[type="button"]');
            console.log('Clicked search flight button');
        } catch (error) {
            console.log('Failed to click search button:', error.message);
        }

        console.log('Waiting for results...');
        await delay(10000);
        
        // Inject crawler_data.js vào trang mới
        console.log('🔄 Injecting crawler_data.js into results page...');
        
        try {
            // Đọc file crawler_data.js
            const crawlerDataScript = fs.readFileSync(path.join(process.cwd(), 'src', 'crawler_data.js'), 'utf-8');
            
            // Inject script vào trang
            await page.evaluateOnNewDocument(crawlerDataScript);
            await page.evaluate(crawlerDataScript);
            
            console.log('✅ Crawler data script injected successfully!');
            
            // Đợi script chạy và lấy kết quả
            await delay(8000); // Đợi script hoàn thành
            
            // Lấy kết quả từ window.crawlerResults
            const results = await page.evaluate(() => {
                return window.crawlerResults || null;
            });
            
            if (results) {
                console.log('📊 Crawler results:', results);
                
                // Lưu kết quả vào file JSON
                const resultsFile = path.join(process.cwd(), 'screenshot', 'flight_results.json');
                fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
                console.log(`💾 Results saved to: ${resultsFile}`);
            } else {
                console.log('⚠️ No results found from crawler script');
            }
            
        } catch (error) {
            console.error('❌ Error injecting crawler script:', error.message);
            
            // Fallback: Handle cookie manually nếu inject failed
            console.log('🔄 Falling back to manual cookie handling...');
            await handleCookiePopups(page, 'Results page (fallback): ');
        }
        
        await delay(3000); // Đợi thêm sau khi xử lý
        
        await page.screenshot({ path: 'screenshot/final_result.png', fullPage: true });
        console.log('Screenshot taken. Script finished.');

    } catch (e) {
        console.error('An error occurred:', e);
        await page.screenshot({ path: 'screenshot/error.png', fullPage: true });
    } finally {
        await browser.close();
    }
})();
