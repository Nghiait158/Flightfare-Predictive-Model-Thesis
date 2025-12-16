import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inference_engine import FlightIntelligenceEngine


class SmartFlightRecommender:
    def __init__(self, engine: FlightIntelligenceEngine):
        self.engine = engine
        self.airlines = ['VN', 'VJ', 'QH', 'VU'] 
        self.flight_classes = ['Eco', 'Business']
        self.time_slots = {
            'Morning': ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00'],
            'Afternoon': ['12:00', '13:00', '14:00', '15:00', '16:00'],
            'Evening': ['17:00', '18:00', '19:00', '20:00'],
            'Night': ['21:00', '22:00', '23:00']
        }
        
    def generate_flight_options(self, 
                               departure: str,
                               arrival: str,
                               target_date: str,
                               date_flexibility: int = 3) -> List[Dict]:
        """
        Generate all possible flight combinations for analysis.
        
        Args:
            departure: Departure airport code (e.g., 'SGN')
            arrival: Arrival airport code (e.g., 'HAN')
            target_date: Target flight date (YYYY-MM-DD)
            date_flexibility: Number of days before/after to consider
        
        Returns:
            List of flight option dictionaries
        """
        target_dt = datetime.strptime(target_date, '%Y-%m-%d')
        today = datetime.now()
        
        flight_options = []
        
        for day_offset in range(-date_flexibility, date_flexibility + 1):
            flight_date = target_dt + timedelta(days=day_offset)
            days_to_flight = (flight_date - today).days
            
            if days_to_flight < 0:
                continue 
            
            for airline in self.airlines:
                flight_numbers = [f"{airline}{i*100}" for i in range(1, 3)]  # 2 flights per airline
                
                for flight_num in flight_numbers:
                    for flight_class in self.flight_classes:
                        for time_bucket, times in self.time_slots.items():
                            for dep_time in times[:2]:  # Take 2 times per bucket to reduce combinations
                                flight_options.append({
                                    'flight_number': flight_num,
                                    'departure_airport': departure,
                                    'arrival_airport': arrival,
                                    'flight_date': flight_date.strftime('%Y-%m-%d'),
                                    'departure_time': dep_time,
                                    'arrival_time': dep_time,  # Simplified
                                    'classes': flight_class,
                                    'days_to_flight': days_to_flight,
                                    'type_of_plane': 'Airbus A321' if airline in ['VN', 'VJ'] else 'Boeing 787'
                                })
        
        return flight_options
    
    def analyze_flight(self, flight_info: Dict) -> Dict:
        """
        Analyze a single flight and get intelligence report.
        """
        try:
            # Get prediction
            predicted_price = self.engine.predict_price(flight_info)
            
            # Get classification
            route = f"{flight_info['departure_airport']}_{flight_info['arrival_airport']}"
            airline = self.engine._extract_airline(flight_info['flight_number'])
            classification = self.engine.classify_price(
                predicted_price, route, airline, flight_info['classes']
            )
            
            # Get buy score
            buy_score = self.engine.calculate_buy_score(flight_info, predicted_price)
            
            return {
                'flight_info': flight_info,
                'predicted_price': predicted_price,
                'classification': classification,
                'buy_score': buy_score,
                'success': True
            }
        except Exception as e:
            return {
                'flight_info': flight_info,
                'error': str(e),
                'success': False
            }
    
    def calculate_overall_score(self, analysis: Dict, preferences: Dict, budget: float) -> float:
        """
        Calculate overall recommendation score (0-100) based on multiple factors.
        
        Factors:
        - Buy score (40 points)
        - Price competitiveness (30 points)
        - Preference match (20 points)
        - Budget fit (10 points)
        """
        if not analysis['success']:
            return 0
        
        score = 0
        flight = analysis['flight_info']
        
        # 1. Buy Score (40 points)
        buy_score_normalized = (analysis['buy_score']['score'] / 100) * 40
        score += buy_score_normalized
        
        # 2. Price Competitiveness (30 points)
        if analysis['classification']['category'] == 'Cheap':
            score += 30
        elif analysis['classification']['category'] == 'Normal':
            score += 15
        else:
            score += 5
        
        # 3. Preference Match (20 points)
        pref_score = 0
        
        # Time preference
        time_bucket = self.engine._get_time_bucket(flight['departure_time'])
        if time_bucket == preferences.get('preferred_time'):
            pref_score += 7
        
        # Class preference
        if flight['classes'] == preferences.get('preferred_class'):
            pref_score += 7
        
        # Airline preference
        airline = self.engine._extract_airline(flight['flight_number'])
        if airline in preferences.get('preferred_airlines', []):
            pref_score += 6
        
        score += pref_score
        
        # 4. Budget Fit (10 points)
        if analysis['predicted_price'] <= budget:
            price_ratio = analysis['predicted_price'] / budget
            budget_score = 10 * (1 - price_ratio * 0.5)  # Better score for cheaper within budget
            score += max(0, budget_score)
        else:
            # Penalty for over budget
            score -= 10
        
        return min(100, max(0, score))
    
    def recommend_flights(self,
                         departure: str,
                         arrival: str,
                         target_date: str,
                         budget: float,
                         preferences: Dict = None) -> Dict:
        """
        Main recommendation function.
        
        Args:
            departure: Departure airport (e.g., 'SGN')
            arrival: Arrival airport (e.g., 'HAN')
            target_date: Target date (YYYY-MM-DD)
            budget: Maximum budget in VND
            preferences: Dict with user preferences
                - preferred_time: 'Morning'/'Afternoon'/'Evening'/'Night'
                - preferred_class: 'Eco'/'Business'
                - preferred_airlines: List of airline codes
                - date_flexibility: int (days)
        
        Returns:
            Dict with recommendations
        """
        if preferences is None:
            preferences = {
                'preferred_time': 'Morning',
                'preferred_class': 'Eco',
                'preferred_airlines': ['VN', 'VJ'],
                'date_flexibility': 3
            }
        
        print("\n" + "="*80)
        print(" SMART FLIGHT RECOMMENDATION ENGINE")
        print("="*80)
        print(f"\n Route: {departure} → {arrival}")
        print(f" Target Date: {target_date}")
        print(f" Budget: {budget:,.0f} VND")
        print(f"  Preferences: {preferences}")
        
        # Generate flight options
        print("\n" + "-"*80)
        print(" Analyzing flight options...")
        
        flight_options = self.generate_flight_options(
            departure, arrival, target_date, 
            preferences.get('date_flexibility', 3)
        )
        
        print(f"\nGenerated {len(flight_options)} flight combinations to analyze...")
        
        # Analyze each option
        analyses = []
        for flight in flight_options:
            analysis = self.analyze_flight(flight)
            if analysis['success']:
                # Calculate overall score
                overall_score = self.calculate_overall_score(analysis, preferences, budget)
                analysis['overall_score'] = overall_score
                analyses.append(analysis)
        
        print(f" Successfully analyzed {len(analyses)} flight options")
        
        # Sort by overall score
        analyses.sort(key=lambda x: x['overall_score'], reverse=True)
        
        # Categorize recommendations
        recommendations = {
            'best_value': [],  # Top overall scores
            'cheapest': [],    # Lowest prices
            'preferred_time': [],  # Best at preferred time
            'alternative_dates': []  # Good deals on alternative dates
        }
        
        # Filter for budget
        within_budget = [a for a in analyses if a['predicted_price'] <= budget]
        all_options = analyses  # Keep all for alternative suggestions
        
        # Best Value (top 3 overall scores within budget)
        recommendations['best_value'] = within_budget[:3] if within_budget else all_options[:3]
        
        # Cheapest (top 3 lowest prices)
        cheapest = sorted(all_options, key=lambda x: x['predicted_price'])[:3]
        recommendations['cheapest'] = cheapest
        
        # Preferred Time (best scores at preferred time)
        preferred_time = preferences.get('preferred_time', 'Morning')
        time_matches = [
            a for a in all_options 
            if self.engine._get_time_bucket(a['flight_info']['departure_time']) == preferred_time
        ]
        recommendations['preferred_time'] = sorted(
            time_matches, key=lambda x: x['overall_score'], reverse=True
        )[:3]
        
        # Alternative Dates (best on different dates)
        target_dt = datetime.strptime(target_date, '%Y-%m-%d').date()
        alternative = [
            a for a in all_options
            if datetime.strptime(a['flight_info']['flight_date'], '%Y-%m-%d').date() != target_dt
        ]
        recommendations['alternative_dates'] = sorted(
            alternative, key=lambda x: x['predicted_price']
        )[:3]
        
        # Print recommendations
        self._print_recommendations(recommendations, budget, target_date)
        
        return {
            'recommendations': recommendations,
            'total_analyzed': len(analyses),
            'within_budget': len(within_budget),
            'budget': budget
        }
    
    def _print_recommendations(self, recommendations: Dict, budget: float, target_date: str):
        """Pretty print recommendations"""
        
        print("\n" + "="*80)
        print(" GENERATING RECOMMENDATIONS")
        print("="*80)
        
        print("\n\n" + "="*80)
        print(" RECOMMENDATION RESULTS")
        print("="*80)
        
        print(f"\n Analysis Summary:")
        print(f"   • Total options analyzed: {sum(len(v) for v in recommendations.values())}")
        print(f"   • Budget: {budget:,.0f} VND")
        
        # Best Value
        print("\n" + "="*80)
        print(" BEST VALUE FLIGHTS")
        print("Optimal balance of price, timing, and quality")
        print("="*80)
        
        for i, analysis in enumerate(recommendations['best_value'], 1):
            self._print_flight_option(i, analysis, budget, target_date)
        
        # Cheapest
        print("\n" + "="*80)
        print(" CHEAPEST OPTIONS")
        print("Lowest prices available")
        print("="*80)
        
        for i, analysis in enumerate(recommendations['cheapest'], 1):
            self._print_flight_option(i, analysis, budget, target_date)
        
        # Preferred Time
        if recommendations['preferred_time']:
            time_bucket = self.engine._get_time_bucket(
                recommendations['preferred_time'][0]['flight_info']['departure_time']
            )
            print("\n" + "="*80)
            print(f" BEST TIMING ({time_bucket})")
            print(f"Best {time_bucket} flights with good value")
            print("="*80)
            
            for i, analysis in enumerate(recommendations['preferred_time'], 1):
                self._print_flight_option(i, analysis, budget, target_date)
        
        # Alternative Dates
        if recommendations['alternative_dates']:
            print("\n" + "="*80)
            print(" ALTERNATIVE DATES")
            print("Cheaper options on nearby dates")
            print("="*80)
            
            for i, analysis in enumerate(recommendations['alternative_dates'], 1):
                self._print_flight_option(i, analysis, budget, target_date)
        
        print("\n" + "="*80)
        print(" RECOMMENDATION COMPLETE")
        print("="*80 + "\n")
    
    def _print_flight_option(self, index: int, analysis: Dict, budget: float, target_date: str):
        """Print a single flight option"""
        flight = analysis['flight_info']
        price = analysis['predicted_price']
        
        airline = self.engine._extract_airline(flight['flight_number'])
        time_bucket = self.engine._get_time_bucket(flight['departure_time'])
        
        print(f"\n   Option {index}:")
        print(f"     {airline} {flight['flight_number']} - {flight['classes']}")
        print(f"    {flight['flight_date']} at {flight['departure_time']} ({time_bucket})")
        
        # Price with budget indicator
        if price <= budget:
            savings = budget - price
            print(f"    {price:,.0f} VND  (Save {savings:,.0f} VND)")
        else:
            over = price - budget
            print(f"    {price:,.0f} VND   (Over budget by {over:,.0f} VND)")
        
        print(f"    Overall Score: {analysis['overall_score']:.1f}/100")
        print(f"    Buy Score: {analysis['buy_score']['score']}/100 ({analysis['buy_score']['level']})")
        print(f"     Category: {analysis['classification']['category']}")
        print(f"     Book in: {flight['days_to_flight']} days")


def get_user_input():
    """Get user input for flight search"""
    print("SMART FLIGHT RECOMMENDER - INTERACTIVE DEMO")
    
    # Departure
    print(" DEPARTURE AIRPORT")
    print("   Common: SGN (Ho Chi Minh), HAN (Hanoi), DAD (Da Nang)")
    departure = input("   Enter departure airport code: ").strip().upper()
    
    print("\n ARRIVAL AIRPORT")
    arrival = input("   Enter arrival airport code: ").strip().upper()
    
    print("\n FLIGHT DATE")
    print("   Format: YYYY-MM-DD (e.g., 2025-12-25)")
    target_date = input("   Enter target date: ").strip()
    
    try:
        datetime.strptime(target_date, '%Y-%m-%d')
    except:
        print("     Invalid date format. Using default: 2025-12-25")
        target_date = '2025-12-25'
    
    # Budget
    print("\n BUDGET")
    budget_str = input("   Enter maximum budget (VND): ").strip()
    try:
        budget = float(budget_str.replace(',', ''))
    except:
        print("     Invalid budget. Using default: 2,000,000 VND")
        budget = 2000000
    
    # Preferences
    print("\n  PREFERENCES (Optional - press Enter to use defaults)")
    
    print("\n   Preferred time (Morning/Afternoon/Evening/Night):")
    preferred_time = input("   > ").strip().capitalize() or 'Morning'
    
    print("\n   Preferred class (Eco/Business):")
    preferred_class = input("   > ").strip().capitalize() or 'Eco'
    
    print("\n   Preferred airlines (comma-separated, e.g., VN,VJ):")
    airlines_input = input("   > ").strip().upper()
    preferred_airlines = [a.strip() for a in airlines_input.split(',')] if airlines_input else ['VN', 'VJ']
    
    print("\n   Date flexibility (days ±):")
    flex_input = input("   > ").strip()
    date_flexibility = int(flex_input) if flex_input.isdigit() else 3
    
    preferences = {
        'preferred_time': preferred_time,
        'preferred_class': preferred_class,
        'preferred_airlines': preferred_airlines,
        'date_flexibility': date_flexibility
    }
    
    return departure, arrival, target_date, budget, preferences


def demo_with_defaults():
    """Run demo with default values (for quick testing)"""
    print("SMART FLIGHT RECOMMENDER - DEMO")
    
    # Initialize engine
    print("\n" + "="*60)
    print(" LOADING FLIGHT INTELLIGENCE ENGINE")
    print("="*60 + "\n")
    
    engine = FlightIntelligenceEngine('deployment_package')    
    recommender = SmartFlightRecommender(engine)
    
    # Demo values
    departure = 'SGN'
    arrival = 'HAN'
    target_date = '2025-12-25'
    budget = 2000000
    preferences = {
        'preferred_time': 'Morning',
        'preferred_class': 'Eco',
        'preferred_airlines': ['VN', 'VJ'],
        'date_flexibility': 5
    }
    
    # Get recommendations
    results = recommender.recommend_flights(
        departure=departure,
        arrival=arrival,
        target_date=target_date,
        budget=budget,
        preferences=preferences
    )
    
    # Quick summary
    print("QUICK ACCESS EXAMPLES:")
    
    best = results['recommendations']['best_value'][0] if results['recommendations']['best_value'] else None
    cheapest = results['recommendations']['cheapest'][0] if results['recommendations']['cheapest'] else None
    alt = results['recommendations']['alternative_dates'][0] if results['recommendations']['alternative_dates'] else None
    
    if best:
        airline = engine._extract_airline(best['flight_info']['flight_number'])
        print(f" Recommended: {airline} {best['flight_info']['flight_number']}")
        print(f"   Price: {best['predicted_price']:,.0f} VND")
        print(f"   Date: {best['flight_info']['flight_date']} at {best['flight_info']['departure_time']}\n")
    
    if cheapest:
        airline = engine._extract_airline(cheapest['flight_info']['flight_number'])
        print(f" Cheapest: {airline} {cheapest['flight_info']['flight_number']}")
        print(f"   Price: {cheapest['predicted_price']:,.0f} VND")
        print(f"   Date: {cheapest['flight_info']['flight_date']}\n")
    
    if alt:
        print(f" Alternative: Fly on {alt['flight_info']['flight_date']} instead")
        print(f"   Price: {alt['predicted_price']:,.0f} VND")
        print(f"   Save compared to target date\n")
    
    print("DEMO COMPLETED!")


def interactive_demo():
    print("\n Initializing Flight Intelligence Engine...")
    engine = FlightIntelligenceEngine('deployment_package')
    print(" Engine loaded!\n")
    
    recommender = SmartFlightRecommender(engine)
    
    departure, arrival, target_date, budget, preferences = get_user_input()
    
    results = recommender.recommend_flights(
        departure=departure,
        arrival=arrival,
        target_date=target_date,
        budget=budget,
        preferences=preferences
    )
    
    print("SEARCH SUMMARY")
    print(f"Route: {departure} → {arrival}")
    print(f"Date: {target_date}")
    print(f"Budget: {budget:,.0f} VND")
    print(f"Options analyzed: {results['total_analyzed']}")
    print(f"Within budget: {results['within_budget']}")


if __name__ == '__main__':
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == '--interactive':
        interactive_demo()
    else:
        demo_with_defaults()
        
        print("\n TIP: Run with --interactive flag for custom input:")
        print("   python smart_flight_recommender.py --interactive\n")
