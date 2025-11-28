import React from 'react';
import './Button.css';

/**
 * Reusable Button Component
 * @param {string} variant - 'primary', 'secondary', 'outline', 'ghost'
 * @param {string} size - 'sm', 'md', 'lg'
 * @param {boolean} disabled - Disabled state
 * @param {boolean} loading - Loading state
 * @param {string} className - Additional CSS classes
 * @param {Function} onClick - Click handler
 * @param {ReactNode} children - Button content
 */
const Button = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  onClick,
  children,
  ...props
}) => {
  const baseClass = 'btn';
  const variantClass = `btn--${variant}`;
  const sizeClass = `btn--${size}`;
  const disabledClass = (disabled || loading) ? 'btn--disabled' : '';
  const loadingClass = loading ? 'btn--loading' : '';

  const combinedClassName = [
    baseClass,
    variantClass,
    sizeClass,
    disabledClass,
    loadingClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      className={combinedClassName}
      onClick={onClick}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="btn__spinner"></span>
      )}
      <span className={loading ? 'btn__content--hidden' : ''}>
        {children}
      </span>
    </button>
  );
};

export default Button;


