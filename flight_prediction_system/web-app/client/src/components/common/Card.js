import React from 'react';
import './Card.css';

/**
 * Reusable Card Component
 * @param {string} variant - 'default', 'elevated', 'bordered'
 * @param {boolean} hoverable - Enable hover effect
 * @param {string} className - Additional CSS classes
 * @param {ReactNode} children - Card content
 */
const Card = ({
  variant = 'default',
  hoverable = false,
  className = '',
  children,
  ...props
}) => {
  const baseClass = 'card';
  const variantClass = `card--${variant}`;
  const hoverableClass = hoverable ? 'card--hoverable' : '';

  const combinedClassName = [
    baseClass,
    variantClass,
    hoverableClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={combinedClassName} {...props}>
      {children}
    </div>
  );
};

export default Card;


