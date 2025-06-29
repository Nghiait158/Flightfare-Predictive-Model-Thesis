
export const SELECTORS = {
    // Cookies and popups
    COOKIES: {
        FIRST_BUTTON: '#NC_CTA_ONE',
        COOKIE_BUTTON_XPATH: "//button[contains(@class, 'MuiButton-root')]//h5[contains(text(), 'Đồng ý')]/.."
    },
    
    // Airport selection
    AIRPORTS: {
        DEPARTURE_INPUT: 'div.MuiInputBase-root.MuiOutlinedInput-root.MuiInputBase-fullWidth.MuiInputBase-formControl',
        DEPARTURE_INPUT_FIELD: 'input.MuiInputBase-input.MuiOutlinedInput-input',
        ARRIVAL_INPUT: 'input#arrivalPlaceDesktop',
        
        // Dropdown selectors
        EXPANSION_PANEL: '.MuiExpansionPanel-root',
        PANEL_HEADER: '.MuiExpansionPanelSummary-content',
        PANEL_CONTENT: '.MuiCollapse-wrapperInner',
        AIRPORT_BOX: '.MuiBox-root',
        AIRPORT_CODE: 'div[translate="no"]',
        VIETNAM_PANEL_TEXT: 'Việt Nam'
    },
    
    // Date selection
    DATE: {
        DEPARTURE_DATE_BUTTON: 'div[role="button"] p.MuiTypography-h3',
        RETURN_DATE_BUTTON: 'input[placeholder*="return"], input[placeholder*="về"], .return-date, input#returnDateDesktop',
        TODAY_BUTTON: 'button.rdrDay.rdrDayToday',
        DATE_PICKER_CONTAINER: '.rdrCalendarWrapper',
        CALENDAR_WRAPPER: '.rdrCalendarWrapper, .MuiPickersCalendar-root, .react-datepicker',
        CALENDAR_NEXT: '.rdrNextButton, .MuiPickersArrowSwitcher-rightArrowButton, .calendar-next, .next-month',
        CALENDAR_PREV: '.rdrPrevButton, .MuiPickersArrowSwitcher-leftArrowButton, .calendar-prev, .prev-month',
        CALENDAR_HEADER: '.rdrMonthAndYearWrapper, .MuiPickersCalendarHeader-monthTitleContainer, .calendar-header, .datepicker-header'
    },
    
    // Search form
    SEARCH: {
        ONEWAY_RADIO: 'input[type="radio"][value="oneway"], input[value="oneWay"], label[for="oneWay"], .trip-type-oneway',
        ROUNDTRIP_RADIO: 'input[type="radio"][value="roundtrip"], input[value="roundTrip"], label[for="roundTrip"], .trip-type-roundtrip',
        CHEAPEST_CHECKBOX: 'input[type="checkbox"][aria-label="primary checkbox"][value="primary"], .cheapest-checkbox, input[name="cheapest"]',
        SEARCH_BUTTON: 'button.MuiButtonBase-root.MuiButton-root.MuiButton-contained[type="button"], .search-button, button[type="submit"]'
        // SEARCH_BUTTON: 'button.MuiButtonBase-root.MuiButton-contained
    },
    
    // Results page
    RESULTS: {
        FLIGHT_CARD: '[data-testid="flight-card"], .flight-item, .MuiCard-root',
        PRICE_ELEMENT: '.flight-price, .price',
        TIME_ELEMENT: '.flight-time, .time',
        FLIGHT_NUMBER: '.flight-number',
        RESULTS_CONTAINER: '.flight-results, .search-results'
    },
    
    // Loading states
    LOADING: {
        SPINNER: '.loading, .spinner, .MuiCircularProgress-root',
        OVERLAY: '.loading-overlay, .MuiBackdrop-root'
    }
};

// Legacy exports for backward compatibility
export const COOKIE_SELECTORS = SELECTORS.COOKIES;
export const TRIP_TYPE_SELECTORS = {
    ONEWAY_RADIO: SELECTORS.SEARCH.ONEWAY_RADIO,
    ROUNDTRIP_RADIO: SELECTORS.SEARCH.ROUNDTRIP_RADIO
};
export const AIRPORT_SELECTORS = SELECTORS.AIRPORTS;
export const DATE_SELECTORS = SELECTORS.DATE;
export const SEARCH_SELECTORS = SELECTORS.SEARCH;

/**
 * Flight results selectors
 */
export const RESULTS_SELECTORS = {
    FLIGHT_CARD: '[data-testid="flight-card"], .flight-item, .MuiCard-root',
    PRICE_ELEMENT: '.flight-price, .price',
    TIME_ELEMENT: '.flight-time, .time',
    FLIGHT_NUMBER: '.flight-number'
};

/**
 * Vietnam panel specific text to search for
 */
export const VIETNAM_PANEL_TEXT = 'Việt Nam';

/**
 * Waiting and loading selectors
 */
export const LOADING_SELECTORS = {
    SPINNER: '.loading, .spinner, .MuiCircularProgress-root',
    WAIT_FOR_VISIBLE: 'button.MuiButtonBase-root.MuiButton-root.MuiButton-contained[type="button"]'
}; 