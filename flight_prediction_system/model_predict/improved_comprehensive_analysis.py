
import pandas as pd
import numpy as np
from datetime import datetime
import sys
import os
import io

# Fix encoding for Windows console
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comprehensive_flight_analysis import ComprehensiveFlightAnalysis
from inference_engine import FlightIntelligenceEngine


class ImprovedFlightAnalyzer:
    """Phân tích chuyến bay với dự đoán cải thiện"""
    
    # Taxes theo hãng (VND)
    AIRLINE_TAXES = {
        'VJ': 584000,   # 20k + 100k + 464k
        'VN': 570000,   # 20k + 100k + 450k
        'QH': 595200,   # 20k + 100k + 475.2k
        'VU': 638400    # 20k + 100k + 518.4k
    }
    
    VAT_RATE = 1.08  # 8% VAT
    
    def __init__(self, package_dir='deployment_package'):
        # Load engine WITHOUT price adjuster
        self.engine = FlightIntelligenceEngine(package_dir, enable_price_adjustment=False)
        self.analyzer = ComprehensiveFlightAnalysis(self.engine)
        
    def predict_with_taxes(self, flight_info):
        
        # Dự đoán giá CUỐI CÙNG (đã bao gồm thuế + VAT)
        # Model được train với data đã qua last_preprocessing.py
        # => Giá trong data = (base_fare * 1.08) + taxes
        # => Model predict ra cũng là giá cuối cùng
        final_price = self.engine.predict_price(flight_info)
        
        # Extract airline để breakdown
        airline = self.engine._extract_airline(flight_info.get('flight_number', ''))
        taxes = self.AIRLINE_TAXES.get(airline, 584000)
        
        # Tính NGƯỢC từ giá cuối về base fare
        # final_price = (base_fare * 1.08) + taxes
        # => base_fare = (final_price - taxes) / 1.08
        base_fare = (final_price - taxes) / self.VAT_RATE
        vat = base_fare * (self.VAT_RATE - 1)
        
        return {
            'base_fare': round(base_fare, 0),
            'vat': round(vat, 0),
            'taxes': round(taxes, 0),
            'total': round(final_price, 0),  # Giá cuối = giá model predict
            'breakdown': f'({base_fare:,.0f} * 1.08) + {taxes:,.0f} = {final_price:,.0f}'
        }
    
    def analyze_with_improved_prediction(self, flight_info, actual_price=None):
   
        print("\n" + "="*90)
        print("func analyze_with_improved_prediction()")
        print("="*90 + "\n")
        
        # Extract basic info
        airline = self.engine._extract_airline(flight_info.get('flight_number', ''))
        time_bucket = self.engine._get_time_bucket(flight_info.get('departure_time', ''))
        
        # Print flight info
        print("📋 THÔNG TIN CHUYẾN BAY")
        print("-" * 90)
        print(f"   Tuyến bay: {flight_info['departure_airport']} → {flight_info['arrival_airport']}")
        print(f"   Ngày bay: {flight_info['flight_date']}")
        print(f"   Hãng bay: {airline} - Chuyến bay: {flight_info.get('flight_number', 'N/A')}")
        print(f"   Hạng vé: {flight_info['classes']}")
        print(f"   Giờ khởi hành: {flight_info.get('departure_time', 'N/A')} ({time_bucket})")
        print(f"   Thời gian đặt trước: {flight_info['days_to_flight']} ngày")
        if actual_price:
            print(f"   Giá thực tế: {actual_price:,.0f} VND")
        print()
        
        # Predict with taxes
        prediction_detail = self.predict_with_taxes(flight_info)
        
        print("💰 DỰ ĐOÁN GIÁ CHI TIẾT (CẢI TIẾN)")
        print("-" * 90)
        print(f"   1. Giá vé gốc (Base Fare):  {prediction_detail['base_fare']:>12,.0f} VND")
        print(f"   2. VAT (8%):                {prediction_detail['vat']:>12,.0f} VND")
        print(f"   3. Thuế & Phí:              {prediction_detail['taxes']:>12,.0f} VND")
        print(f"   " + "-" * 60)
        print(f"   💰 TỔNG GIÁ DỰ ĐOÁN:        {prediction_detail['total']:>12,.0f} VND")
        print(f"\n   📐 Công thức: {prediction_detail['breakdown']}")
        
        if actual_price:
            error = abs(prediction_detail['total'] - actual_price)
            error_percent = (error / actual_price * 100) if actual_price > 0 else 0
            
            print(f"\n   ✅ Giá thực tế:             {actual_price:>12,.0f} VND")
            print(f"   📊 Sai số:                  {error:>12,.0f} VND ({error_percent:.1f}%)")
            
            if error_percent < 10:
                status = "🌟 EXCELLENT - Dự đoán rất chính xác!"
            elif error_percent < 15:
                status = "✅ GOOD - Dự đoán tốt"
            elif error_percent < 25:
                status = "⚠️ FAIR - Dự đoán chấp nhận được"
            else:
                status = "❌ POOR - Cần cải thiện"
            
            print(f"\n   {status}")
        
        print()
        
        # Phân tích chi tiết (sử dụng total price)
        route = f"{flight_info['departure_airport']}_{flight_info['arrival_airport']}"
        
        # Classification
        print("🏷️  PHÂN LOẠI GIÁ VÉ")
        print("-" * 90)
        classification = self.engine.classify_price(
            prediction_detail['total'], route, airline, flight_info['classes']
        )
        
        category_emoji = {
            'Cheap': '🟢',
            'Normal': '🟡',
            'Expensive': '🔴'
        }
        
        print(f"   {category_emoji.get(classification['category'], '⚪')} Phân loại: {classification['category']}")
        print(f"   Độ tin cậy: {classification['confidence']}")
        print(f"   Lý do: {classification['reason']}")
        
        if classification['stats']:
            print(f"\n   📊 So sánh với lịch sử:")
            print(f"      Q1 (25%): {classification['stats']['q1']:,.0f} VND")
            print(f"      Median (50%): {classification['stats']['median']:,.0f} VND")
            print(f"      Q3 (75%): {classification['stats']['q3']:,.0f} VND")
            print(f"      Mean (TB): {classification['stats']['mean']:,.0f} VND")
        print()
        
        # Deal Alert
        print("🚨 DEAL ALERT")
        print("-" * 90)
        deal_alert = self.analyzer.check_deal_alert(
            flight_info, prediction_detail['total'], actual_price
        )
        print(f"   {deal_alert['emoji']} {deal_alert['deal_quality']}")
        print(f"   {deal_alert['message']}")
        print()
        
        # Buy Score
        print("⭐ BUY SCORE")
        print("-" * 90)
        buy_score = self.engine.calculate_buy_score(flight_info, prediction_detail['total'])
        
        score_emoji = {
            'Excellent': '🌟',
            'Good': '⭐',
            'Medium': '⚡',
            'Poor': '❌'
        }
        
        print(f"   {score_emoji.get(buy_score['level'], '⚪')} Điểm số: {buy_score['score']}/100 ({buy_score['level']})")
        print(f"   💡 {buy_score['recommendation']}")
        print()
        
        # Price Trend
        print("📊 XU HƯỚNG GIÁ")
        print("-" * 90)
        price_trend = self.analyzer.calculate_price_trend(flight_info, days_forecast=30)
        print(f"   {price_trend['emoji']} Xu hướng: {price_trend['trend']}")
        print(f"   {price_trend['advice']}")
        print()
        
        # Volatility
        print("📈 MỨC ĐỘ BIẾN ĐỘNG")
        print("-" * 90)
        volatility = self.engine.assess_volatility(route, airline, flight_info['classes'])
        
        volatility_emoji = {
            'Very Low': '🟢',
            'Low': '🟢',
            'Medium': '🟡',
            'High': '🟠',
            'Very High': '🔴'
        }
        
        print(f"   {volatility_emoji.get(volatility['level'], '⚪')} Mức độ: {volatility['level']}")
        if 'advice' in volatility:
            print(f"   💡 {volatility['advice']}")
        print()
        
        # Optimal Booking Time
        print("🕐 THỜI ĐIỂM TỐT NHẤT ĐẶT VÉ (TỪ HIỆN TẠI ĐẾN NGÀY BAY)")
        print("-" * 90)
        optimal_time = self.engine.find_optimal_booking_time(flight_info)
        
        if 'error' in optimal_time:
            print(f"   ⚠️ {optimal_time.get('message', optimal_time['error'])}")
        elif 'optimal_days' in optimal_time and optimal_time['optimal_days']:
            print(f"   📅 Ngày bay: {flight_info['flight_date']} (còn {flight_info['days_to_flight']} ngày)")
            print(f"   💰 Giá nếu đặt HÔM NAY: {optimal_time['current_price']:>12,.0f} VND")
            print()
            print(f"   🎯 Thời điểm tốt nhất: {optimal_time['days_from_now']} ngày nữa ({optimal_time['optimal_date']})")
            print(f"   💰 Giá dự đoán tốt nhất:  {optimal_time['optimal_price']:>12,.0f} VND")
            print(f"   💵 Tiết kiệm so với nay:  {optimal_time['savings_vs_now']:>12,.0f} VND ({optimal_time['savings_percent']})")
            print()
            print(f"   💡 {optimal_time['recommendation']}")
        print()
        
        # Confidence
        print("🎯 MỨC ĐỘ TIN CẬY")
        print("-" * 90)
        confidence = self.analyzer.assess_price_confidence(flight_info, prediction_detail['total'])
        print(f"   {confidence['emoji']} Độ tin cậy: {confidence['confidence']} ({confidence['score']}/100)")
        print(f"   {confidence['message']}")
        print()
        
        print("="*90 + "\n")
        
        return {
            'prediction': prediction_detail,
            'classification': classification,
            'deal_alert': deal_alert,
            'buy_score': buy_score,
            'price_trend': price_trend,
            'volatility': volatility,
            'optimal_booking': optimal_time,
            'confidence': confidence
        }


def demo_improved():
    
    print("\n" + "="*100)
    print("DEMO: PHÂN TÍCH CHUYẾN BAY CẢI TIẾN")
    print("="*100 + "\n")
    
    print("Đang khởi tạo hệ thống cải tiến...")
    analyzer = ImprovedFlightAnalyzer('deployment_package')
    print("✅ Hệ thống sẵn sàng!\n")
    
    # Base flight info
    base_flight_info = {
        'flight_number': 'VJ182',
        'departure_airport': 'SGN',
        'arrival_airport': 'HAN',
        'flight_date': '2025-12-31', # yyyyy-mm-dd  
        'departure_time': '23:20',
        'arrival_time': '01:30',
        'classes': 'Eco'
    }

    # Format '%Y-%m-%d'=>  '2025-12-20'
    flight_date_obj = datetime.strptime(base_flight_info['flight_date'], '%Y-%m-%d').date()

    # 2. Lấy ngày hiện tại
    current_date = datetime.now().date()

    #  khoảng cách ngày (ngày bay - ngày hiện tại)
    delta = flight_date_obj - current_date
    days_to_flight = delta.days

    actual_price = 1162500 

    # Test Case 1: Without type_of_plane (missing field)
    print("\n" + "="*100)
    print("TEST CASE 1: KHÔNG CÓ type_of_plane (thiếu field)")
    print("="*100)
    flight_info_1 = base_flight_info.copy()
    flight_info_1['days_to_flight'] = days_to_flight
    # Không thêm type_of_plane
    
    result_1 = analyzer.analyze_with_improved_prediction(flight_info_1, actual_price)
    
    print("\n" + "="*100)
    print("TEST CASE 2: VỚI type_of_plane = '' (chuỗi rỗng)")
    print("="*100)
    flight_info_2 = base_flight_info.copy()
    flight_info_2['days_to_flight'] = days_to_flight
    flight_info_2['type_of_plane'] = ''  # Empty string
    
    result_2 = analyzer.analyze_with_improved_prediction(flight_info_2, actual_price)
    
    print("\n" + "="*100)
    print("TEST CASE 3: VỚI type_of_plane = 'Airbus A321'")
    print("="*100)
    flight_info_3 = base_flight_info.copy()
    flight_info_3['days_to_flight'] = days_to_flight
    flight_info_3['type_of_plane'] = 'Airbus A321'
    
    result_3 = analyzer.analyze_with_improved_prediction(flight_info_3, actual_price)
    
    print("\n" + "="*100)
    print("✅ SO SÁNH KẾT QUẢ")
    print("="*100 + "\n")
    
    print("📝 TÓM TẮT:")
    print("-" * 100)
    print(f"\n   Case 1 (Không có type_of_plane):")
    print(f"      Base Fare: {result_1['prediction']['base_fare']:,.0f} VND")
    print(f"      TỔNG: {result_1['prediction']['total']:,.0f} VND")
    
    print(f"\n   Case 2 (type_of_plane = ''):")
    print(f"      Base Fare: {result_2['prediction']['base_fare']:,.0f} VND")
    print(f"      TỔNG: {result_2['prediction']['total']:,.0f} VND")
    
    print(f"\n   Case 3 (type_of_plane = 'Airbus A321'):")
    print(f"      Base Fare: {result_3['prediction']['base_fare']:,.0f} VND")
    print(f"      TỔNG: {result_3['prediction']['total']:,.0f} VND")
    
    print(f"\n   ✅ Case 1 và Case 2 giống nhau: {result_1['prediction']['total'] == result_2['prediction']['total']}")
    print(f"   📊 Chênh lệch Case 1 vs Case 2: {abs(result_1['prediction']['total'] - result_2['prediction']['total']):,.0f} VND")
    print(f"   📊 Chênh lệch Case 1 vs Case 3: {abs(result_1['prediction']['total'] - result_3['prediction']['total']):,.0f} VND")
    print("\n")


if __name__ == '__main__':
    demo_improved()

