import React, { useState, useEffect } from 'react';
import './AnimatedBuyScore.css';

/**
 * Animated Buy Score Component
 *
 * Features:
 * - Animated circular progress bar
 * - Score counts up from 0 to actual value
 * - Color changes based on score level
 * - Breakdown bars with animation
 * - Responsive design
 */
const AnimatedBuyScore = ({ buyScoreData }) => {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [animatedBreakdown, setAnimatedBreakdown] = useState({
    price_competitiveness: 0,
    booking_timing: 0,
    volatility_risk: 0,
    deal_quality: 0,
    bonus_adjustment: 0
  });

  const actualScore = buyScoreData?.score || 0;
  const breakdown = buyScoreData?.breakdown || {};
  const level = buyScoreData?.level || 'Medium';
  const recommendation = buyScoreData?.recommendation || '';

  // Animate score on mount and when score changes
  useEffect(() => {
    if (actualScore === 0) return;

    let currentScore = 0;
    const increment = actualScore / 50; // 50 steps
    const duration = 1500; // 1.5 seconds total
    const stepDuration = duration / 50;

    const timer = setInterval(() => {
      currentScore += increment;
      if (currentScore >= actualScore) {
        setAnimatedScore(actualScore);
        clearInterval(timer);
      } else {
        setAnimatedScore(Math.floor(currentScore));
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [actualScore]);

  // Animate breakdown bars
  useEffect(() => {
    if (!breakdown) return;

    const keys = Object.keys(breakdown).filter(k => !k.startsWith('max_'));
    let step = 0;
    const totalSteps = 30;
    const stepDuration = 1200 / totalSteps; // 1.2 seconds total

    const timer = setInterval(() => {
      step++;
      const progress = step / totalSteps;

      const newBreakdown = {};
      keys.forEach(key => {
        const targetValue = breakdown[key] || 0;
        newBreakdown[key] = Math.floor(targetValue * progress);
      });

      setAnimatedBreakdown(newBreakdown);

      if (step >= totalSteps) {
        clearInterval(timer);
        // Set final values
        const finalBreakdown = {};
        keys.forEach(key => {
          finalBreakdown[key] = breakdown[key] || 0;
        });
        setAnimatedBreakdown(finalBreakdown);
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [breakdown]);

  /**
   * Get color based on score
   */
  const getScoreColor = () => {
    if (actualScore >= 80) return '#10b981'; // Green - Excellent
    if (actualScore >= 65) return '#3b82f6'; // Blue - Good
    if (actualScore >= 50) return '#8b5cf6'; // Purple - Fair
    if (actualScore >= 35) return '#f59e0b'; // Amber - Medium
    return '#ef4444'; // Red - Poor
  };

  /**
   * Get color class for text
   */
  const getScoreColorClass = () => {
    if (actualScore >= 80) return 'score-excellent';
    if (actualScore >= 65) return 'score-good';
    if (actualScore >= 50) return 'score-fair';
    if (actualScore >= 35) return 'score-medium';
    return 'score-poor';
  };

  /**
   * Get label for breakdown items
   */
  const getBreakdownLabel = (key) => {
    const labels = {
      price_competitiveness: 'Giá cạnh tranh',
      booking_timing: 'Thời điểm đặt vé',
      volatility_risk: 'Độ ổn định giá',
      deal_quality: 'Chất lượng deal',
      bonus_adjustment: 'Điểm thưởng/Phạt'
    };
    return labels[key] || key;
  };

  /**
   * Calculate circle progress path
   */
  const getCircleProgress = () => {
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    const progress = (animatedScore / 100) * circumference;
    const offset = circumference - progress;

    return {
      circumference,
      offset
    };
  };

  const circleProps = getCircleProgress();
  const scoreColor = getScoreColor();

  return (
    <div className="animated-buy-score">
      <div className="score-container">
        {/* Circular Progress */}
        <div className="score-circle-wrapper">
          <svg
            className="score-circle-svg"
            width="200"
            height="200"
            viewBox="0 0 200 200"
          >
            {/* Background circle */}
            <circle
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="12"
            />
            {/* Progress circle */}
            <circle
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke={scoreColor}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circleProps.circumference}
              strokeDashoffset={circleProps.offset}
              transform="rotate(-90 100 100)"
              className="score-progress-circle"
            />
          </svg>

          {/* Score text in center */}
          <div className="score-center">
            <div className="score-value">
              <span className={`score-number ${getScoreColorClass()}`}>
                {animatedScore}
              </span>
              <span className="score-max">/100</span>
            </div>
          </div>
        </div>

        {/* Score details */}
        <div className="score-details">
          <div className={`score-level ${getScoreColorClass()}`}>
            {level}
          </div>
          <p className="score-recommendation">{recommendation}</p>

          {/* Version badge if available */}
          {buyScoreData?.version && (
            <div className="score-version">
              {buyScoreData.version === 'improved' ? (
                <span className="badge-improved">AI Nâng cao</span>
              ) : (
                <span className="badge-standard">Standard</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Breakdown bars */}
      {breakdown && (
        <div className="score-breakdown">
          <h4 className="breakdown-title">Chi tiết điểm</h4>

          <div className="breakdown-bars">
            {Object.entries(breakdown)
              .filter(([key]) => !key.startsWith('max_'))
              .map(([key, value]) => {
                const maxKey = `max_${key.split('_')[0]}`;
                const maxValue = breakdown[maxKey] || value;
                const animatedValue = animatedBreakdown[key] || 0;
                const percentage = maxValue > 0 ? (animatedValue / maxValue) * 100 : 0;

                // Don't show bonus if it's 0
                if (key === 'bonus_adjustment' && value === 0) {
                  return null;
                }

                return (
                  <div key={key} className="breakdown-item">
                    <div className="breakdown-header">
                      <span className="breakdown-label">
                        {getBreakdownLabel(key)}
                      </span>
                      <span className="breakdown-score">
                        {animatedValue}
                        <span className="breakdown-max">/{maxValue}</span>
                      </span>
                    </div>
                    <div className="breakdown-bar-container">
                      <div
                        className="breakdown-bar-fill"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: scoreColor,
                          transition: 'width 0.3s ease-out'
                        }}
                      >
                        <div className="breakdown-bar-shine"></div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Factors display */}
      {buyScoreData?.factors && (
        <div className="score-factors">
          <h4 className="factors-title">Các yếu tố</h4>
          <div className="factors-grid">
            {Object.entries(buyScoreData.factors).map(([key, value]) => (
              <div key={key} className="factor-item">
                <span className="factor-label">
                  {key.replace(/_/g, ' ')}:
                </span>
                <span className="factor-value">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnimatedBuyScore;
