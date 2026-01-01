"""
Price Trend Prediction Module
Predicts whether flight prices will increase, decrease, or stay stable
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import warnings
warnings.filterwarnings('ignore')

class PriceTrendPredictor:
    """
    Predicts price trends using historical price patterns and statistical analysis
    """

    def __init__(self, route_stats_path: str, historical_data_path: str = None):
        """
        Initialize the price trend predictor

        Args:
            route_stats_path: Path to route statistics parquet file
            historical_data_path: Path to historical price data (optional)
        """
        self.route_stats = pd.read_parquet(route_stats_path)
        self.historical_data = None

        if historical_data_path:
            try:
                self.historical_data = pd.read_csv(historical_data_path)
                self.historical_data['date'] = pd.to_datetime(self.historical_data['date'])
            except:
                print("Warning: Could not load historical data. Using route stats only.")

    def predict_trend(
        self,
        route: str,
        class_name: str,
        current_price: float,
        days_to_flight: int,
        forecast_days: int = 30
    ) -> Dict:
        """
        Predict price trend for the next X days

        Args:
            route: Route code (e.g., "SGN-HAN")
            class_name: Flight class name
            current_price: Current predicted price
            days_to_flight: Days until flight departure
            forecast_days: Number of days to forecast

        Returns:
            Dictionary with trend prediction and analysis
        """

        # Get route statistics
        route_data = self.route_stats[self.route_stats['route'] == route]

        if route_data.empty:
            return self._default_trend_response(current_price)

        route_data = route_data.iloc[0]

        # Extract price statistics for this class
        avg_price = route_data.get(f'{class_name}_avg_price', current_price)
        std_price = route_data.get(f'{class_name}_std_price', current_price * 0.15)
        min_price = route_data.get(f'{class_name}_min_price', current_price * 0.8)
        max_price = route_data.get(f'{class_name}_max_price', current_price * 1.3)

        # Calculate volatility
        volatility = std_price / avg_price if avg_price > 0 else 0.15

        # Analyze booking window impact
        booking_window_factor = self._calculate_booking_window_factor(days_to_flight)

        # Calculate seasonal factor
        seasonal_factor = self._calculate_seasonal_factor(datetime.now())

        # Predict price change
        price_change_percent = self._calculate_price_change(
            current_price=current_price,
            avg_price=avg_price,
            volatility=volatility,
            booking_window_factor=booking_window_factor,
            seasonal_factor=seasonal_factor,
            days_to_flight=days_to_flight
        )

        # Calculate future price
        future_price = current_price * (1 + price_change_percent / 100)

        # Determine trend direction
        trend_info = self._determine_trend(
            price_change_percent=price_change_percent,
            volatility=volatility,
            days_to_flight=days_to_flight
        )

        # Calculate confidence
        confidence = self._calculate_trend_confidence(
            volatility=volatility,
            days_to_flight=days_to_flight,
            data_quality=1.0 if not route_data.empty else 0.5
        )

        return {
            "trend": trend_info["trend"],
            "direction": trend_info["direction"],
            "emoji": trend_info["emoji"],
            "price_change_percent": round(price_change_percent, 2),
            "current_price": int(current_price),
            "predicted_price": int(future_price),
            "forecast_days": forecast_days,
            "confidence": confidence["level"],
            "confidence_score": confidence["score"],
            "advice": trend_info["advice"],
            "factors": {
                "booking_window": booking_window_factor,
                "seasonal": seasonal_factor,
                "volatility": round(volatility, 3)
            }
        }

    def _calculate_booking_window_factor(self, days_to_flight: int) -> float:
        """
        Calculate how booking window affects price trend
        Prices typically increase as flight date approaches
        """
        if days_to_flight > 60:
            return -0.02  # Prices tend to be lower far in advance
        elif days_to_flight > 30:
            return 0.0    # Stable period
        elif days_to_flight > 14:
            return 0.03   # Start increasing
        elif days_to_flight > 7:
            return 0.08   # Rapid increase
        else:
            return 0.15   # Last minute surge

    def _calculate_seasonal_factor(self, date: datetime) -> float:
        """
        Calculate seasonal impact on prices
        """
        month = date.month

        # Peak seasons in Vietnam
        # Tết (Jan-Feb), Summer (Jun-Aug)
        if month in [1, 2, 7, 8]:
            return 0.10  # High demand season
        elif month in [6, 12]:
            return 0.05  # Moderate high demand
        elif month in [3, 4, 9, 10]:
            return 0.0   # Normal season
        else:
            return -0.05  # Low season

    def _calculate_price_change(
        self,
        current_price: float,
        avg_price: float,
        volatility: float,
        booking_window_factor: float,
        seasonal_factor: float,
        days_to_flight: int
    ) -> float:
        """
        Calculate predicted price change percentage
        """
        # Base change from booking window
        base_change = booking_window_factor * 100

        # Seasonal adjustment
        seasonal_change = seasonal_factor * 100

        # Price position adjustment (if current price is below average, likely to increase)
        price_position = (current_price - avg_price) / avg_price if avg_price > 0 else 0
        position_change = -price_position * 50  # If below average, positive change expected

        # Volatility dampening for far future
        time_dampening = max(0.3, 1 - (days_to_flight / 365))

        # Combine factors
        total_change = (base_change + seasonal_change + position_change) * time_dampening

        # Add some noise based on volatility
        noise = np.random.normal(0, volatility * 50)

        return np.clip(total_change + noise, -30, 30)  # Limit to ±30%

    def _determine_trend(
        self,
        price_change_percent: float,
        volatility: float,
        days_to_flight: int
    ) -> Dict:
        """
        Determine trend direction and generate advice
        """
        if price_change_percent > 5:
            return {
                "trend": "Tăng",
                "direction": "UP",
                "emoji": "📈",
                "advice": f"Giá dự đoán tăng {abs(price_change_percent):.1f}%. Nên mua vé sớm để có giá tốt!"
            }
        elif price_change_percent < -5:
            return {
                "trend": "Giảm",
                "direction": "DOWN",
                "emoji": "📉",
                "advice": f"Giá dự đoán giảm {abs(price_change_percent):.1f}%. Có thể chờ thêm để có giá tốt hơn."
            }
        else:
            return {
                "trend": "Ổn định",
                "direction": "STABLE",
                "emoji": "➡️",
                "advice": "Giá tương đối ổn định. Có thể mua vé bất cứ lúc nào."
            }

    def _calculate_trend_confidence(
        self,
        volatility: float,
        days_to_flight: int,
        data_quality: float
    ) -> Dict:
        """
        Calculate confidence in trend prediction
        """
        # Lower volatility = higher confidence
        volatility_confidence = max(0, 1 - volatility * 2)

        # Closer to flight = lower confidence (more unpredictable)
        time_confidence = min(1.0, days_to_flight / 90)

        # Combine factors
        overall_confidence = (volatility_confidence * 0.4 +
                            time_confidence * 0.3 +
                            data_quality * 0.3)

        score = int(overall_confidence * 100)

        if score >= 75:
            level = "High"
        elif score >= 50:
            level = "Medium"
        else:
            level = "Low"

        return {
            "level": level,
            "score": score
        }

    def _default_trend_response(self, current_price: float) -> Dict:
        """
        Return default response when no data available
        """
        return {
            "trend": "Không đủ dữ liệu",
            "direction": "UNKNOWN",
            "emoji": "❓",
            "price_change_percent": 0.0,
            "current_price": int(current_price),
            "predicted_price": int(current_price),
            "forecast_days": 30,
            "confidence": "Low",
            "confidence_score": 30,
            "advice": "Không có đủ dữ liệu lịch sử để dự đoán xu hướng giá.",
            "factors": {
                "booking_window": 0.0,
                "seasonal": 0.0,
                "volatility": 0.15
            }
        }


# Test function
if __name__ == "__main__":
    # Example usage
    predictor = PriceTrendPredictor(
        route_stats_path="deployment_package/route_statistics.parquet"
    )

    result = predictor.predict_trend(
        route="SGN-HAN",
        class_name="Eco",
        current_price=2000000,
        days_to_flight=45,
        forecast_days=30
    )

    print("Price Trend Prediction:")
    print(f"Trend: {result['trend']} {result['emoji']}")
    print(f"Current Price: {result['current_price']:,} VND")
    print(f"Predicted Price: {result['predicted_price']:,} VND")
    print(f"Change: {result['price_change_percent']:.1f}%")
    print(f"Confidence: {result['confidence']} ({result['confidence_score']}/100)")
    print(f"Advice: {result['advice']}")
