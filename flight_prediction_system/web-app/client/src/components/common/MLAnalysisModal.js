import React, { useState, useEffect } from 'react';
import mlService from '../../services/mlService';
import './MLAnalysisModal.css';

const MLAnalysisModal = ({
  isOpen,
  onClose,
  flightData,
  searchParams
}) => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && flightData) {
      analyzePrice();
    }
  }, [isOpen, flightData]);

  const analyzePrice = async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      console.log('🔮 Analyzing flight:', flightData);

      // Prepare flight data for ML API
      const mlRequestData = {
        flight_number: flightData.flight_number,
        departure_airport: flightData.departure_airport || searchParams.from,
        arrival_airport: flightData.arrival_airport || searchParams.to,
        flight_date: flightData.flight_date || searchParams.departDate,
        departure_time: flightData.departure_time,
        arrival_time: flightData.arrival_time,
        classes: flightData.classes
      };

      const result = await mlService.analyzeFlightPrice(mlRequestData);

      if (result.success) {
        console.log('✅ Analysis result:', result.data);
        setAnalysis(result.data);
      } else {
        setError(result.message || 'Failed to analyze flight');
      }
    } catch (err) {
      console.error('Error analyzing flight:', err);
      setError('Failed to get ML prediction. Please make sure the ML API server is running.');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price);
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'Cheap': return '#10b981';
      case 'Normal': return '#f59e0b';
      case 'Expensive': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#3b82f6';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  };

  if (!isOpen) return null;

  return (
    <div className="ml-modal-overlay" onClick={onClose}>
      <div className="ml-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ml-modal__header">
          <h2>✨ AI Flight Analysis</h2>
          <button className="ml-modal__close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="ml-modal__content">
          {/* Flight Info Summary */}
          {analysis && (
            <div className="ml-flight-summary">
              <div className="summary-item">
                <span className="label">Route</span>
                <span className="value">{analysis.flight_info.route}</span>
              </div>
              <div className="summary-item">
                <span className="label">Airline</span>
                <span className="value">{analysis.flight_info.airline}</span>
              </div>
              <div className="summary-item">
                <span className="label">Date</span>
                <span className="value">{analysis.flight_info.flight_date}</span>
              </div>
              <div className="summary-item">
                <span className="label">Class</span>
                <span className="value">{analysis.flight_info.normalized_class}</span>
              </div>
              <div className="summary-item">
                <span className="label">Days to Flight</span>
                <span className="value">{analysis.flight_info.days_to_flight} days</span>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="ml-loading">
              <div className="spinner"></div>
              <p>Analyzing with AI...</p>
              <p className="loading-subtext">This may take a few seconds</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="ml-error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <p>{error}</p>
              <button onClick={analyzePrice} className="retry-button">
                Try Again
              </button>
            </div>
          )}

          {/* Analysis Results */}
          {analysis && !loading && !error && (
            <div className="ml-results">
              {/* Price Prediction */}
              <div className="result-section">
                <h3>💰 Price Breakdown</h3>
                <div className="price-breakdown">
                  <div className="breakdown-item">
                    <span>Base Fare</span>
                    <span className="price">{formatPrice(analysis.prediction.base_fare)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span>VAT (8%)</span>
                    <span className="price">{formatPrice(analysis.prediction.vat)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span>Taxes & Fees</span>
                    <span className="price">{formatPrice(analysis.prediction.taxes)}</span>
                  </div>
                  <div className="breakdown-divider"></div>
                  <div className="breakdown-item total">
                    <span>Total Predicted Price</span>
                    <span className="price">{formatPrice(analysis.prediction.total_price)}</span>
                  </div>
                  <div className="breakdown-formula">
                    <small>Formula: {analysis.prediction.breakdown}</small>
                  </div>
                </div>
              </div>

              {/* Price Classification */}
              <div className="result-section">
                <h3>🏷️ Price Classification</h3>
                <div className="classification-badge" style={{
                  backgroundColor: `${getCategoryColor(analysis.classification.category)}20`,
                  borderColor: getCategoryColor(analysis.classification.category)
                }}>
                  <span className="category" style={{ color: getCategoryColor(analysis.classification.category) }}>
                    {analysis.classification.category}
                  </span>
                  <span className="confidence">
                    {analysis.classification.confidence} Confidence
                  </span>
                </div>
                <p className="classification-reason">{analysis.classification.reason}</p>

                {analysis.classification.stats && (
                  <div className="price-stats">
                    <div className="stat-item">
                      <span className="stat-label">Q1 (25%)</span>
                      <span className="stat-value">{formatPrice(analysis.classification.stats.q1)}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Median</span>
                      <span className="stat-value">{formatPrice(analysis.classification.stats.median)}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Q3 (75%)</span>
                      <span className="stat-value">{formatPrice(analysis.classification.stats.q3)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Buy Score */}
              <div className="result-section">
                <h3>⭐ Buy Score</h3>
                <div className="buy-score-container">
                  <div className="score-circle" style={{
                    background: `conic-gradient(${getScoreColor(analysis.buy_score.score)} ${analysis.buy_score.score * 3.6}deg, #e5e7eb 0deg)`
                  }}>
                    <div className="score-inner">
                      <span className="score-value">{analysis.buy_score.score}</span>
                      <span className="score-max">/100</span>
                    </div>
                  </div>
                  <div className="score-details">
                    <div className="score-level" style={{ color: getScoreColor(analysis.buy_score.score) }}>
                      {analysis.buy_score.level}
                    </div>
                    <p className="score-recommendation">{analysis.buy_score.recommendation}</p>

                    {analysis.buy_score.breakdown && (
                      <div className="score-breakdown">
                        <div className="breakdown-bar">
                          <span>Price</span>
                          <div className="bar">
                            <div className="fill" style={{ width: `${(analysis.buy_score.breakdown.price_competitiveness / 40) * 100}%` }}></div>
                          </div>
                          <span>{analysis.buy_score.breakdown.price_competitiveness}/40</span>
                        </div>
                        <div className="breakdown-bar">
                          <span>Timing</span>
                          <div className="bar">
                            <div className="fill" style={{ width: `${(analysis.buy_score.breakdown.booking_timing / 30) * 100}%` }}></div>
                          </div>
                          <span>{analysis.buy_score.breakdown.booking_timing}/30</span>
                        </div>
                        <div className="breakdown-bar">
                          <span>Risk</span>
                          <div className="bar">
                            <div className="fill" style={{ width: `${(analysis.buy_score.breakdown.volatility_risk / 20) * 100}%` }}></div>
                          </div>
                          <span>{analysis.buy_score.breakdown.volatility_risk}/20</span>
                        </div>
                        <div className="breakdown-bar">
                          <span>Deal</span>
                          <div className="bar">
                            <div className="fill" style={{ width: `${(analysis.buy_score.breakdown.deal_quality / 10) * 100}%` }}></div>
                          </div>
                          <span>{analysis.buy_score.breakdown.deal_quality}/10</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Optimal Booking Time */}
              {analysis.optimal_booking && !analysis.optimal_booking.error && (
                <div className="result-section">
                  <h3>🕐 Optimal Booking Time</h3>
                  <div className="optimal-booking">
                    {analysis.optimal_booking.optimal_days && (
                      <>
                        <div className="optimal-info">
                          <div className="info-item">
                            <span className="label">Current Price</span>
                            <span className="value">{formatPrice(analysis.optimal_booking.current_price)}</span>
                          </div>
                          <div className="info-item">
                            <span className="label">Best Time to Book</span>
                            <span className="value">
                              {analysis.optimal_booking.days_from_now === 0 ? 'TODAY' : `${analysis.optimal_booking.days_from_now} days from now`}
                            </span>
                          </div>
                          <div className="info-item">
                            <span className="label">Optimal Date</span>
                            <span className="value">{analysis.optimal_booking.optimal_date}</span>
                          </div>
                          <div className="info-item highlight">
                            <span className="label">Potential Savings</span>
                            <span className="value savings">
                              {formatPrice(analysis.optimal_booking.savings_vs_now)} ({analysis.optimal_booking.savings_percent})
                            </span>
                          </div>
                        </div>
                        <div className="optimal-recommendation">
                          {analysis.optimal_booking.recommendation}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Deal Alert */}
              {analysis.deal_alert && (
                <div className="result-section">
                  <h3>🎯 Deal Quality</h3>
                  <div className="price-trend">
                    <span className="trend-icon">{analysis.deal_alert.emoji}</span>
                    <div className="trend-info">
                      <span className="trend-label">{analysis.deal_alert.quality}</span>
                      <p className="trend-advice">{analysis.deal_alert.message}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Volatility */}
              <div className="result-section">
                <h3>📈 Price Volatility</h3>
                <div className="volatility">
                  <div className="volatility-level">
                    Level: <strong>{analysis.volatility.level}</strong>
                  </div>
                  {analysis.volatility.advice && (
                    <p className="volatility-advice">{analysis.volatility.advice}</p>
                  )}
                  {analysis.volatility.coefficient_variation && (
                    <div className="volatility-stats">
                      <span>CV: {analysis.volatility.coefficient_variation}</span>
                      {analysis.volatility.data_points && (
                        <span>Based on {analysis.volatility.data_points} flights</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Confidence */}
              <div className="result-section">
                <h3>🎯 Prediction Confidence</h3>
                <div className="confidence">
                  <div className="confidence-badge">
                    <span className="confidence-level">{analysis.confidence.level}</span>
                    <span className="confidence-score">({analysis.confidence.score}/100)</span>
                  </div>
                  <p className="confidence-message">{analysis.confidence.message}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MLAnalysisModal;
