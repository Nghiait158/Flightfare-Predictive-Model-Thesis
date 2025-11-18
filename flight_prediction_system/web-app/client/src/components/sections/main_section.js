import React from 'react';
import SearchForm from '../form/search_form';
import './main_section.css';

const MainSection = ({ onSearch }) => {
  return (
    <section className="main-section">
      {/* <div className="main-background">
        <div className="blur-circle blur-top-right"></div>
        <div className="blur-circle blur-bottom-left"></div>
      </div> */}

      <div className="main-container">
        <div className="main-header">
          {/* <div className="main-badge">
            <svg className="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3l18 18M18 6l-9 9M9 12l7-7M9 18l6-6"/>
            </svg>
            Dự đoán giá vé thông minh
          </div> */}

          <h1 className="main-title">
            Forecasting<br />
            <span className="main-title-gradient">Smart Flight</span>
          </h1>

          <p className="main-description">
            Predict with precision. Book with confidence. Save on every flight
          </p>
        </div>

        <div className="main-search">
          <SearchForm onSubmit={onSearch} />
        </div>
      </div>
    </section>
  );
};

export default MainSection;

