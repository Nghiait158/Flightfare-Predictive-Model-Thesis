// For more information, see https://crawlee.dev/
import { PuppeteerCrawler, ProxyConfiguration, RequestQueue } from 'crawlee';
// import { router } from './routes.js';
import fs from 'fs';
import path from 'path';

const requestQueue = await RequestQueue.open();
await requestQueue.addRequest({ url: 'https://www.vietjetair.com/vi/pages/bao-hiem-du-lich-sky-care-1681121104781' });


// Định nghĩa các sân bay
const outboundAirport = "B"; // Sân bay Tân Sơn Nhất
const inboundAirport = "TBB";  // Sân bay Tuy Hòa

// const startUrls = ['https://crawlee.dev'];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms + Math.random() * 1000));

let screenshotCount = 1;

// Xóa tất cả files trong thư mục screenshot
const screenshotDir = 'screenshot';
if (fs.existsSync(screenshotDir)) {
    const files = fs.readdirSync(screenshotDir);
    for (const file of files) {
        fs.unlinkSync(path.join(screenshotDir, file));
    }
}

const crawler = new PuppeteerCrawler({
    // proxyConfiguration: new ProxyConfiguration({ proxyUrls: ['...'] }),
    // requestHandler: router,
    headless: false,
    launchContext: {
        launchOptions: {
            args: [
                '--start-maximized', 
                '--window-size=1920,1080',
                '--disable-web-security',        // Bypass CORS
                '--disable-features=VizDisplayCompositor',
                '--no-sandbox',
                '--disable-dev-shm-usage'
            ],
            defaultViewport: null,
        }
    },
    // // Comment this option to scrape the full website.
    // maxRequestsPerCrawl: 20,
    requestQueue,
    async requestHandler({ page, request }) {
        // Set full screen mode
        await page.setViewport({ width: 0, height: 0 });
        
        // Capture browser console logs but filter out CORS errors
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            
            // Skip CORS và network errors
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
        
        const title = await page.title();
        console.log(`The title of "${request.url}" is: ${title}.`);
        
        await delay(2000);
        // Ấn nút "Đồng ý" nếu có
        const result = await page.evaluate(() => {
            let status = { firstButton: false, cookieButton: false };
            const btn = document.getElementById('NC_CTA_ONE');
            if (btn) {
                btn.click();
                status.firstButton = true;
            }
            
            // click accept cookie 
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
            console.log('First button clicked');
        }
        if (result.cookieButton) {
            console.log('Cookie button clicked');
        }
        if (!result.firstButton && !result.cookieButton) {
            console.log('No buttons found/ Already accepted');
        }

        await delay(2000);
        // Chọn radio button "oneway"
        await page.evaluate(() => {
            const onewayRadio = document.querySelector('input[type="radio"][value="oneway"]');
            if (onewayRadio) {
                onewayRadio.click();
                console.log('Selected oneway radio button');
            } else {
                console.log('Oneway radio button not found');
            }
        });
        // Click vào input field và nhập sân bay đi
        // Click vào container trước
        await page.click('div.MuiInputBase-root.MuiOutlinedInput-root.MuiInputBase-fullWidth.MuiInputBase-formControl');
        await delay(500);

        // Nhập text vào input field
        await page.type('input.MuiInputBase-input.MuiOutlinedInput-input', outboundAirport, {delay: 100});
        await console.log('Finish input outbound airport');
        
        // Click thêm một lần nữa vào input để đảm bảo dropdown hiện ra
        // await page.click('input.MuiInputBase-input.MuiOutlinedInput-input');
        await console.log('Clicked input field again to show dropdown');
        await delay(500); // Đợi dropdown xuất hiện

        // Click vào item trong dropdown
        try {
            // Chờ panel Việt Nam xuất hiện và có nội dung
            await page.waitForFunction(() => {
                const panels = Array.from(document.querySelectorAll('.MuiExpansionPanel-root'));
                for (const panel of panels) {
                    const header = panel.querySelector('.MuiExpansionPanelSummary-content');
                    if (header && header.textContent.includes('Việt Nam')) {
                        // Tìm content trong chính panel này
                        const content = panel.querySelector('.MuiCollapse-wrapperInner');
                        return content && content.textContent.includes('Tp. Hồ Chí Minh') && content.textContent.includes('SGN');
                    }
                }
                return false;
            }, { timeout: 10000 });

            // Click vào div sân bay dựa hoàn toàn vào text content
            const clicked = await page.evaluate(() => {
                // Tìm panel Việt Nam
                const panels = Array.from(document.querySelectorAll('.MuiExpansionPanel-root'));
                const vietnamPanel = panels.find(panel => {
                    const header = panel.querySelector('.MuiExpansionPanelSummary-content');
                    return header && header.textContent.includes('Việt Nam');
                });

                if (!vietnamPanel) {
                    console.log('Vietnam panel not found');
                    return false;
                }

                console.log('Found Vietnam panel');

                // Tìm tất cả các MuiBox-root trong panel Việt Nam
                const allBoxes = vietnamPanel.querySelectorAll('.MuiBox-root');
                console.log('Total boxes in Vietnam panel:', allBoxes.length);

                // Tìm box chứa đầy đủ thông tin sân bay HCMC
                for (const box of allBoxes) {
                    const boxText = box.textContent || '';
                    console.log('Checking box with text:', boxText.substring(0, 50) + '...');
                    
                    // Kiểm tra box chứa cả 3 thông tin cần thiết
                    if (boxText.includes('Tp. Hồ Chí Minh') && 
                        boxText.includes('SGN') && 
                        boxText.includes('Sân bay Tân Sơn Nhất')) {
                        
                        console.log('Found HCMC airport box!');
                        console.log('Full box text:', boxText);
                        
                        // Kiểm tra element có clickable không
                        const rect = box.getBoundingClientRect();
                        console.log('Box position:', rect.top, rect.left, rect.width, rect.height);
                        
                        // Kiểm tra element có event listeners không
                        const hasClickHandler = box.onclick !== null || 
                                              box.addEventListener !== undefined ||
                                              window.getComputedStyle(box).cursor === 'pointer';
                        console.log('Has click handler:', hasClickHandler);
                        
                        // Kiểm tra element có bị che phủ không
                        const elementAtPoint = document.elementFromPoint(
                            rect.left + rect.width/2, 
                            rect.top + rect.height/2
                        );
                        const isElementOnTop = elementAtPoint === box || box.contains(elementAtPoint);
                        console.log('Element on top:', isElementOnTop);
                        console.log('Element at point:', elementAtPoint?.tagName, elementAtPoint?.className);
                        
                        // Scroll đến element
                        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        
                        // Thử nhiều cách click khác nhau
                        console.log('Trying multiple click methods...');
                        
                        // Method 1: Click trực tiếp
                        box.click();
                        console.log('Method 1: Direct click done');
                        
                        // Method 2: Click vào element at point (element thực sự ở trên cùng)
                        if (elementAtPoint && elementAtPoint !== box) {
                            elementAtPoint.click();
                            console.log('Method 2: Clicked element at point');
                        }
                        
                        // Method 3: MouseEvent with coordinates
                        const clickEvent = new MouseEvent('click', {
                            view: window,
                            bubbles: true,
                            cancelable: true,
                            clientX: rect.left + rect.width/2,
                            clientY: rect.top + rect.height/2
                        });
                        box.dispatchEvent(clickEvent);
                        console.log('Method 3: MouseEvent dispatched');
                        
                        // Method 4: Focus và Enter (nếu có thể)
                        if (box.tabIndex >= 0 || box.focus) {
                            try {
                                box.focus();
                                const enterEvent = new KeyboardEvent('keydown', {
                                    key: 'Enter',
                                    code: 'Enter',
                                    bubbles: true
                                });
                                box.dispatchEvent(enterEvent);
                                console.log('Method 4: Focus + Enter done');
                            } catch (e) {
                                console.log('Method 4: Focus failed');
                            }
                        }
                        
                        // Kiểm tra xem có thay đổi gì sau khi click không
                        setTimeout(() => {
                            const inputField = document.querySelector('input.MuiInputBase-input.MuiOutlinedInput-input');
                            const inputValue = inputField ? inputField.value : 'no input found';
                            console.log('Input value after click:', inputValue);
                        }, 500);
                        
                        return true;
                    }
                }

                console.log('HCMC airport box not found in Vietnam panel');
                return false;
            });

            if (clicked) {
                console.log('✅ Successfully clicked on HCMC airport');
            } else {
                console.log('❌ Could not find clickable HCMC airport element');
            }
        } catch (error) {
            console.log('⚠️ Error selecting Ho Chi Minh City airport:', error);
            await page.screenshot({ path: 'debug-airport-selection.png', fullPage: true });
        }
        
        
        await delay(2000);

        // Click và nhập sân bay đến
        await page.click(`input#arrivalPlaceDesktop`);
        await delay(500);
        await page.type(`input#arrivalPlaceDesktop`, inboundAirport, {delay: 100});
        await console.log('Finish input inbound airport');
        await delay(2000);

        // Click vào nút "Ngày đi"
        await page.click('div[role="button"] p.MuiTypography-h3');
        await console.log('Clicked departure date button');
        await delay(2000);

        // Chọn ngày hiện tại (23)
        await page.click('button.rdrDay.rdrDayToday');
        await console.log('Selected today date (23)');
        await delay(2000);

        // Click vào checkbox "Tìm vé rẻ nhất"
        await page.click('input[type="checkbox"][aria-label="primary checkbox"][value="primary"]');
        await console.log('Clicked "Find cheapest ticket" checkbox');
        await delay(1000);

        // Click vào nút "Tìm chuyến bay"
        try {
            await page.waitForSelector('button.MuiButtonBase-root.MuiButton-root.MuiButton-contained[type="button"]', { visible: true });
            await page.click('button.MuiButtonBase-root.MuiButton-root.MuiButton-contained[type="button"]');
            await console.log('Clicked search flight button');
        } catch (error) {
            await console.log('Failed to click search button:', error);
        }
        await delay(100000);

        // await page.screenshot({ path: `screenshot/screenshot_${screenshotCount}.png`, fullPage: true });

        
    }
});
await crawler.run();
// await crawler.run(startUrls);
