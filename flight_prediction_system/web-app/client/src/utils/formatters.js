/**
 * Utility functions for formatting data
 */

/**
 * Format price to Vietnamese currency format
 * @param {number} price - Price in VND
 * @returns {string} Formatted price
 */
export const formatPrice = (price) => {
  if (!price || isNaN(price)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(price);
};

/**
 * Format date to DD/MM/YYYY
 * @param {Date|string} date - Date object or string
 * @returns {string} Formatted date
 */
export const formatDate = (date) => {
  if (!date) return '';
  
  // Parse date safely to avoid timezone issues
  let d;
  if (typeof date === 'string' && date.includes('-')) {
    const [year, month, day] = date.split('T')[0].split('-').map(Number);
    d = new Date(year, month - 1, day);
  } else {
    d = new Date(date);
  }
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Format date to DDMMYYYY (for API)
 * @param {Date|string} date - Date object or string
 * @returns {string} Formatted date string
 */
export const formatDateForAPI = (date) => {
  if (!date) return '';
  
  // Parse date safely to avoid timezone issues
  let d;
  if (typeof date === 'string' && date.includes('-')) {
    const [year, month, day] = date.split('T')[0].split('-').map(Number);
    d = new Date(year, month - 1, day);
  } else {
    d = new Date(date);
  }
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}${month}${year}`;
};

/**
 * Format time to HH:MM
 * @param {string} time - Time string
 * @returns {string} Formatted time
 */
export const formatTime = (time) => {
  if (!time) return '';
  // If already in HH:MM format, return as is
  if (time.match(/^\d{2}:\d{2}$/)) return time;
  
  // If in other format, try to parse
  const d = new Date(time);
  if (isNaN(d.getTime())) return time;
  
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * Calculate duration between two times
 * @param {string} startTime - Start time
 * @param {string} endTime - End time
 * @returns {string} Duration in format "Xh Ym"
 */
export const calculateDuration = (startTime, endTime) => {
  if (!startTime || !endTime) return '';
  
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  let totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
  
  // Handle overnight flights
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  return `${hours}h ${minutes}m`;
};

/**
 * Get today's date in DDMMYYYY format
 * @returns {string} Today's date
 */
export const getTodayFormatted = () => {
  return formatDateForAPI(new Date());
};

/**
 * Add days to a date
 * @param {Date|string} date - Base date
 * @param {number} days - Number of days to add
 * @returns {Date} New date
 */
export const addDays = (date, days) => {
  // Parse date safely to avoid timezone issues
  let result;
  if (typeof date === 'string' && date.includes('-')) {
    const [year, month, day] = date.split('T')[0].split('-').map(Number);
    result = new Date(year, month - 1, day);
  } else {
    result = new Date(date);
  }
  
  result.setDate(result.getDate() + days);
  return result;
};

