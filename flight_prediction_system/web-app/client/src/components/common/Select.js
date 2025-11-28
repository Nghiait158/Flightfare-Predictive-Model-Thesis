import React from 'react';
import './Select.css';

/**
 * Reusable Select Component
 * @param {string} value - Selected value
 * @param {Function} onChange - Change handler
 * @param {Array} options - Array of {value, label} objects
 * @param {string} placeholder - Placeholder text
 * @param {boolean} disabled - Disabled state
 * @param {string} className - Additional CSS classes
 */
const Select = ({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  disabled = false,
  className = '',
  ...props
}) => {
  return (
    <select
      className={`select ${disabled ? 'select--disabled' : ''} ${className}`}
      value={value}
      onChange={onChange}
      disabled={disabled}
      {...props}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

export default Select;



