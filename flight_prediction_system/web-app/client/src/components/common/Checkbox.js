import React from 'react';
import './Checkbox.css';

/**
 * Reusable Checkbox Component
 * @param {boolean} checked - Checked state
 * @param {Function} onChange - Change handler
 * @param {string} label - Label text
 * @param {boolean} disabled - Disabled state
 * @param {string} className - Additional CSS classes
 */
const Checkbox = ({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
  ...props
}) => {
  return (
    <label className={`checkbox ${disabled ? 'checkbox--disabled' : ''} ${className}`}>
      <input
        type="checkbox"
        className="checkbox__input"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        {...props}
      />
      <span className="checkbox__checkmark"></span>
      {label && <span className="checkbox__label">{label}</span>}
    </label>
  );
};

export default Checkbox;





