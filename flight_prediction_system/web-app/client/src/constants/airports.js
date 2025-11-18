/**
 * Vietnamese Airports Data
 */

export const VIETNAM_AIRPORTS = [
  {
    code: 'SGN',
    city: 'Tp. Hồ Chí Minh',
    airport_name: 'Sân bay Tân Sơn Nhất',
    country: 'Việt Nam'
  },
  {
    code: 'HAN',
    city: 'Hà Nội',
    airport_name: 'Sân bay Nội Bài',
    country: 'Việt Nam'
  },
  {
    code: 'DAD',
    city: 'Đà Nẵng',
    airport_name: 'Sân bay Đà Nẵng',
    country: 'Việt Nam'
  },
  {
    code: 'CXR',
    city: 'Nha Trang',
    airport_name: 'Sân bay Cam Ranh',
    country: 'Việt Nam'
  },
  {
    code: 'PQC',
    city: 'Phú Quốc',
    airport_name: 'Sân bay Phú Quốc',
    country: 'Việt Nam'
  },
  {
    code: 'DLI',
    city: 'Đà Lạt',
    airport_name: 'Sân bay Liên Khương',
    country: 'Việt Nam'
  },
  {
    code: 'HPH',
    city: 'Hải Phòng',
    airport_name: 'Sân bay Cát Bi',
    country: 'Việt Nam'
  },
  {
    code: 'VCA',
    city: 'Cần Thơ',
    airport_name: 'Sân bay Cần Thơ',
    country: 'Việt Nam'
  },
  {
    code: 'HUI',
    city: 'Huế',
    airport_name: 'Sân bay Phú Bài',
    country: 'Việt Nam'
  },
  {
    code: 'VDO',
    city: 'Vân Đồn',
    airport_name: 'Sân bay Vân Đồn',
    country: 'Việt Nam'
  }
];

/**
 * Get airport by code
 * @param {string} code - Airport code
 * @returns {Object|null} Airport object or null if not found
 */
export const getAirportByCode = (code) => {
  return VIETNAM_AIRPORTS.find(airport => airport.code === code) || null;
};

/**
 * Get airport options for select dropdown
 * @returns {Array} Array of {value, label} objects
 */
export const getAirportOptions = () => {
  return VIETNAM_AIRPORTS.map(airport => ({
    value: airport.code,
    label: `${airport.city} (${airport.code}) - ${airport.airport_name}`
  }));
};

