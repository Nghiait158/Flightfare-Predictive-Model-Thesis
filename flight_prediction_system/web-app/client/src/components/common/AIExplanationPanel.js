import React from 'react';
import './AIExplanationPanel.css';

/**
 * AI Explanation Panel Component
 *
 * Provides natural language explanations for ML predictions
 * Helps users understand why they got a certain buy score, price classification, etc.
 */
const AIExplanationPanel = ({ analysis }) => {
  if (!analysis) return null;

  /**
   * Generate smart explanations based on analysis data
   */
  const generateExplanations = () => {
    const {
      buy_score,
      classification,
      optimal_booking,
      price_trend,
      prediction,
      volatility
    } = analysis;

    const explanations = [];

    // ============================================
    // 1. PRICE COMPETITIVENESS EXPLANATION
    // ============================================
    if (buy_score && buy_score.breakdown) {
      const priceScore = buy_score.breakdown.price_competitiveness || 0;
      const maxPriceScore = buy_score.breakdown.max_price || 40;
      const priceVsMean = buy_score.factors?.price_vs_mean || '';

      if (priceScore >= 35) {
        explanations.push({
          type: 'positive',
          title: 'Giá cực kỳ tốt',
          text: `Giá vé này ${priceVsMean} so với mức trung bình của route, thuộc top 20-40% rẻ nhất. Đây là mức giá rất cạnh tranh!`
        });
      } else if (priceScore >= 25) {
        explanations.push({
          type: 'positive',
          title: 'Giá hợp lý',
          text: `Giá vé ${priceVsMean} so với trung bình. Đây là mức giá chấp nhận được cho route này.`
        });
      } else if (priceScore >= 15) {
        explanations.push({
          type: 'neutral',
          title: 'Giá cao hơn trung bình',
          text: `Giá vé ${priceVsMean} so với mức trung bình. Bạn có thể tìm thấy giá tốt hơn nếu linh hoạt về thời gian.`
        });
      } else {
        explanations.push({
          type: 'negative',
          title: 'Giá cao',
          text: `Giá vé ${priceVsMean} so với trung bình. Đây là mức giá khá cao, nên cân nhắc kỹ hoặc chờ thời điểm khác.`
        });
      }
    }

    // ============================================
    // 2. BOOKING TIMING EXPLANATION
    // ============================================
    if (optimal_booking && optimal_booking.status) {
      const status = optimal_booking.status;
      const daysToWait = optimal_booking.days_to_wait || 0;
      const savings = optimal_booking.savings_vs_now;
      const savingsPercent = optimal_booking.savings_percent;

      if (status === 'OPTIMAL') {
        explanations.push({
          type: 'positive',
          title: 'Thời điểm tối ưu',
          text: `Đây chính là thời điểm tốt nhất để đặt vé! Nếu chờ lâu hơn, giá có thể tăng lên.`
        });
      } else if (status === 'WAIT') {
        const savingsText = savings && savings > 0
          ? ` (tiết kiệm ~${savings.toLocaleString('vi-VN')} VND - ${savingsPercent})`
          : '';
        explanations.push({
          type: 'info',
          title: 'Nên chờ thêm',
          text: `AI dự đoán nếu đợi thêm ${daysToWait} ngày nữa, bạn có thể có được giá tốt hơn${savingsText}.`
        });
      } else if (status === 'BUY_NOW') {
        explanations.push({
          type: 'warning',
          title: 'Nên mua ngay',
          text: `Đã quá thời điểm tối ưu. Giá có thể tăng thêm nếu chờ lâu hơn. Nên đặt vé sớm để tránh giá cao hơn!`
        });
      }
    }

    // ============================================
    // 3. PRICE TREND EXPLANATION
    // ============================================
    if (price_trend && price_trend.direction) {
      const direction = price_trend.direction;
      const changePercent = price_trend.price_change_percent || 0;

      if (direction === 'UP' && changePercent > 3) {
        explanations.push({
          type: 'warning',
          title: 'Giá đang tăng',
          text: `AI dự đoán giá sẽ tăng ${Math.abs(changePercent).toFixed(1)}% trong 7-30 ngày tới. Nên đặt sớm để tránh giá cao hơn!`
        });
      } else if (direction === 'DOWN' && changePercent < -3) {
        explanations.push({
          type: 'info',
          title: 'Giá đang giảm',
          text: `AI dự đoán giá có thể giảm ${Math.abs(changePercent).toFixed(1)}% trong thời gian tới. Có thể chờ thêm để có giá tốt hơn.`
        });
      } else {
        explanations.push({
          type: 'neutral',
          title: 'Giá ổn định',
          text: `Giá vé khá ổn định trong thời gian tới (biến động <3%). Bạn có thể đặt bất cứ lúc nào thuận tiện.`
        });
      }
    }

    // ============================================
    // 4. VOLATILITY (PRICE STABILITY) EXPLANATION
    // ============================================
    if (volatility && buy_score) {
      const volatilityScore = buy_score.breakdown?.volatility_risk || 0;
      const volatilityPercent = buy_score.factors?.volatility || '';

      if (volatilityScore >= 17) {
        explanations.push({
          type: 'positive',
          title: 'Giá ổn định',
          text: `Giá của route này rất ổn định (độ dao động ${volatilityPercent}). An toàn khi đặt vé bất cứ lúc nào.`
        });
      } else if (volatilityScore >= 10) {
        explanations.push({
          type: 'neutral',
          title: 'Giá dao động vừa phải',
          text: `Giá có thể dao động khoảng ${volatilityPercent}. Nên theo dõi giá trong vài ngày trước khi quyết định.`
        });
      } else {
        explanations.push({
          type: 'warning',
          title: 'Giá dao động mạnh',
          text: `Route này có giá dao động cao (${volatilityPercent}). Thời điểm đặt vé rất quan trọng - nên đặt khi thấy giá tốt!`
        });
      }
    }

    // ============================================
    // 5. BONUS FACTORS (if available in improved version)
    // ============================================
    if (buy_score && buy_score.details && buy_score.details.bonus_reasons) {
      const bonusReasons = buy_score.details.bonus_reasons;
      if (bonusReasons.length > 0) {
        const bonusText = bonusReasons.join('. ');
        const bonusPoints = buy_score.breakdown.bonus_adjustment || 0;

        if (bonusPoints > 0) {
          explanations.push({
            type: 'positive',
            title: 'Điểm thưởng',
            text: `Bạn nhận thêm ${bonusPoints} điểm vì: ${bonusText}`
          });
        } else if (bonusPoints < 0) {
          explanations.push({
            type: 'warning',
            title: 'Lưu ý',
            text: `Giảm ${Math.abs(bonusPoints)} điểm vì: ${bonusText}`
          });
        }
      }
    }

    // ============================================
    // 6. CLASSIFICATION EXPLANATION
    // ============================================
    if (classification && classification.category) {
      const category = classification.category;
      const stats = classification.stats;

      if (category === 'Cheap' && stats) {
        const belowMedian = Math.abs(parseFloat(stats.predicted_vs_median));
        explanations.push({
          type: 'positive',
          title: 'Giá thuộc nhóm "Rẻ"',
          text: `Giá vé này thấp hơn ${belowMedian.toFixed(0)}% so với giá trung vị của route. Đây là deal rất tốt!`
        });
      } else if (category === 'Expensive' && stats) {
        const aboveMedian = Math.abs(parseFloat(stats.predicted_vs_median));
        explanations.push({
          type: 'neutral',
          title: 'Giá thuộc nhóm "Đắt"',
          text: `Giá vé cao hơn ${aboveMedian.toFixed(0)}% so với mức trung vị. ${classification.reason || ''}`
        });
      }
    }

    return explanations;
  };

  const explanations = generateExplanations();

  if (explanations.length === 0) {
    return null;
  }

  /**
   * Get border color based on explanation type
   */
  const getBorderColor = (type) => {
    switch (type) {
      case 'positive':
        return '#10b981';
      case 'negative':
        return '#ef4444';
      case 'warning':
        return '#f59e0b';
      case 'info':
        return '#3b82f6';
      case 'neutral':
      default:
        return '#9ca3af';
    }
  };

  return (
    <div className="ai-explanation-panel">
      <div className="ai-explanation-header">
        <h3>AI Giải Thích</h3>
        <p className="ai-subheader">
          Tại sao bạn nhận được Buy Score này?
        </p>
      </div>

      <div className="explanations-list">
        {explanations.map((explanation, index) => (
          <div
            key={index}
            className="explanation-item"
            style={{
              borderLeft: `4px solid ${getBorderColor(explanation.type)}`
            }}
          >
            <div className="explanation-content">
              <h4 className="explanation-title">
                {explanation.title}
              </h4>
              <p className="explanation-text">
                {explanation.text}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Buy Score Version Badge */}
      {analysis.buy_score && analysis.buy_score.version && (
        <div className="ai-version-badge">
          <small>
            {analysis.buy_score.version === 'improved' ? (
              <span className="version-improved">
                Improved AI Algorithm
              </span>
            ) : (
              <span className="version-standard">
                Standard Algorithm
              </span>
            )}
          </small>
        </div>
      )}
    </div>
  );
};

export default AIExplanationPanel;
