import React from 'react';
import './CTASection.css';

const CTASection = () => {
  return (
    <section id="cta" className="cta-section">
      {/* Background blur */}
      <div className="cta-background">
        <div className="cta-blur-circle"></div>
      </div>

      <div className="cta-container">
        <h2 className="cta-title">Ready to Save Money?</h2>
        <p className="cta-description">
          Start finding the best flight deals today. Sign up for free
          and get real-time price drop notifications.
        </p>
        <button className="cta-button">
          Get Started
          <svg className="cta-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </section>
  );
};

export default CTASection;

