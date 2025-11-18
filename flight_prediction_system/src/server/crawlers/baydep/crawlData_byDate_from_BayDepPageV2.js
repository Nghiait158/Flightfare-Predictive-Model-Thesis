import { delay, DELAY_SHORT, DELAY_MEDIUM } from '../../utils/constants.js';
import { appendToCsvFile } from '../../utils/fileUtils.js';
import path from 'path';
import { RESULT_DIR } from '../../config/loadConfig.js';

export async function crawlData_byDate_from_BayDepPageV2(page, dateString, departure_airport, arrival_airport, adult, child, infant, options = {}) {
    console.log("Crawl for date: " + dateString);
    console.log("Appear page to crawl");

    await page.waitForSelector('.list-flight .fare-option', { timeout: 25000 });

    const timeStartCrawl = Date.now();
    
    // Evaluate and extract data for all flight options
    const allFlightsData = await page.evaluate((adultCount, childCount, infantCount) => {
        const results = [];
        const fareOptionElements = Array.from(document.querySelectorAll('.list-flight > .fare-option'));

        fareOptionElements.forEach(fareOption => {
            if (!fareOption) {
                return; // continue to next iteration
            }

            const data = {};

            const destinationInfos = fareOption.querySelectorAll('.flight .destination-info');
            if (destinationInfos.length >= 2) {
                const departureInfo = destinationInfos[0];
                const arrivalInfo = destinationInfos[1];

                data.departure_airport = departureInfo.querySelector('.airport-code')?.textContent.trim() || null;
                data.depart_time = departureInfo.querySelector('.time')?.textContent.trim().replace(/\D/g,':') || null;

                const dateEl = departureInfo.querySelector('.date');
                if (dateEl) {
                    const dateText = dateEl.textContent.trim();
                    const dateParts = dateText.split('/');
                    if (dateParts.length === 3) {
                        const day = dateParts[0].padStart(2, '0');
                        const month = dateParts[1].padStart(2, '0');
                        const year = dateParts[2];
                        data.flight_date = `${year}-${month}-${day}T00:00:00.000Z`;
                    }
                }

                data.arrival_airport = arrivalInfo.querySelector('.airport-code')?.textContent.trim() || null;
                data.arrival_time = arrivalInfo.querySelector('.time')?.textContent.trim().replace(/\D/g,':') || null;
            }

            data.flight_number = fareOption.querySelector('.flight-numb')?.textContent.trim() || null;

            const priceEl = fareOption.querySelector('.view-total-fare');
            data.price = priceEl ? priceEl.textContent.trim().replace(/\./g, '') : null;
            
            const fareDataHiddenDiv = fareOption.querySelector('.fare-data > div[hidden]');
            if (fareDataHiddenDiv) {
                const classMatch = fareDataHiddenDiv.innerHTML.match(/Class:\s*<strong>(.+?)<\/strong>/);
                data.classes = classMatch ? classMatch[1].trim() : null;
            }

            data.aircraft_type = null;
            const detailContainer = fareOption.nextElementSibling;
            if (detailContainer && detailContainer.classList.contains('flight-detail-container')) {
                const flightDetailInfo = detailContainer.querySelector('.flight-detail-info');
                if (flightDetailInfo) {
                    const planeTypeMatch = flightDetailInfo.innerHTML.match(/Máy bay:\s*<strong>(.+?)<\/strong>/);
                    data.aircraft_type = planeTypeMatch ? planeTypeMatch[1].trim() : null;
                }
            }
             
            results.push({
                flight_number: data.flight_number,
                aircraft_type: data.aircraft_type,
                departure_airport: data.departure_airport,
                arrival_airport: data.arrival_airport,
                flight_date: data.flight_date,
                departure_time: data.depart_time,
                arrival_time: data.arrival_time,
                classes: data.classes,
                price: data.price,
                adult: adultCount,
                child: childCount,
                infant: infantCount
            });
        });
        
        return results;
    }, adult, child, infant);

    if (!allFlightsData || allFlightsData.length === 0) {
        throw new Error("Didn't find any flight options to process.");
    }

    const successfulCrawls = allFlightsData.length;
    const itemsToProcess = successfulCrawls;

    if (allFlightsData.length > 0) {
        try {
            const csvFilePath = path.join(RESULT_DIR, 'flight_price_history.csv');
            await appendToCsvFile(csvFilePath, allFlightsData);
            console.log(`✅ Saved ${allFlightsData.length} flight data to CSV`);
        } catch (csvError) {
            console.error(`Error saving CSV for the flights: ${csvError.message}`);
        }
    }

    const timeEndCrawl = Date.now();
    console.log(`⏱️ Time crawl: ${timeEndCrawl - timeStartCrawl} ms`);
    console.log(`📊 Summary: Successfully crawled ${successfulCrawls}/${itemsToProcess} flights`);

    return {
        daily_results: allFlightsData,
        summary: {
            successfulCrawls,
            itemsToProcess
        }
    };
}






