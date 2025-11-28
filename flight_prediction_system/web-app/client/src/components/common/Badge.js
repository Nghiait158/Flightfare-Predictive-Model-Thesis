import React from 'react';
import './Badge.css';

/**
 * Reusable Badge Component
 * @param {string} variant - 'default', 'primary', 'success', 'warning', 'danger', 'info'
 * @param {string} size - 'sm', 'md', 'lg'
 * @param {string} className - Additional CSS classes
 * @param {ReactNode} children - Badge content
 */
const Badge = ({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}) => {
  const baseClass = 'badge';
  const variantClass = `badge--${variant}`;
  const sizeClass = `badge--${size}`;

  const combinedClassName = [
    baseClass,
    variantClass,
    sizeClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <span className={combinedClassName} {...props}>
      {children}
    </span>
  );
};

export default Badge;


