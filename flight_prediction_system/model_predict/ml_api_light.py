# -*- coding: utf-8 -*-
"""
Lightweight ML API Service - Fast Startup Version
Only loads essential components for prediction
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
import sys
import io
import os
import traceback
import numpy as np
import importlib

# Fix encoding for Windows console (only if not already wrapped)
if sys.platform == 'win32' and not isinstance(sys.stdout, io.TextIOWrapper):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    except (AttributeError, ValueError):
        pass  # Already wrapped or not available

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Only import the essential engine (not comprehensive analysis)
from inference_engine import FlightIntelligenceEngine
from class_mapper import normalize_class_name
from price_trend_predictor import PriceTrendPredictor
from optimal_booking_analyzer_v2 import OptimalBookingAnalyzer

app = Flask(__name__)
CORS(app)

# Initialize the engine and additional modules once at startup
print("Initializing ML Engine (Light Mode)...")
try:
    engine = FlightIntelligenceEngine(
        'deployment_package',
        enable_price_adjustment=False,
        use_improved_buy_score=True  # Enable improved buy score by default
    )
    print("ML Engine initialized!")
    if hasattr(engine, 'use_improved_buy_score') and engine.use_improved_buy_score:
        print(" Improved Buy Score ENABLED!")
    else:
        print("  Using standard buy score (fallback)")

    # Initialize new modules
    trend_predictor = PriceTrendPredictor(
        route_stats_path='deployment_package/route_statistics.parquet'
    )
    print("Price Trend Predictor initialized!")

    # Initialize v2 analyzer with current_price support
    optimal_booking = OptimalBookingAnalyzer(
        route_stats_path='deployment_package/route_statistics.parquet'
    )
    print(" Optimal Booking Analyzer V2 initialized!")
    print(f" Module: {optimal_booking.__class__.__module__}")

except Exception as e:
    print(f" Failed to initialize: {e}")
    import traceback
    traceback.print_exc()
    engine = None
    trend_predictor = None
    optimal_booking = None


# Taxes mapping
AIRLINE_TAXES = {
    'VJ': 584000,
    'VN': 570000,
    'QH': 595200,
    'VU': 638400
}
VAT_RATE = 1.08


def convert_to_json_serializable(obj):
    """Convert numpy types to Python native types for JSON serialization"""
    if isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        return float(obj)
    elif isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {key: convert_to_json_serializable(value) for key, value in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [convert_to_json_serializable(item) for item in obj]
    elif obj is None:
        return None
    return obj


def predict_with_taxes(flight_info):
    """Predict price with tax breakdown"""
    final_price = float(engine.predict_price(flight_info))  # Convert to Python float
    airline = engine._extract_airline(flight_info.get('flight_number', ''))
    taxes = AIRLINE_TAXES.get(airline, 584000)

    base_fare = (final_price - taxes) / VAT_RATE
    vat = base_fare * (VAT_RATE - 1)

    return {
        'base_fare': float(round(base_fare, 0)),
        'vat': float(round(vat, 0)),
        'taxes': float(round(taxes, 0)),
        'total': float(round(final_price, 0)),
        'breakdown': f'({base_fare:,.0f} * 1.08) + {taxes:,.0f} = {final_price:,.0f}'
    }


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'ML Flight Prediction API (Light)',
        'model_loaded': engine is not None,
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/predict', methods=['POST'])
def predict_flight_price():
    """Predict flight price with comprehensive analysis"""
    try:
        if engine is None:
            return jsonify({
                'success': False,
                'error': 'ML model not initialized'
            }), 503

        data = request.get_json()

        print("\n" + "="*80)
        print(" ML API - INCOMING REQUEST")
        # print("="*80)
        print(f"Endpoint: /api/predict")
        print(f" Timestamp: {datetime.now().isoformat()}")
        print(f" Request Method: {request.method}")
        print(f" Request Headers:")
        for key, value in request.headers:
            if key.lower() not in ['cookie', 'authorization']:  # Skip sensitive headers
                print(f"   {key}: {value}")
        print(f"\n Request Body (Raw):")
        print(f"{data}")
        print(f"\n Request Body (Formatted JSON):")
        import json
        print(json.dumps(data, indent=2, ensure_ascii=False))
        # print("="*80 + "\n")

        # Validate required fields
        required_fields = ['departure_airport', 'arrival_airport', 'flight_date', 'classes']
        missing_fields = [field for field in required_fields if field not in data or not data[field]]

        if missing_fields:
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {", ".join(missing_fields)}'
            }), 400

        # Extract and normalize class name
        airline = engine._extract_airline(data.get('flight_number', ''))
        original_class = data['classes']
        normalized_class = normalize_class_name(airline, original_class)

        # Calculate days_to_flight
        flight_date_obj = datetime.strptime(data['flight_date'], '%Y-%m-%d').date()
        current_date = datetime.now().date()
        days_to_flight = (flight_date_obj - current_date).days

        # Prepare flight info
        flight_info = {
            'flight_number': data.get('flight_number', ''),
            'departure_airport': data['departure_airport'],
            'arrival_airport': data['arrival_airport'],
            'flight_date': data['flight_date'],
            'departure_time': data.get('departure_time', '00:00'),
            'arrival_time': data.get('arrival_time', '00:00'),
            'classes': normalized_class,
            'days_to_flight': days_to_flight,
            'type_of_plane': data.get('type_of_plane', '')
        }

        # Get prediction
        prediction_detail = predict_with_taxes(flight_info)
        route = f"{flight_info['departure_airport']}_{flight_info['arrival_airport']}"

        # Get analysis
        classification = engine.classify_price(
            prediction_detail['total'], route, airline, normalized_class
        )
        buy_score = engine.calculate_buy_score(flight_info, prediction_detail['total'])
        volatility = engine.assess_volatility(route, airline, normalized_class)

        # Use new ML-based optimal booking analyzer
        print(f"\n DEBUG: optimal_booking is None? {optimal_booking is None}")
        if optimal_booking is not None:
            print(f" DEBUG: Using OptimalBookingAnalyzer with current_price={prediction_detail['total']}")
            optimal_booking_result = optimal_booking.calculate_optimal_booking_time(
                route=f"{flight_info['departure_airport']}-{flight_info['arrival_airport']}",
                class_name=normalized_class,
                flight_date=flight_info['flight_date'],
                current_days_before=days_to_flight,
                current_price=prediction_detail['total']  # Pass actual predicted price
            )
            print(f" DEBUG: optimal_booking_result['current_price_estimate'] = {optimal_booking_result.get('current_price_estimate')}")
        else:
            # Fallback to engine's method
            print(f" DEBUG: Using fallback engine.find_optimal_booking_time()")
            optimal_booking_result = engine.find_optimal_booking_time(flight_info)

        # Add price trend prediction
        if trend_predictor is not None:
            price_trend = trend_predictor.predict_trend(
                route=f"{flight_info['departure_airport']}-{flight_info['arrival_airport']}",
                class_name=normalized_class,
                current_price=prediction_detail['total'],
                days_to_flight=days_to_flight,
                forecast_days=30
            )
        else:
            # Default price trend
            price_trend = {
                'trend': 'Không rõ',
                'direction': 'UNKNOWN',
                'emoji': '❓',
                'price_change_percent': 0.0,
                'advice': 'Không có đủ dữ liệu để dự đoán xu hướng giá.',
                'confidence': 'Low',
                'confidence_score': 30
            }

        # Simple confidence score based on data availability
        has_stats = classification.get('stats') is not None
        confidence = {
            'level': 'High' if has_stats else 'Medium',
            'score': 85 if has_stats else 65,
            'message': 'Dự đoán có độ tin cậy cao' if has_stats else 'Dự đoán dựa trên dữ liệu giới hạn'
        }

        # Deal alert
        if classification['category'] == 'Cheap':
            deal_alert = {'quality': 'Excellent Deal', 'message': 'Giá rất tốt!', 'emoji': '🌟'}
        elif classification['category'] == 'Normal' and buy_score['score'] >= 60:
            deal_alert = {'quality': 'Good Deal', 'message': 'Giá tốt', 'emoji': '✅'}
        else:
            deal_alert = {'quality': 'Fair', 'message': 'Giá bình thường', 'emoji': '⚪'}

        # Build response with all data
        response_data = {
            'prediction': {
                'base_fare': prediction_detail['base_fare'],
                'vat': prediction_detail['vat'],
                'taxes': prediction_detail['taxes'],
                'total_price': prediction_detail['total'],
                'currency': 'VND',
                'breakdown': prediction_detail['breakdown']
            },
            'classification': {
                'category': classification['category'],
                'confidence': classification['confidence'],
                'reason': classification['reason'],
                'stats': classification.get('stats')
            },
            'buy_score': {
                'score': buy_score['score'],
                'level': buy_score['level'],
                'recommendation': buy_score['recommendation'],
                'breakdown': buy_score['breakdown'],
                'factors': buy_score.get('factors', {})
            },
            'volatility': {
                'level': volatility['level'],
                'risk': volatility.get('risk', 'Unknown'),
                'advice': volatility.get('advice', ''),
                'coefficient_variation': volatility.get('coefficient_variation'),
                'price_range': volatility.get('price_range')
            },
            'optimal_booking': {
                'optimal_days': optimal_booking_result.get('optimal_days_before') or optimal_booking_result.get('optimal_days'),
                'optimal_date': optimal_booking_result.get('optimal_date'),
                'days_from_now': optimal_booking_result.get('current_days_before') or optimal_booking_result.get('days_from_now'),
                'days_to_wait': optimal_booking_result.get('days_to_wait', 0),  # NEW: How many days to wait before booking
                'optimal_price': optimal_booking_result.get('optimal_price_estimate') or optimal_booking_result.get('optimal_price'),
                'current_price': optimal_booking_result.get('current_price_estimate') or optimal_booking_result.get('current_price') or prediction_detail['total'],
                'savings_vs_now': optimal_booking_result.get('savings') or optimal_booking_result.get('savings_vs_now'),
                'savings_percent': optimal_booking_result.get('savings_percent'),
                'recommendation': optimal_booking_result.get('recommendation') or optimal_booking_result.get('message', ''),
                'status': optimal_booking_result.get('status', 'UNKNOWN'),
                'is_good_time_now': optimal_booking_result.get('is_good_time_now', optimal_booking_result.get('status') == 'OPTIMAL'),
                'confidence': optimal_booking_result.get('confidence', 'Medium'),
                'confidence_score': optimal_booking_result.get('confidence_score', 65),
                'price_trajectory': optimal_booking_result.get('price_trajectory') or optimal_booking_result.get('price_curve', [])
            },
            'price_trend': {
                'trend': price_trend['trend'],
                'direction': price_trend['direction'],
                'emoji': price_trend['emoji'],
                'price_change_percent': price_trend.get('price_change_percent', 0.0),
                'current_price': price_trend.get('current_price', prediction_detail['total']),
                'predicted_price': price_trend.get('predicted_price', prediction_detail['total']),
                'forecast_days': price_trend.get('forecast_days', 30),
                'advice': price_trend['advice'],
                'confidence': price_trend.get('confidence', 'Low'),
                'confidence_score': price_trend.get('confidence_score', 30),
                'factors': price_trend.get('factors', {})
            },
            'deal_alert': deal_alert,
            'confidence': confidence,
            'flight_info': {
                'airline': airline,
                'original_class': original_class,
                'normalized_class': normalized_class,
                'days_to_flight': days_to_flight,
                'route': f"{data['departure_airport']} → {data['arrival_airport']}",
                'flight_date': data['flight_date']
            }
        }

        # Convert everything to JSON serializable types
        response_data = convert_to_json_serializable(response_data)

        response = {
            'success': True,
            'data': response_data,
            'timestamp': datetime.now().isoformat()
        }

        # ========================================
        # 🟢 LOG OUTGOING RESPONSE DATA
        # ========================================
        print("\n" + "="*80)
        print("🟢 ML API - OUTGOING RESPONSE")
        print("="*80)
        print(f"📍 Endpoint: /api/predict")
        print(f"📅 Timestamp: {datetime.now().isoformat()}")
        print(f"✅ Status: 200 OK")
        print(f"📤 Response Structure:")
        print(f"   - success: {response['success']}")
        print(f"   - timestamp: {response['timestamp']}")
        print(f"   - data keys: {list(response['data'].keys())}")
        print(f"\n📦 Full Response Data (Formatted JSON):")
        import json
        print(json.dumps(response, indent=2, ensure_ascii=False, default=str))
        print("\n📊 Key Response Fields Summary:")
        print(f"   💰 Predicted Price: {response_data['prediction']['total_price']:,} VND")
        print(f"   🏷️  Classification: {response_data['classification']['category']}")
        print(f"   ⭐ Buy Score: {response_data['buy_score']['score']}/100")
        print(f"   📈 Price Trend: {response_data['price_trend']['trend']} ({response_data['price_trend']['direction']})")
        print(f"   ⏰ Optimal Booking Status: {response_data['optimal_booking']['status']}")
        print(f"   📅 Optimal Date: {response_data['optimal_booking']['optimal_date']}")
        print(f"   💾 Days to Wait: {response_data['optimal_booking'].get('days_to_wait', 'N/A')}")
        print("="*80 + "\n")

        return jsonify(response), 200

    except ValueError as e:
       
        print("\n" + "="*80)
        print("🔴 ML API - ERROR RESPONSE (400 Bad Request)")
        print("="*80)
        print(f"📍 Endpoint: /api/predict")
        print(f"📅 Timestamp: {datetime.now().isoformat()}")
        print(f"❌ Error Type: ValueError")
        print(f"💬 Error Message: {str(e)}")
        print("="*80 + "\n")
        return jsonify({'success': False, 'error': f'Invalid input: {str(e)}'}), 400
    except Exception as e:
      
        print("\n" + "="*80)
        print("🔴 ML API - ERROR RESPONSE (500 Server Error)")
        print("="*80)
        print(f"📍 Endpoint: /api/predict")
        print(f"📅 Timestamp: {datetime.now().isoformat()}")
        print(f"❌ Error Type: {type(e).__name__}")
        print(f"💬 Error Message: {str(e)}")
        print(f"\n📋 Full Traceback:")
        traceback.print_exc()
        print("="*80 + "\n")
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500


@app.route('/api/predict-batch', methods=['POST'])
def predict_batch():
    """
    Batch prediction for multiple flights

    Request body:
    {
        "flights": [
            {
                "flight_number": "VJ156",
                "departure_airport": "SGN",
                "arrival_airport": "HAN",
                "flight_date": "2025-12-25",
                "departure_time": "06:00",
                "arrival_time": "09:00",
                "classes": "Eco",
                "type_of_plane": "Airbus A321"
            },
            ...
        ]
    }

    Response:
    {
        "success": true,
        "data": {
            "predictions": [...],
            "total_count": 10,
            "success_count": 9,
            "failed_count": 1,
            "processing_time": 2.5
        }
    }
    """
    try:
        if engine is None:
            return jsonify({
                'success': False,
                'error': 'ML model not initialized'
            }), 503

        data = request.get_json()
        flights = data.get('flights', [])

        # Validate batch size
        if len(flights) == 0:
            return jsonify({
                'success': False,
                'error': 'No flights provided'
            }), 400

        if len(flights) > 50:
            return jsonify({
                'success': False,
                'error': 'Maximum 50 flights per batch request'
            }), 400

        # ========================================
        # 🔵 LOG INCOMING BATCH REQUEST
        # ========================================
        print("\n" + "="*80)
        print("ML API - INCOMING BATCH REQUEST")
        print("="*80)
        print(f" Endpoint: /api/predict-batch")
        print(f" Timestamp: {datetime.now().isoformat()}")
        print(f" Batch Size: {len(flights)} flights")
        print("="*80 + "\n")

        start_time = datetime.now()
        predictions = []
        success_count = 0
        failed_count = 0

        for idx, flight_data in enumerate(flights):
            try:
                # Validate required fields
                required_fields = ['departure_airport', 'arrival_airport', 'flight_date', 'classes']
                missing_fields = [field for field in required_fields if field not in flight_data or not flight_data[field]]

                if missing_fields:
                    predictions.append({
                        'flight_index': idx,
                        'success': False,
                        'error': f'Missing required fields: {", ".join(missing_fields)}'
                    })
                    failed_count += 1
                    continue

                # Extract and normalize class name
                airline = engine._extract_airline(flight_data.get('flight_number', ''))
                original_class = flight_data['classes']
                normalized_class = normalize_class_name(airline, original_class)

                # Calculate days_to_flight
                flight_date_obj = datetime.strptime(flight_data['flight_date'], '%Y-%m-%d').date()
                current_date = datetime.now().date()
                days_to_flight = (flight_date_obj - current_date).days

                # Prepare flight info
                flight_info = {
                    'flight_number': flight_data.get('flight_number', ''),
                    'departure_airport': flight_data['departure_airport'],
                    'arrival_airport': flight_data['arrival_airport'],
                    'flight_date': flight_data['flight_date'],
                    'departure_time': flight_data.get('departure_time', '00:00'),
                    'arrival_time': flight_data.get('arrival_time', '00:00'),
                    'classes': normalized_class,
                    'days_to_flight': days_to_flight,
                    'type_of_plane': flight_data.get('type_of_plane', '')
                }

                # Get prediction
                prediction_detail = predict_with_taxes(flight_info)
                route = f"{flight_info['departure_airport']}_{flight_info['arrival_airport']}"

                # Get analysis (same as single predict)
                classification = engine.classify_price(
                    prediction_detail['total'], route, airline, normalized_class
                )
                buy_score = engine.calculate_buy_score(flight_info, prediction_detail['total'])
                volatility = engine.assess_volatility(route, airline, normalized_class)

                # Use optimal booking analyzer
                if optimal_booking is not None:
                    optimal_booking_result = optimal_booking.calculate_optimal_booking_time(
                        route=f"{flight_info['departure_airport']}-{flight_info['arrival_airport']}",
                        class_name=normalized_class,
                        flight_date=flight_info['flight_date'],
                        current_days_before=days_to_flight,
                        current_price=prediction_detail['total']
                    )
                else:
                    optimal_booking_result = engine.find_optimal_booking_time(flight_info)

                # Add price trend
                if trend_predictor is not None:
                    price_trend = trend_predictor.predict_trend(
                        route=f"{flight_info['departure_airport']}-{flight_info['arrival_airport']}",
                        class_name=normalized_class,
                        current_price=prediction_detail['total'],
                        days_to_flight=days_to_flight,
                        forecast_days=30
                    )
                else:
                    price_trend = {
                        'trend': 'Không rõ',
                        'direction': 'UNKNOWN',
                        'emoji': '❓',
                        'price_change_percent': 0.0,
                        'advice': 'Không có đủ dữ liệu.',
                        'confidence': 'Low',
                        'confidence_score': 30
                    }

                # Deal alert
                if classification['category'] == 'Cheap':
                    deal_alert = {'quality': 'Excellent Deal', 'message': 'Giá rất tốt!', 'emoji': '🌟'}
                elif classification['category'] == 'Normal' and buy_score['score'] >= 60:
                    deal_alert = {'quality': 'Good Deal', 'message': 'Giá tốt', 'emoji': '✅'}
                else:
                    deal_alert = {'quality': 'Fair', 'message': 'Giá bình thường', 'emoji': '⚪'}

                # Build response (condensed version for batch)
                result = {
                    'flight_index': idx,
                    'success': True,
                    'prediction': {
                        'total_price': prediction_detail['total'],
                        'base_fare': prediction_detail['base_fare'],
                        'vat': prediction_detail['vat'],
                        'taxes': prediction_detail['taxes']
                    },
                    'classification': {
                        'category': classification['category'],
                        'confidence': classification['confidence']
                    },
                    'buy_score': {
                        'score': buy_score['score'],
                        'level': buy_score['level'],
                        'recommendation': buy_score['recommendation'],
                        'version': buy_score.get('version', 'standard')
                    },
                    'optimal_booking': {
                        'status': optimal_booking_result.get('status', 'UNKNOWN'),
                        'days_to_wait': optimal_booking_result.get('days_to_wait', 0),
                        'savings_percent': optimal_booking_result.get('savings_percent')
                    },
                    'price_trend': {
                        'direction': price_trend['direction'],
                        'price_change_percent': price_trend.get('price_change_percent', 0.0)
                    },
                    'deal_alert': deal_alert,
                    'flight_info': {
                        'route': f"{flight_data['departure_airport']} → {flight_data['arrival_airport']}",
                        'airline': airline,
                        'class': normalized_class,
                        'days_to_flight': days_to_flight
                    }
                }

                # Convert to JSON serializable
                result = convert_to_json_serializable(result)
                predictions.append(result)
                success_count += 1

            except Exception as e:
                predictions.append({
                    'flight_index': idx,
                    'success': False,
                    'error': f'Prediction failed: {str(e)}'
                })
                failed_count += 1
                print(f"❌ Error processing flight {idx}: {e}")

        end_time = datetime.now()
        processing_time = (end_time - start_time).total_seconds()

        response_data = {
            'predictions': predictions,
            'total_count': len(flights),
            'success_count': success_count,
            'failed_count': failed_count,
            'processing_time': round(processing_time, 2),
            'avg_time_per_flight': round(processing_time / len(flights), 3) if len(flights) > 0 else 0
        }

        # ========================================
        # 🟢 LOG OUTGOING BATCH RESPONSE
        # ========================================
        print("\n" + "="*80)
        print("ML API - OUTGOING BATCH RESPONSE")
        print("="*80)
        print(f"📍 Endpoint: /api/predict-batch")
        print(f"📅 Timestamp: {datetime.now().isoformat()}")
        print(f"✅ Status: 200 OK")
        print(f"📊 Results:")
        print(f"   - Total: {response_data['total_count']}")
        print(f"   - Success: {response_data['success_count']}")
        print(f"   - Failed: {response_data['failed_count']}")
        print(f"   - Processing Time: {response_data['processing_time']}s")
        print(f"   - Avg per flight: {response_data['avg_time_per_flight']}s")
        print("="*80 + "\n")

        return jsonify({
            'success': True,
            'data': response_data,
            'timestamp': datetime.now().isoformat()
        }), 200

    except Exception as e:
        print("\n" + "="*80)
        print("🔴 ML API - BATCH ERROR")
        print("="*80)
        print(f"❌ Error: {str(e)}")
        traceback.print_exc()
        print("="*80 + "\n")
        return jsonify({'success': False, 'error': f'Batch processing error: {str(e)}'}), 500


@app.route('/api/normalize-class', methods=['POST'])
def normalize_class():
    """Normalize class name based on airline"""
    try:
        data = request.get_json()
        airline = data.get('airline', '')
        class_name = data.get('class_name', '')
        normalized = normalize_class_name(airline, class_name)
        return jsonify({
            'success': True,
            'data': {'original': class_name, 'normalized': normalized, 'airline': airline}
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    print("\n" + "="*60)
    print("🚀 ML API (Light Mode)")
    print("="*60 + "\n")
    print("✅ Server: http://127.0.0.1:5000")
    print("📝 Press CTRL+C to stop\n")

    app.run(host='127.0.0.1', port=5000, debug=False, threaded=True, use_reloader=False)
