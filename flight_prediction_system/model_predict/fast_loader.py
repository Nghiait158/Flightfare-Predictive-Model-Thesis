"""
Fast Production Loader
Loads deployment package in <1 second for instant predictions
NO PREPROCESSING REQUIRED!
"""

import pandas as pd
import numpy as np
import pickle
import json
from datetime import datetime
from typing import Optional, Dict
import os


class FastFlightRecommender:
    """
    Fast-loading recommender for production.
    Load time: <1 second (vs 2+ minutes for full preprocessing)
    """
    
    def __init__(self, package_dir: str = '.'):
        """
        Load the deployment package.
        
        Args:
            package_dir: Directory containing deployment package
        """
        print("🚀 Loading Flight Recommender...")
        start_time = datetime.now()
        
        self.package_dir = package_dir
        
        # 1. Load metadata
        metadata_path = os.path.join(package_dir, 'deployment_metadata.json')
        with open(metadata_path, 'r') as f:
            self.metadata = json.load(f)
        print(f"   ✅ Loaded metadata")
        
        # 2. Load trained model
        model_path = os.path.join(package_dir, 'flight_ensemble_model.pkl')
        with open(model_path, 'rb') as f:
            self.ensemble = pickle.load(f)
        print(f"   ✅ Loaded ensemble model")
        
        # 3. Load latest data (lightweight!)
        latest_data_path = os.path.join(package_dir, 'flight_latest_data.parquet')
        self.latest_data = pd.read_parquet(latest_data_path)
        print(f"   ✅ Loaded latest data ({len(self.latest_data):,} flights)")
        
        # 4. Load route statistics
        route_stats_path = os.path.join(package_dir, 'route_statistics.parquet')
        self.route_stats = pd.read_parquet(route_stats_path).set_index('route').to_dict('index')
        print(f"   ✅ Loaded route statistics ({len(self.route_stats):,} routes)")
        
        # 5. Load price history (for history queries only, loaded lazily)
        self.history_path = os.path.join(package_dir, 'flight_price_history.parquet')
        self._price_history = None
        print(f"   ✅ Price history ready (lazy load)")
        
        # Build indexes
        self.routes = self.latest_data['route'].unique()
        self.airports = sorted(self.latest_data['departure_airport'].unique().tolist())
        
        load_time = (datetime.now() - start_time).total_seconds()
        print(f"\n⚡ Loaded in {load_time:.2f} seconds!")
        print(f"   📍 {len(self.airports)} airports")
        print(f"   🛫 {len(self.routes)} routes")
        print(f"   ✈️  {len(self.latest_data):,} flights available\n")
    
    @property
    def price_history(self):
        """Lazy load price history only when needed."""
        if self._price_history is None:
            print("📜 Loading full price history...")
            self._price_history = pd.read_parquet(self.history_path)
        return self._price_history
    
    def search_flights(self,
                      departure_airport: str,
                      arrival_airport: str,
                      flight_date: datetime,
                      budget: Optional[float] = None,
                      date_flexibility: int = 3) -> pd.DataFrame:
        """
        Search for flights matching criteria.
        
        Args:
            departure_airport: Departure airport code
            arrival_airport: Arrival airport code  
            flight_date: Desired flight date
            budget: Maximum budget (optional)
            date_flexibility: Days before/after to search (±flexibility)
            
        Returns:
            DataFrame with matching flights
        """
        from datetime import timedelta
        
        # Convert string to datetime if needed
        if isinstance(flight_date, str):
            flight_date = pd.to_datetime(flight_date)
        
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
        
        return matching_flights
    
    def get_recommendation(self,
                          departure_airport: str,
                          arrival_airport: str,
                          flight_date: datetime,
                          budget: Optional[float] = None) -> Dict:
        """
        Get flight recommendation with AI-powered insights.
        
        Args:
            departure_airport: e.g., 'LAX'
            arrival_airport: e.g., 'JFK'
            flight_date: datetime object or string 'YYYY-MM-DD'
            budget: Optional maximum price
            
        Returns:
            Dictionary with recommendations and insights
        """
        # Convert string date to datetime
        if isinstance(flight_date, str):
            flight_date = pd.to_datetime(flight_date)
        
        # Search flights
        flights = self.search_flights(
            departure_airport, 
            arrival_airport, 
            flight_date, 
            budget
        )
        
        if len(flights) == 0:
            return {
                'status': 'no_flights_found',
                'message': f'No flights found for {departure_airport} → {arrival_airport}',
                'suggestions': [
                    'Try different dates',
                    'Check airport codes',
                    'Increase budget if set'
                ]
            }
        
        # Generate predictions and insights for each flight
        results = []
        
        from flight_features import get_feature_columns
        feature_cols = get_feature_columns()
        
        all_features = (
            feature_cols['temporal'] +
            feature_cols['time_of_day'] +
            feature_cols['lag'] +
            feature_cols['rolling'] +
            feature_cols['route'] +
            feature_cols['flight']
        )
        
        for idx, flight in flights.iterrows():
            # Prepare features
            available_features = [f for f in all_features if f in flight.index]
            X = flight[available_features].to_frame().T
            
            # Make predictions
            try:
                price_pred = self.ensemble.price_regressor.predict(X)[0]
                trend_pred = self.ensemble.trend_classifier.predict(X)[0]
                confidence = self.ensemble.quantile_regressor.get_confidence_score(X)[0]
            except:
                price_pred = flight['price']
                trend_pred = 'Stable'
                confidence = 50.0
            
            # Generate insights
            insights = self._generate_insights(flight, price_pred, trend_pred, confidence)
            results.append(insights)
        
        # Sort by buy score
        results.sort(key=lambda x: x['buy_score'], reverse=True)
        
        # Create recommendation
        best_flight = results[0]
        cheapest_flight = min(results, key=lambda x: x['price'])
        
        return {
            'status': 'success',
            'route': f"{departure_airport} → {arrival_airport}",
            'date': flight_date.strftime('%Y-%m-%d'),
            'total_options': len(results),
            'best_value': best_flight,
            'cheapest': cheapest_flight,
            'all_options': results
        }
    
    def _generate_insights(self, flight: pd.Series, 
                          price_pred: float, 
                          trend_pred: str, 
                          confidence: float) -> Dict:
        """Generate insights for a single flight."""
        route = flight['route']
        current_price = flight['price']
        
        # Get route statistics
        route_stat = self.route_stats.get(route, {})
        route_mean = route_stat.get('mean', current_price)
        q1 = route_stat.get('q1', current_price * 0.9)
        q3 = route_stat.get('q3', current_price * 1.1)
        
        # Price classification
        if current_price < q1 * 0.85:
            price_class = "Deal Alert 🔥"
        elif current_price < q1:
            price_class = "Cheap 💚"
        elif current_price <= q3:
            price_class = "Normal ⚪"
        else:
            price_class = "Expensive 🔴"
        
        # Trend analysis
        price_change = price_pred - current_price
        price_change_pct = (price_change / current_price) * 100
        
        if trend_pred == 'Up' or price_change_pct > 3:
            trend_status = "Rising 📈"
            urgency = "HIGH"
        elif trend_pred == 'Down' or price_change_pct < -3:
            trend_status = "Falling 📉"
            urgency = "LOW"
        else:
            trend_status = "Stable →"
            urgency = "MEDIUM"
        
        # Calculate buy score
        price_ratio = current_price / route_mean if route_mean > 0 else 1.0
        price_score = max(0, 35 * (2 - price_ratio))
        trend_score = 25 if trend_pred == 'Up' else 10
        confidence_score = (confidence / 100) * 15
        
        days_to_dep = flight.get('days_to_departure', 30)
        if days_to_dep <= 7:
            urgency_score = 25
        elif days_to_dep <= 21:
            urgency_score = 20
        else:
            urgency_score = 10
        
        buy_score = price_score + trend_score + urgency_score + confidence_score
        buy_score = min(100, max(0, buy_score))
        
        # Recommendation
        if buy_score >= 80:
            recommendation = "🟢 STRONG BUY - Book now!"
        elif buy_score >= 60:
            recommendation = "🟡 BUY - Good opportunity"
        elif buy_score >= 40:
            recommendation = "🟠 WAIT - Monitor prices"
        else:
            recommendation = "🔴 WAIT - Not optimal"
        
        return {
            'flight_number': flight['flight_number'],
            'price': current_price,
            'predicted_price': price_pred,
            'price_change_pct': price_change_pct,
            'price_class': price_class,
            'trend': trend_status,
            'urgency': urgency,
            'buy_score': round(buy_score, 1),
            'confidence': round(confidence, 1),
            'recommendation': recommendation,
            'flight_date': flight['flight_date'],
            'departure_time': flight.get('departure_time', 'N/A'),
            'class': flight['classes']
        }
    
    def get_price_history(self, 
                         flight_number: str,
                         flight_date: datetime,
                         class_type: str = 'Economy') -> pd.DataFrame:
        """
        Get historical price data for a specific flight.
        
        Args:
            flight_number: e.g., 'AA123'
            flight_date: Flight date
            class_type: Ticket class
            
        Returns:
            DataFrame with price history
        """
        if isinstance(flight_date, str):
            flight_date = pd.to_datetime(flight_date)
        
        flight_instance = f"{flight_number}_{flight_date.strftime('%Y%m%d')}_{class_type}"
        
        history = self.price_history[
            self.price_history['flight_instance'] == flight_instance
        ][['create_at', 'price', 'days_to_departure']].sort_values('create_at')
        
        return history
    
    def list_available_routes(self, departure_airport: Optional[str] = None) -> pd.DataFrame:
        """
        List all available routes.
        
        Args:
            departure_airport: Filter by departure airport (optional)
            
        Returns:
            DataFrame with routes and statistics
        """
        if departure_airport:
            data = self.latest_data[
                self.latest_data['departure_airport'] == departure_airport
            ]
        else:
            data = self.latest_data
        
        routes = data.groupby(['departure_airport', 'arrival_airport']).agg({
            'price': ['min', 'mean', 'max', 'count']
        }).reset_index()
        
        routes.columns = ['departure', 'arrival', 'min_price', 'avg_price', 'max_price', 'flights']
        routes = routes.sort_values('avg_price')
        
        return routes


def demo_usage():
    """Demonstrate how to use the fast loader."""
    
    print("\n" + "=" * 70)
    print("FAST LOADER DEMO")
    print("=" * 70)
    
    # Initialize (takes <1 second)
    recommender = FastFlightRecommender()
    
    # Example 1: Get recommendation
    print("\n📍 Example 1: Get flight recommendation")
    print("-" * 70)
    
    result = recommender.get_recommendation(
        departure_airport='HAN',
        arrival_airport='SGN',
        flight_date='2025-02-15',
        budget=2000000
    )
    
    if result['status'] == 'success':
        print(f"\n✈️  Route: {result['route']}")
        print(f"📅 Date: {result['date']}")
        print(f"🔍 Found {result['total_options']} options\n")
        
        best = result['best_value']
        print("🏆 BEST VALUE:")
        print(f"   Flight: {best['flight_number']}")
        print(f"   Price: ${best['price']:,.0f}")
        print(f"   Buy Score: {best['buy_score']}/100")
        print(f"   {best['recommendation']}")
        print(f"   Trend: {best['trend']}")
        print(f"   Price Class: {best['price_class']}")
    
    # Example 2: List routes
    print("\n\n📍 Example 2: Available routes from HAN")
    print("-" * 70)
    routes = recommender.list_available_routes('HAN')
    print(routes.head(10).to_string(index=False))
    
    print("\n" + "=" * 70)
    print("✅ Demo complete!")
    print("=" * 70)


if __name__ == "__main__":
    demo_usage()