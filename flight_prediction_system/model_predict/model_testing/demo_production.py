from fast_loader import FastFlightRecommender
from datetime import datetime, timedelta
import pandas as pd


def print_section(title):
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80 + "\n")


def demo_complete_workflow():
    print_section("FLIGHT RECOMMENDER - PRODUCTION DEMO")    
    recommender = FastFlightRecommender()
    # lấy những chuyến bay 
    # ========================================
    print_section("STEP 2: available routes")
    print("\n\nAll routes from SGN (Ho Chi Minh City):")
    routes_from_sgn = recommender.list_available_routes('SGN')
    print(routes_from_sgn.head(10).to_string(index=False))
    
    # ========================================
    # STEP 3: gợi ý cho chuyến bay cụ thể
    # ========================================
    print_section("STEP 3: recommendation for specific flight")    
    result = recommender.get_recommendation(
        departure_airport='SGN',
        arrival_airport='HAN',
        flight_date=datetime.now() + timedelta(days=120),
        budget=None 
    )
    
    if result['status'] == 'success':
        print(f"Route: {result['route']}")
        print(f"Date: {result['date']}")
        print(f"Total Options Found: {result['total_options']}\n")
        
        # Best value recommendation
        best = result['best_value']
        print("BEST VALUE RECOMMENDATION:")
        print("─" * 80)
        print(f"   Flight Number:    {best['flight_number']}")
        print(f"   Departure Time:   {best['departure_time']}")
        print(f"   Class:            {best['class']}")
        print(f"   Current Price:    {best['price']:,.0f} VND")
        print(f"   Predicted Price:  {best['predicted_price']:,.0f} VND")
        print(f"   Price Change:     {best['price_change_pct']:+.1f}%")
        print(f"   \n   Buy Score:        {best['buy_score']}/100 ")
        print(f"   Confidence:       {best['confidence']}/100")
        print(f"   Price Class:      {best['price_class']}")
        print(f"   Trend:            {best['trend']}")
        print(f"   Urgency:          {best['urgency']}")
        print(f"   \n  {best['recommendation']}")
        
        # Cheapest option
        print("\n\nCHEAPEST OPTION:")
        print("─" * 80)
        cheap = result['cheapest']
        print(f"   Flight Number:    {cheap['flight_number']}")
        print(f"   Price:            {cheap['price']:,.0f} VND")
        print(f"   Buy Score:        {cheap['buy_score']}/100")
        print(f"   {cheap['recommendation']}")
        
        # top 5 options
        print("\n\nTOP 5 OPTIONS (by Buy Score):")
        print("─" * 80)
        print(f"{'Flight':<10} {'Price':>12} {'Buy Score':>10} {'Trend':<10} {'Recommendation':<30}")
        print("─" * 80)
        for option in result['all_options'][:5]:
            print(f"{option['flight_number']:<10} "
                  f"{option['price']:>12,.0f} "
                  f"{option['buy_score']:>10.1f} "
                  f"{option['trend']:<10} "
                  f"{option['recommendation']:<30}")
    
    else:
        print(f"{result['message']}")
        print("\nSuggestions:")
        for suggestion in result['suggestions']:
            print(f"   • {suggestion}")
    
    # ========================================
    # STEP 4: Compare multiple dates
    # ========================================
    print_section("STEP 4: Compare Prices Across Different Dates")
    
    dates_to_check = [
        datetime.now() + timedelta(days=7),
        datetime.now() + timedelta(days=14),
        datetime.now() + timedelta(days=25),
        datetime.now() + timedelta(days=30),
    ]
    
    print("Comparing prices for SGN → HAN across dates:\n")
    print(f"{'Date':<15} {'Min Price':>12} {'Avg Price':>12} {'Options':>8} {'Best Score':>11}")
    print("─" * 80)
    
    for date in dates_to_check:
        result = recommender.get_recommendation(
            departure_airport='SGN',
            arrival_airport='HAN',
            flight_date=date,
            budget=None
        )
        
        if result['status'] == 'success':
            prices = [opt['price'] for opt in result['all_options']]
            min_price = min(prices)
            avg_price = sum(prices) / len(prices)
            best_score = result['best_value']['buy_score']
            
            print(f"{date.strftime('%Y-%m-%d'):<15} "
                  f"{min_price:>12,.0f} "
                  f"{avg_price:>12,.0f} "
                  f"{result['total_options']:>8} "
                  f"{best_score:>11.1f}")
    
    # ========================================
    # STEP 5: Get price history for specific flight
    # ========================================
    print_section("STEP 5: View Historical Prices")
    
    # Get a sample flight from previous results
    if result['status'] == 'success':
        sample_flight = result['all_options'][0]
        
        print(f"Price history for {sample_flight['flight_number']}:")
        print(f"   Route: {result['route']}")
        print(f"   Date: {sample_flight['flight_date']}\n")
        
        try:
            history = recommender.get_price_history(
                flight_number=sample_flight['flight_number'],
                flight_date=sample_flight['flight_date'],
                class_type=sample_flight['class']
            )
            
            if len(history) > 0:
                print(history.to_string(index=False))
                
                # Calculate statistics
                price_trend = history['price'].iloc[-1] - history['price'].iloc[0]
                print(f"\n   Price trend: {price_trend:+,.0f} VND")
                print(f"   Min price: {history['price'].min():,.0f} VND")
                print(f"   Max price: {history['price'].max():,.0f} VND")
                print(f"   Current: {history['price'].iloc[-1]:,.0f} VND")
            else:
                print("   No historical data available")
        except Exception as e:
            print(f"   Could not load history: {e}")
    
    # ========================================
    # STEP 6: Advanced filtering
    # ========================================
    print_section("STEP 6: Advanced Search with Budget")
    
    print("Finding cheap flights HAN → SGN under 1.5M VND:\n")
    
    result = recommender.get_recommendation(
        departure_airport='HAN',
        arrival_airport='SGN',
        flight_date=datetime.now() + timedelta(days=21),
        budget=1500000  # 1.5 million VND max
    )
    
    if result['status'] == 'success' and result['total_options'] > 0:
        print(f"Found {result['total_options']} options under budget!\n")
        
        for i, option in enumerate(result['all_options'][:5], 1):
            print(f"{i}. {option['flight_number']} - {option['price']:,.0f} VND")
            print(f"   Buy Score: {option['buy_score']}/100 - {option['recommendation']}")
            print()
    else:
        print("No flights found under this budget")
    
    # ========================================
    # SUMMARY
    # ========================================
    print_section("DEMO COMPLETE")
    
    print("Key Features Demonstrated:")
    print("   Fast loading (<1 second)")
    print("   Route browsing")
    print("   AI-powered recommendations")
    print("   Price predictions & trends")
    print("   Multi-date comparison")
    print("   Historical price tracking")
    print("   Budget filtering")
    print("\nThis system is ready for:")
    print("   Web application integration")
    print("   REST API deployment")
    print("   Real-time flight recommendations")
    print("   Price monitoring & alerts")


def simple_usage_example():
    """Minimal example for quick reference."""
    
    print_section("SIMPLE USAGE EXAMPLE")    
    recommender = FastFlightRecommender()    
    result = recommender.get_recommendation(
        departure_airport='SGN',
        arrival_airport='HAN', 
        flight_date='2025-03-15',
        budget=2000000
    )    
    if result['status'] == 'success':
        best = result['best_value']
        print(f"Best flight: {best['flight_number']}")
        print(f"Price: {best['price']:,.0f} VND")
        print(f"Buy Score: {best['buy_score']}/100")
        print(f"Recommendation: {best['recommendation']}")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == '--simple':
        simple_usage_example()
    else:
        demo_complete_workflow()