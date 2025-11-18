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
        <h2 className="cta-title">Sẵn sàng để tiết kiệm tiền?</h2>
        <p className="cta-description">
          Bắt đầu tìm giá vé máy bay tốt nhất ngay hôm nay. Đăng ký miễn phí
          và nhận thông báo giảm giá trong thời gian thực.
        </p>
        <button className="cta-button">
          Bắt đầu ngay
          <svg className="cta-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </section>
  );
};

export default CTASection;

