import React, { useState } from 'react';
import './EmailSubscriptionModal.css';

/**
 * Email Subscription Modal Component
 * Allows users to subscribe to email notifications for optimal booking times
 */
const EmailSubscriptionModal = ({ isOpen, onClose, flightData }) => {
  const [email, setEmail] = useState('');
  const [notifyOnOptimal, setNotifyOnOptimal] = useState(true);
  const [notifyOnPriceDrop, setNotifyOnPriceDrop] = useState(false);
  const [maxPrice, setMaxPrice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen || !flightData) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);
    setErrorMessage('');

    try {
      const response = await fetch('http://localhost:3003/api/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          departure_airport_code: flightData.departureCode,
          arrival_airport_code: flightData.arrivalCode,
          departure_date: flightData.departureDate,
          class_name: flightData.className,
          notify_on_optimal_time: notifyOnOptimal,
          notify_on_price_drop: notifyOnPriceDrop,
          max_price: notifyOnPriceDrop && maxPrice ? parseFloat(maxPrice) : null
        })
      });

      const data = await response.json();

      if (data.success) {
        setSubmitStatus('success');
        // Reset form after 2 seconds
        setTimeout(() => {
          handleClose();
        }, 2000);
      } else {
        setSubmitStatus('error');
        setErrorMessage(data.error || 'Đăng ký thất bại. Vui lòng thử lại.');
      }
    } catch (error) {
      console.error('Error subscribing:', error);
      setSubmitStatus('error');
      setErrorMessage('Không thể kết nối đến server. Vui lòng thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setNotifyOnOptimal(true);
    setNotifyOnPriceDrop(false);
    setMaxPrice('');
    setSubmitStatus(null);
    setErrorMessage('');
    onClose();
  };

  return (
    <div className="email-subscription-modal-overlay" onClick={handleClose}>
      <div className="email-subscription-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📧 Đăng Ký Nhận Thông Báo Giá Vé</h2>
          <button className="close-button" onClick={handleClose}>×</button>
        </div>

        <div className="modal-content">
          {/* Flight Info Summary */}
          <div className="flight-info-summary">
            <h3>Thông tin chuyến bay</h3>
            <div className="flight-details">
              <div className="detail-row">
                <span className="label">Tuyến bay:</span>
                <span className="value">{flightData.departureCode} → {flightData.arrivalCode}</span>
              </div>
              <div className="detail-row">
                <span className="label">Ngày bay:</span>
                <span className="value">{new Date(flightData.departureDate).toLocaleDateString('vi-VN')}</span>
              </div>
              <div className="detail-row">
                <span className="label">Hạng vé:</span>
                <span className="value">{flightData.className}</span>
              </div>
            </div>
          </div>

          {/* Subscription Form */}
          <form onSubmit={handleSubmit} className="subscription-form">
            <div className="form-group">
              <label htmlFor="email">
                Email của bạn <span className="required">*</span>
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                required
                disabled={isSubmitting}
                className="email-input"
              />
            </div>

            <div className="notification-options">
              <h4>Loại thông báo</h4>

              <div className="option-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={notifyOnOptimal}
                    onChange={(e) => setNotifyOnOptimal(e.target.checked)}
                    disabled={isSubmitting}
                  />
                  <div className="option-content">
                    <span className="option-title">🎯 Thời điểm tối ưu để đặt vé</span>
                    <span className="option-description">
                      Nhận email khi AI phát hiện đây là thời điểm tốt nhất để mua vé (được khuyến nghị)
                    </span>
                  </div>
                </label>
              </div>

              <div className="option-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={notifyOnPriceDrop}
                    onChange={(e) => setNotifyOnPriceDrop(e.target.checked)}
                    disabled={isSubmitting}
                  />
                  <div className="option-content">
                    <span className="option-title">💰 Giá vé giảm xuống mức mong muốn</span>
                    <span className="option-description">
                      Nhận email khi giá vé thấp hơn mức giá bạn đặt
                    </span>
                  </div>
                </label>

                {notifyOnPriceDrop && (
                  <div className="price-input-group">
                    <label htmlFor="maxPrice">Mức giá tối đa (VNĐ):</label>
                    <input
                      type="number"
                      id="maxPrice"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      placeholder="2,000,000"
                      min="0"
                      step="10000"
                      disabled={isSubmitting}
                      className="price-input"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Status Messages */}
            {submitStatus === 'success' && (
              <div className="status-message success">
                ✅ Đăng ký thành công! Bạn sẽ nhận email thông báo khi có cập nhật về giá vé.
              </div>
            )}

            {submitStatus === 'error' && (
              <div className="status-message error">
                ❌ {errorMessage}
              </div>
            )}

            {/* Submit Button */}
            <div className="form-actions">
              <button
                type="button"
                onClick={handleClose}
                className="btn btn-secondary"
                disabled={isSubmitting}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting || (!notifyOnOptimal && !notifyOnPriceDrop)}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner"></span>
                    Đang đăng ký...
                  </>
                ) : (
                  '📧 Đăng Ký Nhận Thông Báo'
                )}
              </button>
            </div>
          </form>

          {/* Info Footer */}
          <div className="info-footer">
            <p>💡 <strong>Lưu ý:</strong> Bạn có thể hủy đăng ký bất cứ lúc nào qua link trong email.</p>
            <p>🔒 Email của bạn được bảo mật và chỉ dùng để gửi thông báo giá vé.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailSubscriptionModal;
