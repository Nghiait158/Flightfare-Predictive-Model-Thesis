import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fast_loader import FastFlightRecommender
from datetime import datetime, timedelta

# Load model
print("Loading model...")
recommender = FastFlightRecommender(package_dir='model_testing')

# INPUT: Chọn 1 trong 2 cách
departure = 'SGN'
arrival = 'HAN'

# CÁCH 1: Dùng số ngày kể từ hôm nay
days_later = 30
flight_date = datetime.now() + timedelta(days=days_later)

# CÁCH 2: Dùng ngày cụ thể (bỏ comment 2 dòng dưới nếu muốn dùng)
# flight_date = datetime.strptime('2025-03-15', '%Y-%m-%d')  # Format: YYYY-MM-DD
# days_later = (flight_date - datetime.now()).days

budget = None  # hoặc số tiền VD: 2000000

print(f"\nSearching: {departure} → {arrival}")
print(f"Date: {flight_date.strftime('%Y-%m-%d')} ({days_later} days from now)")
result = recommender.get_recommendation(
    departure_airport=departure,
    arrival_airport=arrival,
    flight_date=flight_date,
    budget=budget
)

print("\n" + "="*80)
print("RESULT:")
print("="*80)

if result['status'] == 'success':
    print(f"\nTotal flights found: {result['total_options']}")
    
    best = result['best_value']
    print(f"\nBEST FLIGHT:")
    print(f"  Flight Number:    {best['flight_number']}")
    print(f"  Current Price:    {best['price']:,.0f} VND")
    print(f"  Predicted Price:  {best['predicted_price']:,.0f} VND")
    print(f"  Buy Score:        {best['buy_score']}/100")
    print(f"  Recommendation:   {best['recommendation']}")
    print(f"  Trend:            {best['trend']}")
    print(f"  Price Class:      {best['price_class']}")
    
    print(f"\nALL OPTIONS:")
    for i, opt in enumerate(result['all_options'][:10], 1):
        print(f"{i}. {opt['flight_number']} - {opt['price']:,.0f} VND - Score: {opt['buy_score']}")
else:
    print(f"No flights found: {result['message']}")

