# -*- coding: utf-8 -*-
"""
Comprehensive Flight Analysis Module
Provides additional analysis methods on top of FlightIntelligenceEngine
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Any


class ComprehensiveFlightAnalysis:
    """Comprehensive analysis wrapper for FlightIntelligenceEngine"""
    
    def __init__(self, engine):
        """
        Initialize with a FlightIntelligenceEngine instance
        
        Args:
            engine: FlightIntelligenceEngine instance
        """
        self.engine = engine
    
    def check_deal_alert(self, flight_info: Dict[str, Any], 
                         predicted_price: float, 
                         actual_price: float = None) -> Dict[str, Any]:
        """
        Check if the price is a good deal
        
        Args:
            flight_info: Flight information dictionary
            predicted_price: Predicted price
            actual_price: Actual price (if available)
            
        Returns:
            Dict with deal quality information
        """
        route = f"{flight_info['departure_airport']}_{flight_info['arrival_airport']}"
        airline = self.engine._extract_airline(flight_info.get('flight_number', ''))
        flight_class = flight_info['classes']
        
        # Get price classification
        classification = self.engine.classify_price(
            predicted_price, route, airline, flight_class
        )
        
        # Determine deal quality based on actual vs predicted
        if actual_price is not None:
            price_diff = actual_price - predicted_price
            price_diff_pct = (price_diff / predicted_price * 100) if predicted_price > 0 else 0
            
            if price_diff_pct < -15:
                deal_quality = "🔥 AMAZING DEAL!"
                emoji = "🔥"
                message = f"Price is {abs(price_diff_pct):.1f}% BELOW prediction! Book now!"
            elif price_diff_pct < -5:
                deal_quality = "✨ Great Deal"
                emoji = "✨"
                message = f"Price is {abs(price_diff_pct):.1f}% below prediction. Good opportunity!"
            elif price_diff_pct < 5:
                deal_quality = "✅ Fair Price"
                emoji = "✅"
                message = "Price matches prediction well."
            elif price_diff_pct < 15:
                deal_quality = "⚠️ Above Average"
                emoji = "⚠️"
                message = f"Price is {price_diff_pct:.1f}% above prediction. Consider waiting."
            else:
                deal_quality = "❌ Expensive"
                emoji = "❌"
                message = f"Price is {price_diff_pct:.1f}% ABOVE prediction. Wait for better prices."
        else:
            # Use classification if no actual price
            if classification['category'] == 'Cheap':
                deal_quality = "✨ Great Deal"
                emoji = "✨"
                message = "Predicted price is below average. Good opportunity!"
            elif classification['category'] == 'Normal':
                deal_quality = "✅ Fair Price"
                emoji = "✅"
                message = "Predicted price is within normal range."
            else:  # Expensive
                deal_quality = "⚠️ Above Average"
                emoji = "⚠️"
                message = "Predicted price is above average. Consider waiting."
        
        return {
            'deal_quality': deal_quality,
            'emoji': emoji,
            'message': message,
            'classification': classification
        }
    
    def calculate_price_trend(self, flight_info: Dict[str, Any], 
                             days_forecast: int = 30) -> Dict[str, Any]:
        """
        Calculate price trend for upcoming days
        
        Args:
            flight_info: Flight information dictionary
            days_forecast: Number of days to forecast
            
        Returns:
            Dict with price trend information
        """
        current_days = flight_info['days_to_flight']
        
        if current_days <= days_forecast:
            # Can't forecast that far
            days_to_test = range(max(1, current_days - 7), current_days + 1)
        else:
            # Test from now to days_forecast days before flight
            days_to_test = range(max(1, current_days - days_forecast), current_days + 1, 3)
        
        predictions = []
        for days in days_to_test:
            test_info = flight_info.copy()
            test_info['days_to_flight'] = days
            try:
                price = self.engine.predict_price(test_info)
                predictions.append(price)
            except:
                continue
        
        if len(predictions) < 2:
            return {
                'trend': 'Unknown',
                'emoji': '❓',
                'advice': 'Insufficient data to determine trend',
                'predictions': []
            }
        
        # Calculate trend
        first_half = np.mean(predictions[:len(predictions)//2])
        second_half = np.mean(predictions[len(predictions)//2:])
        
        price_change = ((second_half - first_half) / first_half * 100) if first_half > 0 else 0
        
        if price_change < -5:
            trend = "Decreasing"
            emoji = "📉"
            advice = "Prices are trending down. Consider waiting a bit."
        elif price_change > 5:
            trend = "Increasing"
            emoji = "📈"
            advice = "Prices are trending up. Book soon to avoid higher prices!"
        else:
            trend = "Stable"
            emoji = "➡️"
            advice = "Prices are relatively stable. Book when convenient."
        
        return {
            'trend': trend,
            'emoji': emoji,
            'advice': advice,
            'price_change_pct': f'{price_change:+.1f}%',
            'predictions': predictions
        }
    
    def assess_price_confidence(self, flight_info: Dict[str, Any], 
                               predicted_price: float) -> Dict[str, Any]:
        """
        Assess confidence level in the prediction
        
        Args:
            flight_info: Flight information dictionary
            predicted_price: Predicted price
            
        Returns:
            Dict with confidence assessment
        """
        route = f"{flight_info['departure_airport']}_{flight_info['arrival_airport']}"
        airline = self.engine._extract_airline(flight_info.get('flight_number', ''))
        flight_class = flight_info['classes']
        
        # Get route statistics
        stats = self.engine.route_stats[
            (self.engine.route_stats['route'] == route) &
            (self.engine.route_stats['airline'] == airline) &
            (self.engine.route_stats['classes'] == flight_class)
        ]
        
        if len(stats) == 0:
            # Try without airline filter
            stats = self.engine.route_stats[
                (self.engine.route_stats['route'] == route) &
                (self.engine.route_stats['classes'] == flight_class)
            ]
        
        if len(stats) == 0:
            return {
                'confidence': 'Low',
                'score': 30,
                'emoji': '⚠️',
                'message': 'Limited historical data available. Prediction may be less accurate.',
                'factors': {}
            }
        
        # Calculate confidence score
        score = 100
        factors = {}
        
        # Factor 1: Data availability (max 30 points deduction)
        data_count = int(stats['count'].iloc[0]) if 'count' in stats.columns else 0
        if data_count < 10:
            deduction = 30
            factors['data_availability'] = f'Very few data points ({data_count})'
        elif data_count < 50:
            deduction = 20
            factors['data_availability'] = f'Limited data points ({data_count})'
        elif data_count < 100:
            deduction = 10
            factors['data_availability'] = f'Moderate data points ({data_count})'
        else:
            deduction = 0
            factors['data_availability'] = f'Strong data points ({data_count})'
        score -= deduction
        
        # Factor 2: Price volatility (max 30 points deduction)
        mean = stats['mean'].iloc[0]
        std = stats['std'].iloc[0]
        cv = (std / mean) if mean > 0 else 0.5
        
        if cv > 0.4:
            deduction = 30
            factors['volatility'] = f'Very high volatility (CV: {cv*100:.1f}%)'
        elif cv > 0.3:
            deduction = 20
            factors['volatility'] = f'High volatility (CV: {cv*100:.1f}%)'
        elif cv > 0.2:
            deduction = 10
            factors['volatility'] = f'Moderate volatility (CV: {cv*100:.1f}%)'
        else:
            deduction = 0
            factors['volatility'] = f'Low volatility (CV: {cv*100:.1f}%)'
        score -= deduction
        
        # Factor 3: Booking timing (max 20 points deduction)
        days_to_flight = flight_info['days_to_flight']
        if days_to_flight < 3:
            deduction = 20
            factors['booking_timing'] = 'Last-minute booking (less predictable)'
        elif days_to_flight > 90:
            deduction = 15
            factors['booking_timing'] = 'Very early booking (less predictable)'
        elif 30 <= days_to_flight <= 60:
            deduction = 0
            factors['booking_timing'] = 'Optimal booking window'
        else:
            deduction = 5
            factors['booking_timing'] = 'Acceptable booking window'
        score -= deduction
        
        # Factor 4: Price reasonableness (max 20 points deduction)
        if predicted_price < stats['min'].iloc[0] * 0.5 or predicted_price > stats['max'].iloc[0] * 1.5:
            deduction = 20
            factors['price_reasonableness'] = 'Prediction outside typical range'
        elif predicted_price < stats['q1'].iloc[0] * 0.8 or predicted_price > stats['q3'].iloc[0] * 1.2:
            deduction = 10
            factors['price_reasonableness'] = 'Prediction at extreme end of range'
        else:
            deduction = 0
            factors['price_reasonableness'] = 'Prediction within typical range'
        score -= deduction
        
        # Ensure score is between 0 and 100
        score = max(0, min(100, score))
        
        # Determine confidence level
        if score >= 80:
            confidence = 'Very High'
            emoji = '🎯'
            message = 'High confidence in prediction. Strong historical data and stable prices.'
        elif score >= 60:
            confidence = 'High'
            emoji = '✅'
            message = 'Good confidence in prediction. Reliable historical data available.'
        elif score >= 40:
            confidence = 'Medium'
            emoji = '⚡'
            message = 'Moderate confidence. Some uncertainty in prediction.'
        else:
            confidence = 'Low'
            emoji = '⚠️'
            message = 'Low confidence. Prediction may vary significantly from actual price.'
        
        return {
            'confidence': confidence,
            'score': score,
            'emoji': emoji,
            'message': message,
            'factors': factors
        }

