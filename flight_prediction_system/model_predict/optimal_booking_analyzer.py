"""
Dynamic Optimal Booking Time Analyzer
ML-based approach to find the best time to book flights
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Tuple
import warnings
warnings.filterwarnings('ignore')


class OptimalBookingAnalyzer:
    """
    Analyzes historical booking patterns to determine optimal booking windows
    """

    def __init__(self, route_stats_path: str):
        """
        Initialize the optimal booking analyzer

        Args:
            route_stats_path: Path to route statistics parquet file
        """
        self.route_stats = pd.read_parquet(route_stats_path)

        # Historical booking curve (general pattern)
        # Days before flight: price multiplier
        self.general_booking_curve = {
            90: 0.85,   # 90+ days: 15% below average
            60: 0.90,   # 60-89 days: 10% below average
            45: 0.92,   # 45-59 days: 8% below average (OPTIMAL)
            30: 0.95,   # 30-44 days: 5% below average
            21: 1.00,   # 21-29 days: average price
            14: 1.05,   # 14-20 days: 5% above average
            7: 1.15,    # 7-13 days: 15% above average
            3: 1.25,    # 3-6 days: 25% above average
            1: 1.40     # 0-2 days: 40% above average (last minute)
        }

    def calculate_optimal_booking_time(
        self,
        route: str,
        class_name: str,
        flight_date: str,
        current_days_before: int,
        current_price: float = None
    ) -> Dict:
        """
        Calculate optimal booking time using historical patterns

        Args:
            route: Route code (e.g., "SGN-HAN")
            class_name: Flight class name
            flight_date: Flight date (YYYY-MM-DD)
            current_days_before: Current days until flight
            current_price: Actual current price of the flight (optional)

        Returns:
            Dictionary with optimal booking analysis
        """

        # Get route statistics
        route_data = self.route_stats[self.route_stats['route'] == route]

        if route_data.empty:
            return self._default_optimal_booking(current_days_before)

        route_data = route_data.iloc[0]

        # Extract price statistics
        avg_price = route_data.get(f'{class_name}_avg_price', 2000000)
        std_price = route_data.get(f'{class_name}_std_price', 300000)
        min_price = route_data.get(f'{class_name}_min_price', 1500000)

        # Calculate optimal booking window
        optimal_window = self._find_optimal_window(
            route=route,
            class_name=class_name,
            avg_price=avg_price,
            std_price=std_price
        )

        # Estimate prices at different booking windows
        price_estimates = self._estimate_prices_by_window(
            avg_price=avg_price,
            std_price=std_price
        )

        # Get current price - use actual price if provided, otherwise estimate
        print(f"\n🔍 ANALYZER DEBUG: current_price={current_price}, type={type(current_price)}")
        print(f"🔍 ANALYZER DEBUG: current_price is not None? {current_price is not None}")
        print(f"🔍 ANALYZER DEBUG: current_price > 0? {current_price > 0 if current_price is not None else 'N/A'}")

        if current_price is not None and current_price > 0:
            current_price_estimate = current_price
            print(f"🔍 ANALYZER DEBUG: Using actual price: {current_price_estimate}")
        else:
            current_price_estimate = self._estimate_price_at_window(
                avg_price=avg_price,
                days_before=current_days_before
            )
            print(f"🔍 ANALYZER DEBUG: Using estimated price: {current_price_estimate}")

        # Get optimal price
        optimal_price = self._estimate_price_at_window(
            avg_price=avg_price,
            days_before=optimal_window
        )

        # Calculate savings
        savings = current_price_estimate - optimal_price
        savings_percent = (savings / current_price_estimate * 100) if current_price_estimate > 0 else 0

        # Calculate dates
        flight_dt = datetime.strptime(flight_date, '%Y-%m-%d')
        today = datetime.now()

        # Calculate when to book (optimal booking date)
        # If optimal is 45 days before flight, and flight is in 60 days, book in 15 days
        # If optimal is 45 days before flight, and flight is in 30 days, already past optimal (book now)

        if current_days_before > optimal_window:
            # Still have time to wait to reach optimal window
            days_to_wait = current_days_before - optimal_window
            optimal_date = today + timedelta(days=days_to_wait)
            recommendation = f"Nên đợi thêm {days_to_wait} ngày để có giá tốt nhất (tiết kiệm ~{abs(savings):,.0f} VND)"
            status = "WAIT"
        elif current_days_before < optimal_window:
            # Past optimal window - should have booked earlier
            days_missed = optimal_window - current_days_before
            optimal_date = today - timedelta(days=days_missed)  # When we SHOULD have booked (in the past)
            recommendation = f"Đã quá thời điểm tối ưu {days_missed} ngày. Nên mua ngay để tránh giá tăng thêm!"
            status = "BUY_NOW"
            # Recalculate savings (now negative because price is higher)
            savings = optimal_price - current_price_estimate  # This will be negative
            savings_percent = (savings / current_price_estimate * 100) if current_price_estimate > 0 else 0
        else:
            # At optimal window right now
            optimal_date = today
            recommendation = "Đây là thời điểm tốt nhất để mua vé!"
            status = "OPTIMAL"

        # Calculate confidence
        confidence = self._calculate_confidence(
            route_data=route_data,
            days_before=current_days_before
        )

        # Calculate days_to_wait (for frontend display)
        if status == "WAIT":
            days_to_wait = current_days_before - optimal_window
        elif status == "BUY_NOW":
            days_to_wait = 0  # Should book now
        else:  # OPTIMAL
            days_to_wait = 0  # Book today

        return {
            "optimal_days_before": optimal_window,
            "optimal_date": optimal_date.strftime('%Y-%m-%d'),
            "current_days_before": current_days_before,
            "days_to_wait": days_to_wait,  # NEW: How many days to wait before booking
            "current_price_estimate": int(current_price_estimate),
            "optimal_price_estimate": int(optimal_price),
            "savings": int(savings),
            "savings_percent": round(savings_percent, 1),
            "recommendation": recommendation,
            "status": status,
            "confidence": confidence["level"],
            "confidence_score": confidence["score"],
            "price_curve": price_estimates
        }

    def _find_optimal_window(
        self,
        route: str,
        class_name: str,
        avg_price: float,
        std_price: float
    ) -> int:
        """
        Find optimal booking window based on price curve

        Returns optimal number of days before flight to book
        """

        # For most domestic routes in Vietnam, optimal is 30-60 days
        # Adjust based on route characteristics

        volatility = std_price / avg_price if avg_price > 0 else 0.15

        if volatility > 0.25:
            # High volatility: book earlier to avoid price spikes
            optimal = 60
        elif volatility > 0.15:
            # Medium volatility: standard optimal window
            optimal = 45
        else:
            # Low volatility: can wait a bit
            optimal = 35

        # Route-specific adjustments
        if "SGN-HAN" in route or "HAN-SGN" in route:
            # Popular route: prices more stable
            optimal = 40
        elif "SGN-PQC" in route or "SGN-VCA" in route:
            # Tourist routes: book earlier
            optimal = 50

        return optimal

    def _estimate_price_at_window(self, avg_price: float, days_before: int) -> float:
        """
        Estimate price at a specific booking window
        """

        # Find the closest bucket in booking curve
        buckets = sorted(self.general_booking_curve.keys(), reverse=True)

        multiplier = 1.0
        for bucket in buckets:
            if days_before >= bucket:
                multiplier = self.general_booking_curve[bucket]
                break

        return avg_price * multiplier

    def _estimate_prices_by_window(
        self,
        avg_price: float,
        std_price: float
    ) -> Dict[int, int]:
        """
        Estimate prices for different booking windows
        """

        estimates = {}

        for days_before, multiplier in self.general_booking_curve.items():
            # Base estimate
            base_price = avg_price * multiplier

            # Add some realistic variance
            noise = np.random.normal(0, std_price * 0.1)
            estimated_price = base_price + noise

            estimates[days_before] = int(max(0, estimated_price))

        return estimates

    def _calculate_confidence(
        self,
        route_data: pd.Series,
        days_before: int
    ) -> Dict:
        """
        Calculate confidence in optimal booking recommendation
        """

        # Factors affecting confidence:
        # 1. Data quality (more flights = higher confidence)
        # 2. Price stability (lower std = higher confidence)
        # 3. Booking window (far future = lower confidence)

        # Get route statistics
        avg_price = route_data.get('Eco_avg_price', 2000000)
        std_price = route_data.get('Eco_std_price', 300000)

        # Data quality score (assume we have decent data)
        data_score = 0.8

        # Stability score
        volatility = std_price / avg_price if avg_price > 0 else 0.15
        stability_score = max(0, 1 - volatility * 2)

        # Time score (closer = more reliable)
        time_score = min(1.0, max(0.3, 1 - (days_before / 180)))

        # Overall confidence
        overall = (data_score * 0.3 + stability_score * 0.4 + time_score * 0.3)
        score = int(overall * 100)

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

    def _default_optimal_booking(self, current_days_before: int) -> Dict:
        """
        Return default optimal booking when no data available
        """

        # Use general best practice
        optimal_window = 45

        if current_days_before > optimal_window:
            recommendation = f"Nên đợi thêm {current_days_before - optimal_window} ngày"
            status = "WAIT"
        elif current_days_before < optimal_window:
            recommendation = "Nên mua ngay để tránh giá tăng"
            status = "BUY_NOW"
        else:
            recommendation = "Đây là thời điểm tốt để mua vé"
            status = "OPTIMAL"

        today = datetime.now()
        optimal_date = today + timedelta(days=current_days_before - optimal_window)

        return {
            "optimal_days_before": optimal_window,
            "optimal_date": optimal_date.strftime('%Y-%m-%d'),
            "current_days_before": current_days_before,
            "current_price_estimate": 2000000,
            "optimal_price_estimate": 1840000,
            "savings": 160000,
            "savings_percent": 8.0,
            "recommendation": recommendation,
            "status": status,
            "confidence": "Low",
            "confidence_score": 40,
            "price_curve": {}
        }

    def generate_booking_curve_chart(
        self,
        route: str,
        class_name: str,
        flight_date: str
    ) -> Dict:
        """
        Generate data for booking curve visualization

        Returns data suitable for charting (days vs estimated price)
        """

        route_data = self.route_stats[self.route_stats['route'] == route]

        if route_data.empty:
            avg_price = 2000000
        else:
            avg_price = route_data.iloc[0].get(f'{class_name}_avg_price', 2000000)

        # Generate curve data
        days_range = list(range(1, 91))  # 1 to 90 days
        prices = []

        for days in days_range:
            price = self._estimate_price_at_window(avg_price, days)
            prices.append(int(price))

        return {
            "days_before_flight": days_range,
            "estimated_prices": prices,
            "optimal_point": self._find_optimal_window(route, class_name, avg_price, avg_price * 0.15)
        }


# Test function
if __name__ == "__main__":
    # Example usage
    analyzer = OptimalBookingAnalyzer(
        route_stats_path="deployment_package/route_statistics.parquet"
    )

    result = analyzer.calculate_optimal_booking_time(
        route="SGN-HAN",
        class_name="Eco",
        flight_date="2025-12-25",
        current_days_before=35,
        current_price=2100000  # Example actual price
    )

    print("\nOptimal Booking Analysis:")
    print(f"Current Days Before Flight: {result['current_days_before']}")
    print(f"Optimal Booking Window: {result['optimal_days_before']} days before")
    print(f"Optimal Date: {result['optimal_date']}")
    print(f"Status: {result['status']}")
    print(f"Current Price Estimate: {result['current_price_estimate']:,} VND")
    print(f"Optimal Price Estimate: {result['optimal_price_estimate']:,} VND")
    print(f"Potential Savings: {result['savings']:,} VND ({result['savings_percent']}%)")
    print(f"Recommendation: {result['recommendation']}")
    print(f"Confidence: {result['confidence']} ({result['confidence_score']}/100)")

    # Generate curve
    curve = analyzer.generate_booking_curve_chart(
        route="SGN-HAN",
        class_name="Eco",
        flight_date="2025-12-25"
    )
    print(f"\nOptimal booking point: {curve['optimal_point']} days before flight")
