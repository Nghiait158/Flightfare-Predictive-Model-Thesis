import React, { useState, useRef, useEffect } from 'react';
import { airportService } from '../../services/airportService';
import './airport_auto_complete.css';

const AirportAutocomplete = ({ 
  name, 
  placeholder, 
  value, 
  onChange,
  label 
}) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedAirport, setSelectedAirport] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [allAirports, setAllAirports] = useState([]);
  const wrapperRef = useRef(null);
  const suggestionRefs = useRef([]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch all airports on mount
  useEffect(() => {
    const fetchAirports = async () => {
      try {
        const airports = await airportService.getAllAirports();
        setAllAirports(airports);
      } catch (error) {
        console.error('Failed to fetch airports:', error);
      }
    };
    
    fetchAirports();
  }, []);

  // Update input value when value prop changes
  useEffect(() => {
    if (value) {
      const airport = allAirports.find(a => a.code === value);
      if (airport) {
        setSelectedAirport(airport);
        setInputValue(`${airport.city} (${airport.code})`);
      }
    } else {
      setInputValue('');
      setSelectedAirport(null);
    }
  }, [value, allAirports]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && suggestionRefs.current[highlightedIndex]) {
      suggestionRefs.current[highlightedIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [highlightedIndex]);

  const handleInputChange = async (e) => {
    const searchValue = e.target.value;
    setInputValue(searchValue);
    setSelectedAirport(null);
    setHighlightedIndex(-1);

    // Notify parent that value is cleared
    onChange({ target: { name, value: '' } });

    if (searchValue.trim() === '') {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Search airports from API
    setIsLoading(true);
    try {
      const results = await airportService.searchAirports(searchValue);
      setSuggestions(results);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Error searching airports:', error);
      // Fallback to local filtering if API fails
      const searchLower = searchValue.toLowerCase();
      const filtered = allAirports.filter(airport => 
        airport.city.toLowerCase().includes(searchLower) ||
        airport.name.toLowerCase().includes(searchLower) ||
        airport.code.toLowerCase().includes(searchLower)
      );
      setSuggestions(filtered);
      setShowSuggestions(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAirport = (airport) => {
    setSelectedAirport(airport);
    setInputValue(`${airport.city} (${airport.code})`);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    
    // Notify parent component
    onChange({ target: { name, value: airport.code } });
  };

  const handleFocus = () => {
    if (inputValue && !selectedAirport) {
      setShowSuggestions(true);
    }
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;

      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSelectAirport(suggestions[highlightedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;

      default:
        break;
    }
  };

  const handleMouseEnter = (index) => {
    setHighlightedIndex(index);
  };

  return (
    <div className="airport-autocomplete-wrapper" ref={wrapperRef}>
      <input
        type="text"
        name={name}
        placeholder={placeholder}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        className="input-field airport-input"
        autoComplete="off"
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <ul className="suggestions-list">
          {suggestions.map((airport, index) => (
            <li
              key={airport.code}
              ref={el => suggestionRefs.current[index] = el}
              className={`suggestion-item ${highlightedIndex === index ? 'highlighted' : ''}`}
              onClick={() => handleSelectAirport(airport)}
              onMouseEnter={() => handleMouseEnter(index)}
            >
              <div className="suggestion-main">
                <span className="suggestion-city">{airport.city}</span>
                <span className="suggestion-code">{airport.code}</span>
              </div>
              <div className="suggestion-airport">{airport.name}</div>
            </li>
          ))}
        </ul>
      )}

      {isLoading && (
        <ul className="suggestions-list">
          <li className="suggestion-item no-results">
            <div className="loading-spinner"></div>
            Finding airport...
          </li>
        </ul>
      )}

      {showSuggestions && !isLoading && suggestions.length === 0 && inputValue && (
        <ul className="suggestions-list">
          <li className="suggestion-item no-results">
            No matching airports found
          </li>
        </ul>
      )}
    </div>
  );
};

export default AirportAutocomplete;
