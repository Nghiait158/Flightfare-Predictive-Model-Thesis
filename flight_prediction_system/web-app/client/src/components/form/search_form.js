import React, { useState, useEffect, useRef } from 'react';
import Input from '../common/input';
import AirportAutocomplete from '../common/airport_auto_complete';
import './search_form.css';

const SearchForm = ({ onSubmit, onFromChange, onToChange, selectedTo }) => {
  const [formData, setFormData] = useState({
    from: '',
    to: '',
    departDate: '',
    returnDate: ''
  });

  // Update 'to' field when selectedTo changes from PopularDestinations
  useEffect(() => {
    if (selectedTo && selectedTo !== formData.to) {
      setFormData(prev => ({
        ...prev,
        to: selectedTo
      }));
    }
  }, [selectedTo]);
  
  const [tripType, setTripType] = useState('one-way'); // 'return' or 'one-way'
  
  const [passengers, setPassengers] = useState({
    adult: 1,
    child: 0,
    infant: 0
  });
  
  const [showPassengerDropdown, setShowPassengerDropdown] = useState(false);
  
  const passengerRef = useRef(null);

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (passengerRef.current && !passengerRef.current.contains(event.target)) {
        setShowPassengerDropdown(false);
      }
    };

    if (showPassengerDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPassengerDropdown]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: value
      };
      
      // If departDate changes and is after returnDate, clear returnDate
      if (name === 'departDate' && prev.returnDate && value > prev.returnDate) {
        updated.returnDate = '';
      }
      
      return updated;
    });

    // Notify parent component of changes
    if (name === 'from' && onFromChange) {
      onFromChange(value);
    }
    if (name === 'to' && onToChange) {
      onToChange(value);
    }
  };

  const handleTripTypeChange = (e) => {
    setTripType(e.target.value);
    if (e.target.value === 'one-way') {
      setFormData(prev => ({
        ...prev,
        returnDate: ''
      }));
    }
  };

  const handlePassengerChange = (type, operation) => {
    setPassengers(prev => {
      const newValue = operation === 'increment' ? prev[type] + 1 : prev[type] - 1;
      
      if (type === 'adult' && newValue < 1) return prev;
      if (newValue < 0) return prev; 
      
      const tempPassengers = { ...prev, [type]: newValue };
      const { adult, child, infant } = tempPassengers;
      if (infant > adult) return prev;
      // Validation rules for children per adult
      if (infant > 0) {
        if (child > adult) return prev;
      } else {
        if (child > adult * 2) return prev;
      }
      
      return {
        ...prev,
        [type]: newValue
      };
    });
  };

  const getTotalPassengers = () => {
    return passengers.adult + passengers.child + passengers.infant;
  };

  const getPassengerText = () => {
    const total = getTotalPassengers();
    return `${total} passenger`;
  };

  const canAddChild = () => {
    if (passengers.infant > 0) {
      return passengers.child < passengers.adult;
    }
    return passengers.child < passengers.adult * 2;
  };

  const canAddInfant = () => {
    if (passengers.infant >= passengers.adult) return false;
    return passengers.child <= passengers.adult;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ ...formData, tripType, passengers });
  };

  return (
    <form onSubmit={handleSubmit} className="search-form-container">
      <div className="trip-type-and-passenger">
        <div className="trip-type-selector">
          <label className="radio-option">
            <input
              type="radio"
              name="tripType"
              value="one-way"
              checked={tripType === 'one-way'}
              onChange={handleTripTypeChange}
            />
            <span className="radio-label">One-way</span>
          </label>
          <label className="radio-option">
            <input
              type="radio"
              name="tripType"
              value="return"
              checked={tripType === 'return'}
              onChange={handleTripTypeChange}
            />
            <span className="radio-label">Round-trip</span>
          </label>
        </div>

        <div className="passenger-selector" ref={passengerRef}>
          <button
            type="button"
            className="passenger-button"
            onClick={() => setShowPassengerDropdown(!showPassengerDropdown)}
          >
            <svg className="passenger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>{getPassengerText()}</span>
            <svg className={`dropdown-arrow ${showPassengerDropdown ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>

          {showPassengerDropdown && (
            <div className="passenger-dropdown">
              <div className="passenger-row">
                <div className="passenger-info">
                  <span className="passenger-type">Adult</span>
                  <span className="passenger-description">≥ 12 years</span>
                </div>
                <div className="passenger-controls">
                  <button
                    type="button"
                    className="passenger-btn"
                    onClick={() => handlePassengerChange('adult', 'decrement')}
                    disabled={passengers.adult <= 1}
                  >
                    −
                  </button>
                  <span className="passenger-count">{passengers.adult}</span>
                  <button
                    type="button"
                    className="passenger-btn"
                    onClick={() => handlePassengerChange('adult', 'increment')}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="passenger-row">
                <div className="passenger-info">
                  <span className="passenger-type">Child</span>
                  <span className="passenger-description">2 - 11 years</span>
                </div>
                <div className="passenger-controls">
                  <button
                    type="button"
                    className="passenger-btn"
                    onClick={() => handlePassengerChange('child', 'decrement')}
                    disabled={passengers.child <= 0}
                  >
                    −
                  </button>
                  <span className="passenger-count">{passengers.child}</span>
                  <button
                    type="button"
                    className="passenger-btn"
                    onClick={() => handlePassengerChange('child', 'increment')}
                    disabled={!canAddChild()}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="passenger-row">
                <div className="passenger-info">
                  <span className="passenger-type">Infant</span>
                  <span className="passenger-description">{'< 2 years'}</span>
                </div>
                <div className="passenger-controls">
                  <button
                    type="button"
                    className="passenger-btn"
                    onClick={() => handlePassengerChange('infant', 'decrement')}
                    disabled={passengers.infant <= 0}
                  >
                    −
                  </button>
                  <span className="passenger-count">{passengers.infant}</span>
                  <button
                    type="button"
                    className="passenger-btn"
                    onClick={() => handlePassengerChange('infant', 'increment')}
                    disabled={!canAddInfant()}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* <div className="passenger-note">
                <span className="note-text">
                  Each adult may accompany up to 1 infant and 1 child, or 2 children.
                </span>
              </div> */}
            </div>
          )}
        </div>
      </div>

      <div className="search-form-grid">
        <div className="form-field">
          <label className="form-label">From</label>
          <AirportAutocomplete
            name="from"
            placeholder="Select departure airport"
            value={formData.from}
            onChange={handleInputChange}
          />
        </div>

        <div className="form-field">
          <label className="form-label">To</label>
          <AirportAutocomplete
            name="to"
            placeholder="Select destination airport"
            value={formData.to}
            onChange={handleInputChange}
          />
        </div>

        <div className="form-field">
          <label className="form-label">Depart</label>
          <Input
            type="date"
            name="departDate"
            placeholder="yyyy-mm-dd"
            min={getTodayDate()}
            value={formData.departDate}
            onChange={handleInputChange}
          />
        </div>

        {tripType === 'return' && (
          <div className="form-field">
            <label className="form-label">Return</label>
            <Input
              type="date"
              name="returnDate"
              placeholder="yyyy-mm-dd"
              min={formData.departDate || getTodayDate()}
              value={formData.returnDate}
              onChange={handleInputChange}
            />
          </div>
        )}
      </div>

      <button type="submit" className="search-submit-btn">
        Search Flights
        <svg className="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </button>
    </form>
  );
};

export default SearchForm;
