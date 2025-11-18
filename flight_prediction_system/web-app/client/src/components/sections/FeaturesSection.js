import React from 'react';
import './FeaturesSection.css';

const FeaturesSection = () => {
  const features = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
      ),
      title: 'Dự đoán AI thông minh',
      description: 'Sử dụng machine learning để phân tích xu hướng giá và dự đoán mức giá tốt nhất cho chuyến bay của bạn.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 6l-9.5 9.5-5-5L1 18"/>
          <path d="M17 6h6v6"/>
        </svg>
      ),
      title: 'Theo dõi giá giảm',
      description: 'Nhận thông báo tức thì khi giá vé giảm đối với các tuyến bay yêu thích của bạn.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
      title: 'An toàn và tin cậy',
      description: 'Dữ liệu của bạn được bảo vệ với mã hóa end-to-end cấp enterprise.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
        </svg>
      ),
      title: 'Nhiều hãng hàng không',
      description: 'So sánh giá từ tất cả các hãng hàng không lớn với một tìm kiếm duy nhất.'
    }
  ];

  return (
    <section id="features" className="features-section">
      <div className="features-container">
        {/* Header */}
        <div className="features-header">
          <h2 className="features-title">Tính năng nổi bật</h2>
          <p className="features-subtitle">
            Mọi thứ bạn cần để tìm được giá vé tốt nhất
          </p>
        </div>

        {/* Features Grid */}
        <div className="features-grid">
          {features.map((feature, index) => (
            <div key={index} className="feature-card">
              <div className="feature-icon-wrapper">
                {feature.icon}
              </div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-description">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;

