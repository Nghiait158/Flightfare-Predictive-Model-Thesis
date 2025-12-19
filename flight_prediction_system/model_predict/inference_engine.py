import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import xgboost as xgb
import joblib
from pathlib import Path
from typing import Dict, List, Tuple, Any
import warnings
warnings.filterwarnings('ignore')

# Import class name mapper
from class_mapper import normalize_class_name

# Import price adjuster
from price_adjuster import PriceAdjuster


class FlightIntelligenceEngine:
    def __init__(self, package_dir: str = 'deployment_package', enable_price_adjustment: bool = True):
        self.package_dir = Path(package_dir)
        self.price_adjuster = PriceAdjuster()
        self.price_adjuster.enabled = enable_price_adjustment
        # Mapping flight_number -> type_of_plane built from training data
        self.plane_map = {}
        self._load_package()
        
    def _load_package(self):
        print("\n" + "="*60)
        print("LOADING FLIGHT INTELLIGENCE ENGINE")
        print("="*60 + "\n")
        
        package_path = self.package_dir / 'flight_ai_engine.pkl'
        if not package_path.exists():
            raise FileNotFoundError(f"Package not found: {package_path}")
        
        package = joblib.load(package_path)
        
        self.encoders = package['encoders']
        self.route_stats = package['route_stats']
        self.global_fallback_stats = package.get('global_fallback_stats', {
            'mean': self.route_stats['mean'].mean(),
            'median': self.route_stats['median'].median(),
            'q1': self.route_stats['q1'].median(),
            'q3': self.route_stats['q3'].median(),
            'std': self.route_stats['std'].mean()
        })
        self.feature_columns = package['feature_columns']
        self.metadata = package['metadata']
        # Load plane_map if available (may be absent in older packages)
        self.plane_map = package.get('plane_map', {}) or {}
        
        model_path = self.package_dir / 'xgboost_model.json'
        self.model = xgb.XGBRegressor()
        self.model.load_model(model_path)
        
        print(f"✓ Model loaded (trained: {self.metadata['trained_at']})")
        print(f"✓ Version: {self.metadata.get('version', '1.0')}")
        print(f"✓ Leakage-free: {self.metadata.get('leakage_free', False)}")
        print(f"✓ Route statistics loaded: {len(self.route_stats)} combinations")
        print(f"✓ Airlines available: {', '.join(self.metadata['airlines'][:5])}...")
        print(f"✓ Model R² score: {self.metadata['training_metrics']['val_r2']:.4f}")
        print("\n" + "="*60 + "\n")
    
    def _extract_airline(self, flight_number: str) -> str:
        if pd.isna(flight_number):
            return 'UNKNOWN'
        return ''.join([c for c in str(flight_number) if c.isalpha()])
    
    def _get_time_bucket(self, time_str: str) -> str:
        if pd.isna(time_str):
            return 'Unknown'
        try:
            hour = int(str(time_str).split(':')[0])
            if 5 <= hour < 12:
                return 'Morning'
            elif 12 <= hour < 17:
                return 'Afternoon'
            elif 17 <= hour < 21:
                return 'Evening'
            else:
                return 'Night'
        except:
            return 'Unknown'
    
    def _prepare_features(self, flight_info: Dict[str, Any]) -> pd.DataFrame:
        # Work on a shallow copy to avoid mutating caller's dict
        info = dict(flight_info)
        
        # Try to infer type_of_plane from flight_number using training plane_map
        flight_num = info.get('flight_number')
        type_of_plane = info.get('type_of_plane', None)
        if (type_of_plane is None) or (str(type_of_plane).strip() == ''):
            if flight_num is not None and self.plane_map:
                inferred_plane = self.plane_map.get(str(flight_num).strip())
                if inferred_plane:
                    info['type_of_plane'] = inferred_plane
        
        df = pd.DataFrame([info])        
        df['airline'] = df['flight_number'].apply(self._extract_airline)
        
        # Normalize class name based on airline
        if 'classes' in df.columns and len(df) > 0:
            airline = df['airline'].iloc[0]
            original_class = df['classes'].iloc[0]
            normalized_class = normalize_class_name(airline, original_class)
            df['classes'] = normalized_class
        
        df['departure_time_bucket'] = df['departure_time'].apply(self._get_time_bucket)
        df['arrival_time_bucket'] = df.get('arrival_time', pd.Series(['Unknown'])).apply(self._get_time_bucket)        
        df['flight_date'] = pd.to_datetime(df['flight_date'], format='mixed', errors='coerce')
        df['day_of_week'] = df['flight_date'].dt.dayofweek
        df['month'] = df['flight_date'].dt.month
        df['day_of_month'] = df['flight_date'].dt.day
        df['is_weekend'] = (df['flight_date'].dt.dayofweek >= 5).astype(int)
        df['is_month_start'] = (df['flight_date'].dt.day <= 7).astype(int)
        df['is_month_end'] = (df['flight_date'].dt.day >= 24).astype(int)
        df['quarter'] = df['flight_date'].dt.quarter
        df['route'] = df['departure_airport'] + '_' + df['arrival_airport']
        df['is_round_trip_route'] = 0  # Simplified for single query
        df['booking_category'] = pd.cut(
            df['days_to_flight'],
            bins=[-1, 3, 7, 14, 30, 60, 90, float('inf')],
            labels=['last_minute', 'week', 'two_weeks', 'month', 'two_months', 'three_months', 'early_bird']
        )
        df['is_high_volatility_window'] = ((df['days_to_flight'] <= 14) | (df['days_to_flight'] >= 90)).astype(int)
        df['is_optimal_booking_window'] = ((df['days_to_flight'] >= 30) & (df['days_to_flight'] <= 60)).astype(int)
        
        df = df.merge(
            self.route_stats,
            on=['route', 'airline', 'classes'],
            how='left',
            suffixes=('', '_hist')
        )
        
        if df['mean'].isna().any():
            for stat_name, stat_value in self.global_fallback_stats.items():
                df[stat_name] = df[stat_name].fillna(stat_value)
        
        for col, encoder in self.encoders.items():
            # If column is missing, set default value to 'UNKNOWN'
            if col not in df.columns:
                df[col] = 'UNKNOWN'
            
            df[col] = df[col].astype('object')
            # Replace NaN and empty strings with 'UNKNOWN'
            df[col] = df[col].fillna('UNKNOWN')
            df[col] = df[col].replace('', 'UNKNOWN')
            df[col] = df[col].replace(r'^\s*$', 'UNKNOWN', regex=True)  # Also handle whitespace-only strings
            
            def safe_encode(x):
                if x in encoder.classes_:
                    return encoder.transform([x])[0]
                else:
                    return -1
            
            df[f'{col}_encoded'] = df[col].astype(str).apply(safe_encode)
        
        for col in self.feature_columns:
            if col not in df.columns:
                df[col] = 0
        
        return df[self.feature_columns]
    
    def predict_price(self, flight_info: Dict[str, Any]) -> float:
     
        X = self._prepare_features(flight_info)
        base_prediction = self.model.predict(X)[0]
        base_prediction = max(0, base_prediction)
        
        # Apply price adjustment if enabled
        if self.price_adjuster.enabled:
            airline = flight_info.get('airline') or self._extract_airline(flight_info.get('flight_number', ''))
            adjustment_result = self.price_adjuster.adjust_prediction(
                base_prediction=base_prediction,
                airline=airline,
                flight_class=flight_info.get('classes', 'Eco'),
                flight_date=flight_info.get('flight_date', ''),
                days_to_flight=flight_info.get('days_to_flight', 30)
            )
            return max(0, adjustment_result['adjusted_price'])
        
        return base_prediction  
    
    def classify_price(self, predicted_price: float, route: str, 
                       airline: str, flight_class: str) -> Dict[str, Any]:
   
        stats = self.route_stats[
            (self.route_stats['route'] == route) &
            (self.route_stats['airline'] == airline) &
            (self.route_stats['classes'] == flight_class)
        ]
        
        if len(stats) == 0:
       
            stats = self.route_stats[
                (self.route_stats['route'] == route) &
                (self.route_stats['classes'] == flight_class)
            ]
        
        if len(stats) == 0:
            return {
                'category': 'Unknown',
                'confidence': 'Low',
                'reason': 'Insufficient historical data',
                'stats': None
            }
  
        q1 = stats['q1'].iloc[0]
        q3 = stats['q3'].iloc[0]
        median = stats['median'].iloc[0]
        mean = stats['mean'].iloc[0]
        

        if predicted_price < q1:
            category = 'Cheap'
            confidence = 'High' if predicted_price < q1 * 0.9 else 'Medium'
            reason = f'{((q1 - predicted_price) / q1 * 100):.1f}% below lower quartile'
        elif predicted_price > q3:
            category = 'Expensive'
            confidence = 'High' if predicted_price > q3 * 1.1 else 'Medium'
            reason = f'{((predicted_price - q3) / q3 * 100):.1f}% above upper quartile'
        else:
            category = 'Normal'
            if abs(predicted_price - median) / median < 0.1:
                confidence = 'High'
                reason = 'Very close to median price'
            else:
                confidence = 'Medium'
                reason = 'Within normal price range'
        
        return {
            'category': category,
            'confidence': confidence,
            'reason': reason,
            'stats': {
                'q1': q1,
                'median': median,
                'q3': q3,
                'mean': mean,
                'predicted_vs_median': f'{((predicted_price - median) / median * 100):+.1f}%'
            }
        }
    
    def calculate_buy_score(self, flight_info: Dict[str, Any], 
                           predicted_price: float) -> Dict[str, Any]:
      
        route = f"{flight_info['departure_airport']}_{flight_info['arrival_airport']}"
        airline = self._extract_airline(flight_info.get('flight_number', ''))
        flight_class = flight_info['classes']
        days_to_flight = flight_info['days_to_flight']
    
        stats = self.route_stats[
            (self.route_stats['route'] == route) &
            (self.route_stats['airline'] == airline) &
            (self.route_stats['classes'] == flight_class)
        ]
        
        if len(stats) == 0:
            # Fallback
            stats = self.route_stats[
                (self.route_stats['route'] == route) &
                (self.route_stats['classes'] == flight_class)
            ]
        
        if len(stats) == 0:
            return {
                'score': 50,
                'level': 'Medium',
                'breakdown': {'insufficient_data': True},
                'recommendation': 'Limited data - proceed with caution'
            }
        
        mean = stats['mean'].iloc[0]
        std = stats['std'].iloc[0]
        q1 = stats['q1'].iloc[0]
        
        scores = {}
        
        # 1. Price Competitiveness (40 points)
        price_ratio = predicted_price / mean if mean > 0 else 1.0
        if price_ratio <= 0.8:
            scores['price_competitiveness'] = 40
        elif price_ratio <= 0.9:
            scores['price_competitiveness'] = 35
        elif price_ratio <= 1.0:
            scores['price_competitiveness'] = 25
        elif price_ratio <= 1.1:
            scores['price_competitiveness'] = 15
        else:
            scores['price_competitiveness'] = 5
        
        # 2. Booking Timing (30 points)
        if 30 <= days_to_flight <= 60:
            scores['booking_timing'] = 30  # Optimal window
        elif 21 <= days_to_flight <= 90:
            scores['booking_timing'] = 20  # Good window
        elif 14 <= days_to_flight <= 20:
            scores['booking_timing'] = 15  # Acceptable
        elif 7 <= days_to_flight <= 13:
            scores['booking_timing'] = 10  # Getting risky
        else:
            scores['booking_timing'] = 5  # Last minute or too early
        
        # 3. Volatility Risk (20 points)
        volatility_ratio = std / mean if mean > 0 else 0.5
        if volatility_ratio < 0.1:
            scores['volatility_risk'] = 20  # Very stable
        elif volatility_ratio < 0.2:
            scores['volatility_risk'] = 15  # Stable
        elif volatility_ratio < 0.3:
            scores['volatility_risk'] = 10  # Moderate
        else:
            scores['volatility_risk'] = 5  # High volatility
        
        # 4. Deal Quality (10 points)
        if predicted_price < q1:
            scores['deal_quality'] = 10  # Excellent deal
        elif predicted_price < mean:
            scores['deal_quality'] = 7  # Good deal
        else:
            scores['deal_quality'] = 3  # Not a deal
        
        # Total score
        total_score = sum(scores.values())
        
        # Score interpretation
        if total_score >= 80:
            level = 'Excellent'
            recommendation = 'STRONG BUY - Exceptional deal, book now!'
        elif total_score >= 60:
            level = 'Good'
            recommendation = 'BUY - Good opportunity, consider booking'
        elif total_score >= 40:
            level = 'Medium'
            recommendation = ' HOLD - Monitor for better prices'
        else:
            level = 'Poor'
            recommendation = ' WAIT - Price likely to decrease'
        
        return {
            'score': total_score,
            'level': level,
            'breakdown': scores,
            'recommendation': recommendation,
            'factors': {
                'price_vs_mean': f'{((predicted_price - mean) / mean * 100):+.1f}%',
                'volatility': f'{(volatility_ratio * 100):.1f}%',
                'days_to_flight': days_to_flight
            }
        }
    
    def find_optimal_booking_time(self, flight_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Dự đoán giá từ HIỆN TẠI đến ngày bay để tìm thời điểm tốt nhất.
        
        Tests từ days_to_flight hiện tại giảm dần đến 1 ngày trước bay
        
        Returns:
            Dict with optimal day and price trajectory
        """
        flight_date = pd.to_datetime(flight_info['flight_date'])
        current_days = flight_info['days_to_flight']
        
        # Nếu quá gần ngày bay (< 3 ngày), không đủ dữ liệu để phân tích
        if current_days < 3:
            return {
                'optimal_days': None,
                'error': 'Too close to departure date',
                'message': 'Chuyến bay quá gần, nên đặt ngay!'
            }
        
        # Tạo các mốc test từ hiện tại đến ngày bay
        # Test theo interval phù hợp với số ngày còn lại
        if current_days <= 14:
            # Gần ngày bay: test mỗi 2 ngày
            test_days = list(range(current_days, 0, -2))
        elif current_days <= 30:
            # 2-4 tuần: test mỗi 3 ngày
            test_days = list(range(current_days, 0, -3))
        elif current_days <= 60:
            # 1-2 tháng: test mỗi 5 ngày
            test_days = list(range(current_days, 0, -5))
        else:
            # > 2 tháng: test mỗi 7 ngày
            test_days = list(range(current_days, 0, -7))
        
        # Đảm bảo có ít nhất 3-4 điểm test
        if len(test_days) < 4:
            step = max(1, current_days // 4)
            test_days = list(range(current_days, 0, -step))
        
        # Luôn thêm ngày cuối (1 ngày trước bay) để so sánh last-minute
        if test_days[-1] != 1:
            test_days.append(1)
        
        predictions = []
        today = datetime.now().date()
        
        for days in test_days:
            test_info = flight_info.copy()
            test_info['days_to_flight'] = days
            
            try:
                price = self.predict_price(test_info)
                booking_date = today + timedelta(days=(current_days - days))
                
                predictions.append({
                    'days_to_flight': days,
                    'days_from_now': current_days - days,
                    'booking_date': booking_date.strftime('%Y-%m-%d'),
                    'predicted_price': price
                })
            except Exception as e:
                continue
        
        if not predictions:
            return {
                'optimal_days': None,
                'error': 'Unable to calculate optimal booking time'
            }
        
        # Find minimum price point (giá rẻ nhất)
        df_pred = pd.DataFrame(predictions)
        optimal_idx = df_pred['predicted_price'].idxmin()
        optimal = df_pred.iloc[optimal_idx]
        
        # Giá hiện tại (nếu đặt hôm nay)
        current_prediction = df_pred.iloc[0]
        current_price = current_prediction['predicted_price']
        
        # Tính tiết kiệm so với hiện tại
        savings_vs_now = current_price - optimal['predicted_price']
        savings_percent = (savings_vs_now / current_price * 100) if current_price > 0 else 0
        
        # Xác định recommendation
        if optimal['days_from_now'] == 0:
            recommendation = "🎯 Đặt NGAY HÔM NAY! Đây là thời điểm tốt nhất."
        elif optimal['days_from_now'] <= 3:
            recommendation = f"⏰ Đợi thêm {optimal['days_from_now']} ngày nữa để có giá tốt nhất"
        elif savings_percent < 3:
            recommendation = f"💡 Giá khá ổn định, đặt bất cứ lúc nào cũng được (tiết kiệm tối đa ~{savings_percent:.1f}%)"
        else:
            recommendation = f"⏳ Nên đợi đến {optimal['booking_date']} để tiết kiệm {savings_vs_now:,.0f} VND ({savings_percent:.1f}%)"
        
        return {
            'optimal_days': int(optimal['days_to_flight']),
            'optimal_date': optimal['booking_date'],
            'days_from_now': int(optimal['days_from_now']),
            'optimal_price': optimal['predicted_price'],
            'current_price': current_price,
            'savings_vs_now': savings_vs_now,
            'savings_percent': f'{savings_percent:.1f}%',
            'price_trajectory': predictions,
            'recommendation': recommendation,
            'is_good_time_now': optimal['days_from_now'] <= 1  # Có nên đặt ngay không?
        }
    
    def assess_volatility(self, route: str, airline: str, flight_class: str) -> Dict[str, Any]:
        """
        Assess price volatility for a specific route-airline-class combination.
        
        Returns:
            Volatility assessment with risk level
        """
        stats = self.route_stats[
            (self.route_stats['route'] == route) &
            (self.route_stats['airline'] == airline) &
            (self.route_stats['classes'] == flight_class)
        ]
        
        if len(stats) == 0:
            return {
                'level': 'Unknown',
                'message': 'Insufficient data for volatility assessment'
            }
        
        mean = stats['mean'].iloc[0]
        std = stats['std'].iloc[0]
        price_range = stats['max'].iloc[0] - stats['min'].iloc[0]
        
        # Coefficient of variation
        cv = (std / mean) if mean > 0 else 0
        
        if cv < 0.1:
            level = 'Very Low'
            risk = 'Minimal'
            advice = 'Prices are very stable - safe to book anytime'
        elif cv < 0.2:
            level = 'Low'
            risk = 'Low'
            advice = 'Prices are relatively stable'
        elif cv < 0.3:
            level = 'Medium'
            risk = 'Moderate'
            advice = 'Monitor prices - some variation expected'
        elif cv < 0.4:
            level = 'High'
            risk = 'Elevated'
            advice = 'Prices fluctuate significantly - timing matters'
        else:
            level = 'Very High'
            risk = 'High'
            advice = 'Highly volatile - book strategically'
        
        return {
            'level': level,
            'risk': risk,
            'coefficient_variation': f'{(cv * 100):.1f}%',
            'price_range': f'{price_range:,.0f} VND',
            'std_deviation': f'{std:,.0f} VND',
            'advice': advice,
            'data_points': int(stats['count'].iloc[0])
        }
    
    def get_complete_intelligence(self, flight_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate complete flight intelligence report.
        
        One-stop function for full analysis.
        """
        print("\n" + "="*70)
        print(" FLIGHT INTELLIGENCE REPORT")
        print("="*70 + "\n")
        
        # Basic info
        route = f"{flight_info['departure_airport']}_{flight_info['arrival_airport']}"
        airline = self._extract_airline(flight_info.get('flight_number', ''))
        
        print(f"Route: {flight_info['departure_airport']} → {flight_info['arrival_airport']}")
        print(f"Date: {flight_info['flight_date']}")
        print(f"Class: {flight_info['classes']}")
        print(f"Airline: {airline}")
        print(f"Days to Flight: {flight_info['days_to_flight']}")
        print()
        
        # 1. Price Prediction
        predicted_price = self.predict_price(flight_info)
        print(f" Predicted Price: {predicted_price:,.0f} VND")
        print()
        
        # 2. Price Classification
        classification = self.classify_price(predicted_price, route, airline, flight_info['classes'])
        print(f" Price Classification: {classification['category']} ({classification['confidence']} confidence)")
        print(f"   Reason: {classification['reason']}")
        if classification['stats']:
            print(f"   vs. Median: {classification['stats']['predicted_vs_median']}")
        print()
        
        # 3. Buy Score
        buy_score = self.calculate_buy_score(flight_info, predicted_price)
        print(f" Buy Score: {buy_score['score']}/100 ({buy_score['level']})")
        print(f"   {buy_score['recommendation']}")
        print(f"   Breakdown:")
        for factor, score in buy_score['breakdown'].items():
            print(f"     - {factor.replace('_', ' ').title()}: {score}")
        print()
        
        # 4. Optimal Booking Time
        optimal_time = self.find_optimal_booking_time(flight_info)
        if 'optimal_days' in optimal_time and optimal_time['optimal_days']:
            print(f" Optimal Booking Window: {optimal_time['optimal_days']} days before")
            print(f"   Best Date: {optimal_time['optimal_date']}")
            print(f"   Estimated Price: {optimal_time['optimal_price']:,.0f} VND")
            print(f"   Potential Savings: {optimal_time['potential_savings']:,.0f} VND ({optimal_time['savings_percent']})")
        print()
        
        # 5. Volatility Assessment
        volatility = self.assess_volatility(route, airline, flight_info['classes'])
        print(f" Volatility: {volatility['level']} ({volatility.get('risk', 'Unknown')} risk)")
        if 'advice' in volatility:
            print(f"   {volatility['advice']}")
        if 'coefficient_variation' in volatility:
            print(f"   CV: {volatility['coefficient_variation']}, Range: {volatility['price_range']}")
        print()
        
        print("="*70 + "\n")
        
        return {
            'predicted_price': predicted_price,
            'classification': classification,
            'buy_score': buy_score,
            'optimal_booking': optimal_time,
            'volatility': volatility
        }


# ========== EXAMPLE USAGE ==========
def example_usage():
    """
    Demonstration of how to use the FlightIntelligenceEngine
    """
    print("\n" + "="*80)
    print("📘 FLIGHT INTELLIGENCE ENGINE - USAGE EXAMPLE")
    print("="*80 + "\n")
    
    # Initialize engine
    engine = FlightIntelligenceEngine('deployment_package')
    
    # Example query: User wants to fly SGN → HAN on 2025-12-20
    user_query = {
        'flight_number': 'VJ156',  # Vietnam Jet Air
        'departure_airport': 'SGN',
        'arrival_airport': 'HAN',
        'flight_date': '2025-12-20',
        'departure_time': '06:00',
        'classes': 'economy',
        'days_to_flight': 2,  # Booking 45 days in advance
        'type_of_plane': 'Airbus A321'
    }
    
    # Get complete intelligence
    report = engine.get_complete_intelligence(user_query)
    
    print(" Example 2: Quick Price Check")
    print("-" * 40)
    quick_query = {
        'flight_number': 'VJ156',
        'departure_airport': 'SGN',
        'arrival_airport': 'HAN',
        'flight_date': '2025-12-20',
        'departure_time': '18:00',
        'classes': 'economy',
        'days_to_flight': 2,
        'type_of_plane': 'Airbus A321'
    }
    
    price = engine.predict_price(quick_query)
    print(f"Predicted Price: {price:,.0f} VND\n")
    
    print("="*80)
    print(" Example completed successfully!")
    print("="*80 + "\n")


if __name__ == '__main__':
    example_usage()