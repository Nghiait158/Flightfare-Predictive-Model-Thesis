import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

from flight_business_logic import PriceAnalyzer, generate_comprehensive_insights


class FlightRecommender:
    """
    Main recommendation system interface.
    Takes user inputs (Route, Date, Budget) and returns personalized recommendations.
    """
    
    def __init__(self, 
                 df: pd.DataFrame,
                 ensemble_model,
                 analyzer: Optional[PriceAnalyzer] = None):
        """
        Initialize recommender with data and trained models.
        
        Args:
            df: Complete DataFrame with features
            ensemble_model: Trained EnsembleModel instance
            analyzer: Optional PriceAnalyzer instance (created if not provided)
        """
        self.df = df
        self.model = ensemble_model
        self.analyzer = analyzer or PriceAnalyzer(df)
        
        self._build_indexes()
    
    def _build_indexes(self):
        self.latest_data = self.df.sort_values('create_at').groupby(
            'flight_instance'
        ).last().reset_index()        
        self.routes = self.df['route'].unique()
        
    def search_flights(self,
                      departure_airport: str,
                      arrival_airport: str,
                      flight_date: datetime,
                      budget: Optional[float] = None,
                      date_flexibility: int = 3) -> List[Dict]:
        """
        Search for flights matching criteria.
        
        Args:
            departure_airport: Departure airport code
            arrival_airport: Arrival airport code
            flight_date: Desired flight date
            budget: Maximum budget (optional)
            date_flexibility: Days before/after to search (±flexibility)
            
        Returns:
            List of flight dictionaries with recommendations
        """
        route = f"{departure_airport}_{arrival_airport}"
        
        # Define date range
        min_date = flight_date - timedelta(days=date_flexibility)
        max_date = flight_date + timedelta(days=date_flexibility)
        
        # Filter flights
        mask = (
            (self.latest_data['departure_airport'] == departure_airport) &
            (self.latest_data['arrival_airport'] == arrival_airport) &
            (self.latest_data['flight_date'] >= min_date) &
            (self.latest_data['flight_date'] <= max_date)
        )
        
        if budget is not None:
            mask = mask & (self.latest_data['price'] <= budget)
        
        matching_flights = self.latest_data[mask].copy()
        
        if len(matching_flights) == 0:
            return []
        
        # Generate predictions and insights for each flight
        results = []
        for idx, flight in matching_flights.iterrows():
            insights = self._generate_flight_insights(flight)
            results.append(insights)
        
        # Sort by buy score (descending)
        results.sort(key=lambda x: x['analysis']['buy_score']['total_score'], reverse=True)
        
        return results
    
    def _generate_flight_insights(self, flight_data: pd.Series) -> Dict:
        """
        Generate complete insights for a single flight.
        
        Args:
            flight_data: Series with flight information
            
        Returns:
            Dictionary with comprehensive insights
        """
        from flight_features import get_feature_columns
        
        # Prepare features for prediction
        feature_cols = get_feature_columns()
        all_features = (
            feature_cols['temporal'] +
            feature_cols['time_of_day'] +
            feature_cols['lag'] +
            feature_cols['rolling'] +
            feature_cols['route'] +
            feature_cols['flight']
        )
        
        # Filter to existing features
        available_features = [f for f in all_features if f in flight_data.index]
        X = flight_data[available_features].to_frame().T
        
        # Make predictions
        try:
            price_pred = self.model.price_regressor.predict(X)[0]
            trend_pred = self.model.trend_classifier.predict(X)[0]
            confidence = self.model.quantile_regressor.get_confidence_score(X)[0]
        except:
            # Fallback if prediction fails
            price_pred = flight_data['price']
            trend_pred = 'Stable'
            confidence = 50.0
        
        # Generate comprehensive insights
        insights = generate_comprehensive_insights(
            flight_data,
            price_pred,
            trend_pred,
            confidence,
            self.analyzer
        )
        
        return insights
    
    def get_recommendations(self,
                           departure_airport: str,
                           arrival_airport: str,
                           flight_date: datetime,
                           budget: Optional[float] = None) -> Dict:
        """
        Get comprehensive flight recommendations.
        
        Returns:
        - Best Value Flight (balance of price & quality)
        - Cheapest Option
        - Best Timing (most convenient hours)
        - Alternative Dates (±3 days with lower prices)
        
        Args:
            departure_airport: Departure airport code
            arrival_airport: Arrival airport code
            flight_date: Desired flight date
            budget: Maximum budget (optional)
            
        Returns:
            Dictionary with categorized recommendations
        """
        # Search flights
        flights = self.search_flights(
            departure_airport,
            arrival_airport,
            flight_date,
            budget,
            date_flexibility=3
        )
        
        if len(flights) == 0:
            return {
                'status': 'no_flights_found',
                'message': f'No flights found for {departure_airport} → {arrival_airport} on {flight_date.date()}',
                'suggestions': [
                    'Try expanding your search dates',
                    'Check if airport codes are correct',
                    'Increase your budget if specified'
                ]
            }
        
        # Categorize recommendations
        recommendations = {
            'status': 'success',
            'search_criteria': {
                'departure': departure_airport,
                'arrival': arrival_airport,
                'date': flight_date.strftime('%Y-%m-%d'),
                'budget': budget
            },
            'total_options': len(flights),
            'recommendations': {}
        }
        
        # 1. Best Value Flight (highest buy score)
        best_value = flights[0]
        recommendations['recommendations']['best_value'] = {
            'title': 'Best Value Flight',
            'description': 'Highest recommended based on price, timing, and trends',
            'flight': best_value,
            'highlight': f"Buy Score: {best_value['analysis']['buy_score']['total_score']}/100"
        }
        
        # 2. Cheapest Option
        cheapest = min(flights, key=lambda x: x['flight_info']['current_price'])
        recommendations['recommendations']['cheapest'] = {
            'title': 'Cheapest Option',
            'description': 'Lowest price available',
            'flight': cheapest,
            'highlight': f"{cheapest['flight_info']['current_price']:.2f}"
        }
        
        # 3. Best Timing (most convenient departure hours: 8am-10am or 2pm-6pm)
        convenient_hours = [f for f in flights if self._is_convenient_time(f)]
        if convenient_hours:
            best_timing = max(convenient_hours, 
                            key=lambda x: x['analysis']['buy_score']['total_score'])
            recommendations['recommendations']['best_timing'] = {
                'title': 'Best Timing',
                'description': 'Most convenient departure time',
                'flight': best_timing,
                'highlight': f"Departure: {best_timing['flight_info'].get('departure_time', 'N/A')}"
            }
        
        # 4. Alternative Dates
        alt_dates = self._find_alternative_dates(
            departure_airport,
            arrival_airport,
            flight_date,
            budget
        )
        if alt_dates:
            recommendations['recommendations']['alternative_dates'] = {
                'title': '📅 Alternative Dates',
                'description': 'Cheaper options on nearby dates',
                'options': alt_dates
            }
        
        # 5. Deal Alerts
        deals = [f for f in flights 
                if f['analysis']['price_classification']['classification'] in ['Deal Alert', 'Cheap']]
        if deals:
            recommendations['recommendations']['deal_alerts'] = {
                'title': '🔥 Deal Alerts',
                'description': 'Exceptional prices',
                'count': len(deals),
                'flights': deals[:3]  # Top 3 deals
            }
        
        # 6. Overall Market Analysis
        prices = [f['flight_info']['current_price'] for f in flights]
        recommendations['market_summary'] = {
            'avg_price': np.mean(prices),
            'min_price': np.min(prices),
            'max_price': np.max(prices),
            'price_range': np.max(prices) - np.min(prices),
            'recommendation': self._get_market_recommendation(flights)
        }
        
        return recommendations
    
    def _is_convenient_time(self, flight: Dict) -> bool:
        """Check if departure time is convenient (8am-10am or 2pm-6pm)."""
        try:
            dep_time = flight['flight_info'].get('departure_time')
            if not dep_time:
                return False
            
            # Parse time
            if isinstance(dep_time, str):
                hour = int(dep_time.split(':')[0])
            else:
                hour = int(dep_time)
            
            # Convenient: 8-10am or 2-6pm
            return (8 <= hour <= 10) or (14 <= hour <= 18)
        except:
            return False
    
    def _find_alternative_dates(self,
                               departure_airport: str,
                               arrival_airport: str,
                               target_date: datetime,
                               budget: Optional[float],
                               window: int = 3) -> List[Dict]:
        """Find cheaper flights on alternative dates."""
        alternatives = []
        
        for offset in range(-window, window + 1):
            if offset == 0:
                continue
            
            alt_date = target_date + timedelta(days=offset)
            flights = self.search_flights(
                departure_airport,
                arrival_airport,
                alt_date,
                budget,
                date_flexibility=0
            )
            
            if flights:
                cheapest = min(flights, key=lambda x: x['flight_info']['current_price'])
                alternatives.append({
                    'date': alt_date.strftime('%Y-%m-%d'),
                    'days_offset': offset,
                    'price': cheapest['flight_info']['current_price'],
                    'flight_number': cheapest['flight_info']['flight_number'],
                    'buy_score': cheapest['analysis']['buy_score']['total_score']
                })
        
        # Sort by price
        alternatives.sort(key=lambda x: x['price'])
        return alternatives[:5]  # Top 5 alternatives
    
    def _get_market_recommendation(self, flights: List[Dict]) -> str:
        """Generate overall market recommendation."""
        buy_scores = [f['analysis']['buy_score']['total_score'] for f in flights]
        avg_score = np.mean(buy_scores)
        
        high_urgency = sum(1 for f in flights 
                          if f['analysis']['trend']['urgency'] == 'high')
        
        deal_count = sum(1 for f in flights
                        if f['analysis']['price_classification']['classification'] 
                        in ['Deal Alert', 'Cheap'])
        
        if avg_score >= 70 and deal_count > 0:
            return "Excellent market conditions - Multiple good deals available!"
        elif avg_score >= 60:
            return "Good time to book - Several reasonable options"
        elif high_urgency > len(flights) / 2:
            return "Prices are rising - Book soon if you find a good option"
        else:
            return "Consider waiting or checking alternative dates"
    
    def get_price_history(self,
                         flight_number: str,
                         flight_date: datetime,
                         class_type: str) -> pd.DataFrame:
        """
        Get price history for a specific flight.
        
        Args:
            flight_number: Flight number
            flight_date: Flight date
            class_type: Class (e.g., 'Economy', 'Business')
            
        Returns:
            DataFrame with price history
        """
        flight_instance = f"{flight_number}_{flight_date.strftime('%Y%m%d')}_{class_type}"
        
        history = self.df[self.df['flight_instance'] == flight_instance][
            ['create_at', 'price', 'days_to_departure']
        ].sort_values('create_at')
        
        return history
    
    def export_recommendations_json(self, recommendations: Dict, filepath: str):
        """Export recommendations to JSON file."""
        import json
        
        # Convert all non-serializable types
        def convert_to_serializable(obj):
            # Handle datetime
            if isinstance(obj, (datetime, pd.Timestamp)):
                return obj.isoformat()
            # Handle numpy/pandas integers
            elif isinstance(obj, (np.integer, np.int64, np.int32)):
                return int(obj)
            # Handle numpy/pandas floats
            elif isinstance(obj, (np.floating, np.float64, np.float32)):
                return float(obj)
            # Handle numpy/pandas bools
            elif isinstance(obj, (np.bool_, bool)):
                return bool(obj)
            # Handle numpy arrays
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            # Handle pandas Series
            elif isinstance(obj, pd.Series):
                return obj.to_dict()
            return obj
        
        # Process nested dictionaries
        def process_dict(d):
            if isinstance(d, dict):
                return {k: process_dict(v) for k, v in d.items()}
            elif isinstance(d, list):
                return [process_dict(item) for item in d]
            else:
                return convert_to_serializable(d)
        
        recommendations_serializable = process_dict(recommendations)
        
        with open(filepath, 'w') as f:
            json.dump(recommendations_serializable, f, indent=2)
        
        print(f"📄 Recommendations exported to {filepath}")


def create_recommendation_summary(recommendations: Dict) -> str:
    """
    Create a human-readable summary of recommendations.
    
    Args:
        recommendations: Output from get_recommendations()
        
    Returns:
        Formatted string summary
    """
    if recommendations['status'] != 'success':
        return recommendations['message']
    
    lines = []
    lines.append("=" * 70)
    lines.append("FLIGHT RECOMMENDATIONS SUMMARY")
    lines.append("=" * 70)
    
    # Search criteria
    criteria = recommendations['search_criteria']
    lines.append(f"\nRoute: {criteria['departure']} → {criteria['arrival']}")
    lines.append(f"Date: {criteria['date']}")
    if criteria['budget']:
        lines.append(f" Budget: ${criteria['budget']:.2f}")
    lines.append(f"\n  Found {recommendations['total_options']} flight options\n")
    
    # Market summary
    market = recommendations['market_summary']
    lines.append(f" Market Overview:")
    lines.append(f"   Average Price: ${market['avg_price']:.2f}")
    lines.append(f"   Price Range: ${market['min_price']:.2f} - ${market['max_price']:.2f}")
    lines.append(f"   {market['recommendation']}\n")
    
    # Best value
    if 'best_value' in recommendations['recommendations']:
        best = recommendations['recommendations']['best_value']['flight']
        lines.append(f" BEST VALUE RECOMMENDATION")
        lines.append(f"   Flight: {best['flight_info']['flight_number']}")
        lines.append(f"   Price: ${best['flight_info']['current_price']:.2f}")
        lines.append(f"   Buy Score: {best['analysis']['buy_score']['total_score']}/100")
        lines.append(f"   {best['analysis']['buy_score']['recommendation']}\n")
    
    # Cheapest
    if 'cheapest' in recommendations['recommendations']:
        cheap = recommendations['recommendations']['cheapest']['flight']
        lines.append(f" CHEAPEST OPTION")
        lines.append(f"   Flight: {cheap['flight_info']['flight_number']}")
        lines.append(f"   Price: ${cheap['flight_info']['current_price']:.2f}\n")
    
    # Deal alerts
    if 'deal_alerts' in recommendations['recommendations']:
        deals = recommendations['recommendations']['deal_alerts']
        lines.append(f" DEAL ALERTS: {deals['count']} exceptional prices found!\n")
    
    # Alternative dates
    if 'alternative_dates' in recommendations['recommendations']:
        alts = recommendations['recommendations']['alternative_dates']['options']
        lines.append(f" ALTERNATIVE DATES (Top 3):")
        for alt in alts[:3]:
            offset_str = f"+{alt['days_offset']}" if alt['days_offset'] > 0 else str(alt['days_offset'])
            lines.append(f"   {alt['date']} ({offset_str} days): ${alt['price']:.2f}")
    
    lines.append("\n" + "=" * 70)
    
    return "\n".join(lines)


if __name__ == "__main__":
    print("Flight Recommender module loaded successfully!")