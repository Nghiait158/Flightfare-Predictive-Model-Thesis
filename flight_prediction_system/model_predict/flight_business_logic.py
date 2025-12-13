import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta


class PriceAnalyzer:
    """
    Analyzes historical price data to generate business insights.
    """
    
    def __init__(self, df: pd.DataFrame):
        """
        Initialize analyzer with historical data.
        
        Args:
            df: DataFrame with complete flight history
        """
        self.df = df
        self._calculate_route_statistics()
    
    def _calculate_route_statistics(self):
        """Pre-calculate route-level statistics for classification."""
        self.route_stats = self.df.groupby('route')['price'].agg([
            ('q1', lambda x: x.quantile(0.25)),
            ('q3', lambda x: x.quantile(0.75)),
            ('mean', 'mean'),
            ('median', 'median'),
            ('std', 'std')
        ]).to_dict('index')
    
    def get_price_trend(self, 
                       flight_instance: str, 
                       current_price: float,
                       predicted_price: float,
                       trend_label: str) -> Dict:
        """
        Determine price trend based on model predictions and historical data.
        
        Args:
            flight_instance: Unique flight identifier
            current_price: Current price
            predicted_price: Model's predicted future price
            trend_label: Model's trend classification
            
        Returns:
            Dictionary with trend information
        """
        # Calculate price change
        price_change = predicted_price - current_price
        price_change_pct = (price_change / current_price) * 100
        
        # Determine trend status
        if trend_label == 'Up' or price_change_pct > 3:
            status = "Increasing"
            recommendation = "Book soon - prices are rising"
            urgency = "high"
        elif trend_label == 'Down' or price_change_pct < -3:
            status = "Decreasing"
            recommendation = "Wait - prices may drop further"
            urgency = "low"
        else:
            status = "Stable"
            recommendation = "Prices are stable - book when convenient"
            urgency = "medium"
        
        return {
            'status': status,
            'direction': trend_label,
            'predicted_change': price_change,
            'predicted_change_pct': price_change_pct,
            'recommendation': recommendation,
            'urgency': urgency
        }
    
    def get_volatility_status(self, 
                             flight_instance: str,
                             current_date: datetime) -> Dict:
        """
        Calculate price volatility over trailing 14-day window.
        
        Args:
            flight_instance: Unique flight identifier
            current_date: Current snapshot date
            
        Returns:
            Dictionary with volatility information
        """
        # Get 14-day historical data
        mask = (
            (self.df['flight_instance'] == flight_instance) &
            (self.df['create_at'] <= current_date) &
            (self.df['create_at'] >= current_date - timedelta(days=14))
        )
        historical_prices = self.df[mask]['price']
        
        if len(historical_prices) < 3:
            return {
                'status': 'Unknown',
                'std': None,
                'cv': None,
                'recommendation': 'Insufficient data',
                'confidence': 'low'
            }
        
        # Calculate volatility metrics
        std = historical_prices.std()
        mean = historical_prices.mean()
        cv = (std / mean) * 100  # Coefficient of variation
        
        # Classify volatility
        if cv > 15:
            status = "High Volatility"
            recommendation = "Prices fluctuate significantly - book soon to lock in rate"
            confidence = "low"
        elif cv > 8:
            status = "Moderate Volatility"
            recommendation = "Some price variation - monitor for deals"
            confidence = "medium"
        else:
            status = "Low Volatility"
            recommendation = "Stable pricing - can wait for better timing"
            confidence = "high"
        
        return {
            'status': status,
            'std': std,
            'cv': cv,
            'recommendation': recommendation,
            'confidence': confidence
        }
    
    def classify_price(self, 
                      route: str, 
                      current_price: float) -> Dict:
        """
        Classify current price relative to historical route prices.
        
        Args:
            route: Route identifier
            current_price: Current price
            
        Returns:
            Dictionary with price classification
        """
        if route not in self.route_stats:
            return {
                'classification': 'Unknown',
                'percentile': None,
                'vs_mean': 0,
                'vs_median': 0,
                'recommendation': 'No historical data available'
            }
        
        stats = self.route_stats[route]
        q1 = stats['q1']
        q3 = stats['q3']
        mean = stats['mean']
        median = stats['median']
        
        # Calculate position
        vs_mean = ((current_price - mean) / mean) * 100
        vs_median = ((current_price - median) / median) * 100
        
        # Classify
        if current_price < q1 * 0.85:
            classification = "Deal Alert"
            recommendation = "🔥 Exceptional price - book immediately!"
            color = "green"
        elif current_price < q1:
            classification = "Cheap"
            recommendation = "Great price - strongly recommend booking"
            color = "green"
        elif current_price <= q3:
            classification = "Normal"
            recommendation = "Fair market price"
            color = "yellow"
        else:
            classification = "Expensive"
            recommendation = "Above average - consider waiting"
            color = "red"
        
        return {
            'classification': classification,
            'vs_mean_pct': vs_mean,
            'vs_median_pct': vs_median,
            'recommendation': recommendation,
            'color': color,
            'q1': q1,
            'q3': q3,
            'mean': mean
        }
    
    def calculate_buy_score(self,
                           price: float,
                           route_mean: float,
                           trend_is_up: bool,
                           days_to_departure: int,
                           volatility_cv: float,
                           confidence_score: float) -> Dict:
        """
        Calculate comprehensive buy score (0-100).
        Higher score = stronger buy recommendation.
        
        Formula:
        Score = w1*(Price Value) + w2*(Trend Penalty) + w3*(Urgency) + w4*(Confidence)
        
        Args:
            price: Current price
            route_mean: Historical mean price for route
            trend_is_up: Is price trending upward
            days_to_departure: Days until flight
            volatility_cv: Coefficient of variation
            confidence_score: Model confidence (0-100)
            
        Returns:
            Dictionary with buy score and breakdown
        """
        # Component 1: Price Value (0-35 points)
        # Lower price = higher score
        price_ratio = price / route_mean if route_mean > 0 else 1.0
        price_score = max(0, 35 * (2 - price_ratio))  # Best when price_ratio < 1
        
        # Component 2: Trend Factor (0-25 points)
        # Upward trend = buy now = higher score
        trend_score = 25 if trend_is_up else 10
        
        # Component 3: Urgency Factor (0-25 points)
        # Closer to departure = higher urgency
        if days_to_departure <= 7:
            urgency_score = 25
        elif days_to_departure <= 21:
            urgency_score = 20 - (days_to_departure - 7) * 0.7
        elif days_to_departure <= 60:
            urgency_score = 10
        else:
            urgency_score = 5
        
        # Component 4: Confidence Factor (0-15 points)
        # Higher model confidence = higher score
        confidence_component = (confidence_score / 100) * 15
        
        # Total score
        total_score = price_score + trend_score + urgency_score + confidence_component
        total_score = np.clip(total_score, 0, 100)
        
        # Recommendation based on score
        if total_score >= 80:
            recommendation = "STRONG BUY - Excellent deal, book now!"
            action = "book_now"
        elif total_score >= 60:
            recommendation = "BUY - Good opportunity"
            action = "book_soon"
        elif total_score >= 40:
            recommendation = "WAIT - Monitor for better opportunities"
            action = "monitor"
        else:
            recommendation = "WAIT - Not optimal timing"
            action = "wait"
        
        return {
            'total_score': round(total_score, 1),
            'breakdown': {
                'price_value': round(price_score, 1),
                'trend_factor': round(trend_score, 1),
                'urgency': round(urgency_score, 1),
                'confidence': round(confidence_component, 1)
            },
            'recommendation': recommendation,
            'action': action
        }
    
    def find_optimal_booking_time(self, route: str) -> Dict:
        """
        Analyze historical data to find optimal booking window.
        Finds the "sweet spot" - minimum average price vs days to departure.
        
        Args:
            route: Route identifier
            
        Returns:
            Dictionary with optimal booking window
        """
        # Filter data for this route
        route_data = self.df[self.df['route'] == route].copy()
        
        if len(route_data) < 50:
            return {
                'optimal_days': None,
                'optimal_range': None,
                'avg_price_at_optimal': None,
                'recommendation': 'Insufficient historical data'
            }
        
        # Group by days_to_departure and calculate average price
        booking_curve = route_data.groupby('days_to_departure').agg({
            'price': ['mean', 'median', 'count']
        }).reset_index()
        
        booking_curve.columns = ['days_to_departure', 'avg_price', 'median_price', 'count']
        
        # Filter to periods with sufficient data
        booking_curve = booking_curve[booking_curve['count'] >= 5]
        
        if len(booking_curve) == 0:
            return {
                'optimal_days': None,
                'optimal_range': None,
                'avg_price_at_optimal': None,
                'recommendation': 'Insufficient historical data'
            }
        
        # Find minimum average price
        optimal_idx = booking_curve['avg_price'].idxmin()
        optimal_row = booking_curve.loc[optimal_idx]
        
        optimal_days = int(optimal_row['days_to_departure'])
        optimal_price = optimal_row['avg_price']
        
        # Define optimal range (±7 days)
        optimal_range = (max(0, optimal_days - 7), optimal_days + 7)
        
        return {
            'optimal_days': optimal_days,
            'optimal_range': optimal_range,
            'avg_price_at_optimal': optimal_price,
            'recommendation': f"Best time to book: {optimal_days} days before departure",
            'price_curve': booking_curve.to_dict('records')
        }


def generate_comprehensive_insights(
    current_data: pd.Series,
    price_prediction: float,
    trend_prediction: str,
    confidence_score: float,
    analyzer: PriceAnalyzer
) -> Dict:
    """
    Generate comprehensive insights for a single flight option.
    
    Args:
        current_data: Series with current flight data
        price_prediction: Predicted future price
        trend_prediction: Predicted trend label
        confidence_score: Model confidence score
        analyzer: PriceAnalyzer instance
        
    Returns:
        Dictionary with all insights
    """
    flight_instance = current_data['flight_instance']
    route = current_data['route']
    current_price = current_data['price']
    create_at = current_data['create_at']
    days_to_departure = current_data['days_to_departure']
    
    # Get all insights
    trend_info = analyzer.get_price_trend(
        flight_instance, 
        current_price, 
        price_prediction,
        trend_prediction
    )
    
    volatility_info = analyzer.get_volatility_status(
        flight_instance,
        create_at
    )
    
    price_class = analyzer.classify_price(route, current_price)
    
    # Calculate buy score
    route_mean = price_class.get('mean', current_price)
    trend_is_up = trend_prediction == 'Up'
    volatility_cv = volatility_info.get('cv', 10) or 10
    
    buy_score_info = analyzer.calculate_buy_score(
        current_price,
        route_mean,
        trend_is_up,
        days_to_departure,
        volatility_cv,
        confidence_score
    )
    
    # Get optimal booking time
    optimal_booking = analyzer.find_optimal_booking_time(route)
    
    # Combine all insights
    insights = {
        'flight_info': {
            'flight_number': current_data['flight_number'],
            'route': route,
            'departure_airport': current_data['departure_airport'],
            'arrival_airport': current_data['arrival_airport'],
            'flight_date': current_data['flight_date'],
            'departure_time': current_data.get('departure_time'),
            'class': current_data['classes'],
            'current_price': current_price
        },
        'predictions': {
            'predicted_price': price_prediction,
            'confidence_score': confidence_score,
            'trend': trend_prediction
        },
        'analysis': {
            'trend': trend_info,
            'volatility': volatility_info,
            'price_classification': price_class,
            'buy_score': buy_score_info,
            'optimal_booking': optimal_booking
        },
        'recommendation': {
            'primary': buy_score_info['recommendation'],
            'action': buy_score_info['action'],
            'urgency': trend_info['urgency'],
            'confidence': volatility_info['confidence']
        }
    }
    
    return insights


if __name__ == "__main__":
    print("Business logic module loaded successfully!")