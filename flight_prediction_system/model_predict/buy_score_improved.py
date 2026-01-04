"""
Enhanced Buy Score Calculator with Advanced Logic
Improvements:
1. Dynamic booking window by route
2. Seasonal volatility adjustment
3. Multi-factor deal quality scoring
4. Interaction features
"""

import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any


class ImprovedBuyScoreCalculator:
    """
    Advanced buy score calculator with route-specific and seasonal adjustments
    """

    def __init__(self, route_stats: pd.DataFrame):
        """
        Initialize with route statistics

        Args:
            route_stats: DataFrame with route-airline-class statistics
        """
        self.route_stats = route_stats

        # High-traffic routes with more stable pricing
        self.high_traffic_routes = [
            'SGN_HAN', 'HAN_SGN',
            'SGN_DAD', 'DAD_SGN',
            'HAN_DAD', 'DAD_HAN'
        ]

        # Tourist routes with higher volatility
        self.tourist_routes = [
            'SGN_PQC', 'PQC_SGN',  # Phú Quốc
            'SGN_VCA', 'VCA_SGN',  # Vinh
            'HAN_DLI', 'DLI_HAN'   # Đà Lạt
        ]

        # High season months (Tết, Summer vacation)
        self.high_season_months = [1, 2, 6, 7, 8]  # Jan, Feb, Jun, Jul, Aug

        # Holiday months with price spikes
        self.holiday_months = {
            1: 1.3,   # Tết (30-50% increase)
            2: 1.2,   # Post-Tết
            4: 1.15,  # 30/4 holiday
            6: 1.1,   # Summer start
            7: 1.1,   # Summer peak
            8: 1.1,   # Summer end
            9: 1.15,  # 2/9 holiday
            12: 1.05  # Year-end
        }

    def calculate_buy_score(
        self,
        flight_info: Dict[str, Any],
        predicted_price: float,
        route: str,
        airline: str,
        flight_class: str
    ) -> Dict[str, Any]:
        """
        Calculate improved buy score with advanced factors

        Args:
            flight_info: Flight information dictionary
            predicted_price: ML predicted price
            route: Route code (e.g., 'SGN_HAN')
            airline: Airline code (e.g., 'VJ')
            flight_class: Flight class

        Returns:
            Dictionary with score, level, breakdown, and recommendation
        """
        days_to_flight = flight_info['days_to_flight']
        flight_date = pd.to_datetime(flight_info['flight_date'])
        month = flight_date.month

        # Get route statistics
        stats = self._get_route_stats(route, airline, flight_class)

        if stats is None:
            return self._default_score(days_to_flight)

        mean = stats['mean']
        std = stats['std']
        q1 = stats['q1']
        q3 = stats['q3']
        median = stats['median']

        scores = {}
        details = {}

        # ===================================================================
        # 1. PRICE COMPETITIVENESS (40 points) - Enhanced with percentile
        # ===================================================================
        price_ratio = predicted_price / mean if mean > 0 else 1.0
        percentile = self._calculate_percentile(predicted_price, stats)

        # More granular scoring
        if percentile < 20:  # Top 20% cheapest
            scores['price_competitiveness'] = 40
            details['price_level'] = 'Excellent - Top 20% cheapest'
        elif percentile < 40:  # Top 40%
            scores['price_competitiveness'] = 35
            details['price_level'] = 'Very Good - Below average'
        elif percentile < 60:  # Middle 20%
            scores['price_competitiveness'] = 28
            details['price_level'] = 'Good - Around median'
        elif percentile < 75:  # 60-75%
            scores['price_competitiveness'] = 20
            details['price_level'] = 'Fair - Slightly above average'
        elif percentile < 90:  # 75-90%
            scores['price_competitiveness'] = 12
            details['price_level'] = 'Above Average'
        else:  # Top 10% expensive
            scores['price_competitiveness'] = 5
            details['price_level'] = 'Expensive - Top 10%'

        details['price_ratio'] = price_ratio
        details['percentile'] = percentile

        # ===================================================================
        # 2. BOOKING TIMING (30 points) - Route-specific optimal windows
        # ===================================================================
        optimal_window = self._get_optimal_booking_window(route, mean, std)
        timing_score, timing_detail = self._calculate_timing_score(
            days_to_flight,
            optimal_window,
            route
        )
        scores['booking_timing'] = timing_score
        details['booking_timing'] = timing_detail
        details['optimal_window'] = optimal_window

        # ===================================================================
        # 3. VOLATILITY RISK (20 points) - Seasonal adjustment
        # ===================================================================
        base_volatility = std / mean if mean > 0 else 0.5
        seasonal_volatility = self._adjust_volatility_for_season(
            base_volatility,
            month,
            route
        )

        volatility_score, volatility_detail = self._calculate_volatility_score(
            seasonal_volatility
        )
        scores['volatility_risk'] = volatility_score
        details['volatility'] = {
            'base': base_volatility,
            'seasonal_adjusted': seasonal_volatility,
            'detail': volatility_detail
        }

        # ===================================================================
        # 4. DEAL QUALITY (10 points) - Multi-factor scoring
        # ===================================================================
        deal_score, deal_detail = self._calculate_deal_quality(
            predicted_price,
            stats,
            days_to_flight,
            optimal_window
        )
        scores['deal_quality'] = deal_score
        details['deal_quality'] = deal_detail

        # ===================================================================
        # 5. BONUS POINTS - Interaction effects
        # ===================================================================
        bonus_points = 0
        bonus_reasons = []

        # Bonus: Excellent price + Optimal timing
        if percentile < 25 and abs(days_to_flight - optimal_window) <= 7:
            bonus_points += 3
            bonus_reasons.append('Perfect combo: Great price at optimal time (+3)')

        # Bonus: Low volatility + Good price
        if seasonal_volatility < 0.15 and price_ratio < 0.95:
            bonus_points += 2
            bonus_reasons.append('Stable price + Good deal (+2)')

        # Penalty: High season + Late booking
        if month in self.high_season_months and days_to_flight < 21:
            bonus_points -= 3
            bonus_reasons.append('High season + Late booking (-3)')

        # Penalty: Tourist route + Weekend flight
        is_weekend = flight_date.dayofweek >= 5
        if route in self.tourist_routes and is_weekend:
            bonus_points -= 2
            bonus_reasons.append('Tourist route + Weekend (-2)')

        scores['bonus_adjustment'] = bonus_points
        details['bonus_reasons'] = bonus_reasons

        # ===================================================================
        # TOTAL SCORE CALCULATION
        # ===================================================================
        total_score = sum(scores.values())
        total_score = min(100, max(0, total_score))  # Cap at 0-100

        # Score interpretation
        if total_score >= 80:
            level = 'Excellent'
            recommendation = 'STRONG BUY - Exceptional deal, book immediately!'
            emoji = '🌟'
        elif total_score >= 65:
            level = 'Good'
            recommendation = 'BUY - Good opportunity, consider booking soon'
            emoji = '✅'
        elif total_score >= 50:
            level = 'Fair'
            recommendation = 'CONSIDER - Reasonable price, book if convenient'
            emoji = '👍'
        elif total_score >= 35:
            level = 'Medium'
            recommendation = 'HOLD - Monitor prices, may find better deals'
            emoji = '⏸️'
        else:
            level = 'Poor'
            recommendation = 'WAIT - Price likely to decrease, hold off'
            emoji = '⏳'

        return {
            'score': int(total_score),
            'level': level,
            'recommendation': recommendation,
            'emoji': emoji,
            'breakdown': {
                'price_competitiveness': scores['price_competitiveness'],
                'max_price': 40,
                'booking_timing': scores['booking_timing'],
                'max_timing': 30,
                'volatility_risk': scores['volatility_risk'],
                'max_volatility': 20,
                'deal_quality': scores['deal_quality'],
                'max_deal': 10,
                'bonus_adjustment': scores.get('bonus_adjustment', 0)
            },
            'factors': {
                'price_vs_mean': f'{((predicted_price - mean) / mean * 100):+.1f}%',
                'price_vs_median': f'{((predicted_price - median) / median * 100):+.1f}%',
                'volatility': f'{(seasonal_volatility * 100):.1f}%',
                'days_to_flight': days_to_flight,
                'optimal_window': optimal_window,
                'percentile': f'{percentile:.0f}th'
            },
            'details': details
        }

    def _get_route_stats(self, route: str, airline: str, flight_class: str) -> Dict:
        """Get statistics for route-airline-class combination"""
        stats = self.route_stats[
            (self.route_stats['route'] == route) &
            (self.route_stats['airline'] == airline) &
            (self.route_stats['classes'] == flight_class)
        ]

        if len(stats) == 0:
            # Fallback to route-class only
            stats = self.route_stats[
                (self.route_stats['route'] == route) &
                (self.route_stats['classes'] == flight_class)
            ]

        if len(stats) == 0:
            return None

        return stats.iloc[0].to_dict()

    def _calculate_percentile(self, price: float, stats: Dict) -> float:
        """
        Calculate price percentile (0-100)
        0 = cheapest ever, 100 = most expensive ever
        """
        min_price = stats.get('min', price * 0.7)
        max_price = stats.get('max', price * 1.5)

        if max_price == min_price:
            return 50.0

        percentile = ((price - min_price) / (max_price - min_price)) * 100
        return max(0, min(100, percentile))

    def _get_optimal_booking_window(self, route: str, mean: float, std: float) -> int:
        """
        Get optimal booking window based on route characteristics

        Returns: optimal days before flight
        """
        volatility = std / mean if mean > 0 else 0.15

        # Base optimal window
        if volatility > 0.25:
            # High volatility: book earlier
            optimal = 55
        elif volatility > 0.15:
            # Medium volatility
            optimal = 45
        else:
            # Low volatility: can wait
            optimal = 35

        # Route-specific adjustments
        if route in self.high_traffic_routes:
            # High-traffic routes: slightly shorter window
            optimal -= 5
        elif route in self.tourist_routes:
            # Tourist routes: book earlier
            optimal += 10

        return optimal

    def _calculate_timing_score(
        self,
        days_to_flight: int,
        optimal_window: int,
        route: str
    ) -> tuple:
        """
        Calculate booking timing score

        Returns: (score, detail_dict)
        """
        distance_from_optimal = abs(days_to_flight - optimal_window)

        # Perfect timing
        if distance_from_optimal <= 5:
            score = 30
            detail = f'Perfect timing! Within {optimal_window}±5 days window'
        # Very good timing
        elif distance_from_optimal <= 10:
            score = 28
            detail = f'Excellent timing! Close to optimal ({optimal_window} days)'
        # Good timing
        elif optimal_window - 15 <= days_to_flight <= optimal_window + 20:
            score = 24
            detail = f'Good timing window'
        # Acceptable
        elif 21 <= days_to_flight <= 90:
            score = 18
            detail = f'Acceptable timing'
        # Getting risky
        elif 14 <= days_to_flight <= 20:
            score = 12
            detail = f'Getting close to flight date'
        # Last minute
        elif 7 <= days_to_flight <= 13:
            score = 8
            detail = f'Last minute booking - prices usually higher'
        # Very last minute
        else:
            score = 5
            detail = f'Very late or very early booking'

        return score, detail

    def _adjust_volatility_for_season(
        self,
        base_volatility: float,
        month: int,
        route: str
    ) -> float:
        """
        Adjust volatility based on seasonal patterns

        High season = higher volatility (prices swing more)
        """
        # Seasonal multiplier
        seasonal_multiplier = self.holiday_months.get(month, 1.0)

        # Tourist route adjustment
        if route in self.tourist_routes and month in [6, 7, 8, 12]:
            seasonal_multiplier *= 1.1

        # Adjusted volatility
        adjusted = base_volatility * seasonal_multiplier

        return adjusted

    def _calculate_volatility_score(self, volatility: float) -> tuple:
        """
        Calculate volatility risk score

        Returns: (score, detail)
        """
        if volatility < 0.08:
            score = 20
            detail = 'Very stable prices - Low risk'
        elif volatility < 0.15:
            score = 17
            detail = 'Stable prices - Low to moderate risk'
        elif volatility < 0.22:
            score = 13
            detail = 'Moderate price swings - Medium risk'
        elif volatility < 0.30:
            score = 9
            detail = 'Volatile prices - Higher risk'
        else:
            score = 5
            detail = 'Highly volatile - Timing matters significantly'

        return score, detail

    def _calculate_deal_quality(
        self,
        price: float,
        stats: Dict,
        days_to_flight: int,
        optimal_window: int
    ) -> tuple:
        """
        Multi-factor deal quality assessment

        Returns: (score, detail_dict)
        """
        q1 = stats['q1']
        median = stats['median']
        mean = stats['mean']

        score = 0
        factors = []

        # Factor 1: Price position (0-5 points)
        if price < q1:
            score += 5
            factors.append('Below Q1 (top 25% cheapest)')
        elif price < median:
            score += 4
            factors.append('Below median')
        elif price < mean:
            score += 3
            factors.append('Below average')
        else:
            score += 1
            factors.append('Above average price')

        # Factor 2: Timing bonus (0-3 points)
        if abs(days_to_flight - optimal_window) <= 7:
            score += 3
            factors.append('Optimal booking timing')
        elif abs(days_to_flight - optimal_window) <= 15:
            score += 2
            factors.append('Good timing')
        else:
            score += 1
            factors.append('Timing could be better')

        # Factor 3: Price competitiveness (0-2 points)
        price_ratio = price / mean
        if price_ratio <= 0.85:
            score += 2
            factors.append('Exceptional value (15%+ below avg)')
        elif price_ratio <= 0.95:
            score += 1
            factors.append('Good value')

        score = min(10, score)  # Cap at 10

        return score, {
            'score': score,
            'factors': factors,
            'summary': ' + '.join(factors)
        }

    def _default_score(self, days_to_flight: int) -> Dict:
        """Return default score when no data available"""
        return {
            'score': 50,
            'level': 'Medium',
            'recommendation': 'HOLD - Limited data available for this route',
            'emoji': '⚠️',
            'breakdown': {
                'price_competitiveness': 20,
                'max_price': 40,
                'booking_timing': 15,
                'max_timing': 30,
                'volatility_risk': 10,
                'max_volatility': 20,
                'deal_quality': 5,
                'max_deal': 10,
                'bonus_adjustment': 0
            },
            'factors': {
                'insufficient_data': True,
                'days_to_flight': days_to_flight
            },
            'details': {
                'warning': 'Insufficient historical data for accurate scoring'
            }
        }


# ===================================================================
# TESTING & EXAMPLE USAGE
# ===================================================================
if __name__ == '__main__':
    import sys
    import io

    # Fix encoding for Windows console
    if sys.platform == 'win32':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

    sys.path.append('.')

    # Load route statistics
    route_stats = pd.read_parquet('deployment_package/route_statistics.parquet')

    # Initialize calculator
    calculator = ImprovedBuyScoreCalculator(route_stats)

    # Test case 1: Good price, optimal timing
    print("\n" + "="*80)
    print("TEST CASE 1: SGN-HAN, VJ, Economy, 45 days before, good price")
    print("="*80)

    flight_info_1 = {
        'flight_number': 'VJ156',
        'departure_airport': 'SGN',
        'arrival_airport': 'HAN',
        'flight_date': '2025-12-25',
        'classes': 'Eco',
        'days_to_flight': 45
    }

    predicted_price_1 = 1800000  # Below average

    result_1 = calculator.calculate_buy_score(
        flight_info_1,
        predicted_price_1,
        'SGN_HAN',
        'VJ',
        'Eco'
    )

    print(f"\nBuy Score: {result_1['score']}/100 {result_1['emoji']}")
    print(f"   Level: {result_1['level']}")
    print(f"   Recommendation: {result_1['recommendation']}")
    print(f"\nBreakdown:")
    for key, value in result_1['breakdown'].items():
        if not key.startswith('max_'):
            max_key = f"max_{key.split('_')[0] if '_' in key else key}"
            max_val = result_1['breakdown'].get(max_key, '')
            if max_val:
                print(f"   - {key}: {value}/{max_val}")
            else:
                print(f"   - {key}: {value}")

    print(f"\nFactors:")
    for key, value in result_1['factors'].items():
        print(f"   - {key}: {value}")

    if result_1['details'].get('bonus_reasons'):
        print(f"\nBonus/Penalty:")
        for reason in result_1['details']['bonus_reasons']:
            print(f"   - {reason}")

    # Test case 2: Expensive price, last minute
    print("\n" + "="*80)
    print("TEST CASE 2: SGN-HAN, VJ, Economy, 5 days before, high price")
    print("="*80)

    flight_info_2 = {
        'flight_number': 'VJ156',
        'departure_airport': 'SGN',
        'arrival_airport': 'HAN',
        'flight_date': '2025-02-15',  # Tết period
        'classes': 'Eco',
        'days_to_flight': 5
    }

    predicted_price_2 = 3200000  # High price

    result_2 = calculator.calculate_buy_score(
        flight_info_2,
        predicted_price_2,
        'SGN_HAN',
        'VJ',
        'Eco'
    )

    print(f"\nBuy Score: {result_2['score']}/100 {result_2['emoji']}")
    print(f"   Level: {result_2['level']}")
    print(f"   Recommendation: {result_2['recommendation']}")
    print(f"\nBreakdown:")
    for key, value in result_2['breakdown'].items():
        if not key.startswith('max_'):
            max_key = f"max_{key.split('_')[0] if '_' in key else key}"
            max_val = result_2['breakdown'].get(max_key, '')
            if max_val:
                print(f"   - {key}: {value}/{max_val}")
            else:
                print(f"   - {key}: {value}")

    print(f"\nFactors:")
    for key, value in result_2['factors'].items():
        print(f"   - {key}: {value}")

    if result_2['details'].get('bonus_reasons'):
        print(f"\nBonus/Penalty:")
        for reason in result_2['details']['bonus_reasons']:
            print(f"   - {reason}")

    print("\n" + "="*80)
    print("Testing completed!")
    print("="*80 + "\n")
