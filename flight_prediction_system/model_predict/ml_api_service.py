# -*- coding: utf-8 -*-
"""
ML Prediction API Service
Flask API endpoint for flight price predictions and analysis
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
import sys
import io
import os
import traceback

# Fix encoding for Windows console
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from improved_comprehensive_analysis import ImprovedFlightAnalyzer
from class_mapper import normalize_class_name

app = Flask(__name__)
CORS(app)

# Initialize the analyzer once at startup
print("Initializing Flight Intelligence Engine...")
try:
    analyzer = ImprovedFlightAnalyzer('deployment_package')
    print("✅ Flight Intelligence Engine initialized successfully!")
except Exception as e:
    print(f"❌ Failed to initialize Flight Intelligence Engine: {e}")
    analyzer = None


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'ML Flight Prediction API',
        'model_loaded': analyzer is not None,
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/predict', methods=['POST'])
def predict_flight_price():
    """
    Predict flight price with comprehensive analysis

    Expected request body:
    {
        "flight_number": "VJ182",
        "departure_airport": "SGN",
        "arrival_airport": "HAN",
        "flight_date": "2025-12-31",
        "departure_time": "23:20",
        "arrival_time": "01:30",
        "classes": "Eco",
        "type_of_plane": "Airbus A321" (optional)
    }
    """
    try:
        if analyzer is None:
            return jsonify({
                'success': False,
                'error': 'ML model not initialized'
            }), 503

        # Get request data
        data = request.get_json()

        # Validate required fields
        required_fields = ['departure_airport', 'arrival_airport', 'flight_date', 'classes']
        missing_fields = [field for field in required_fields if field not in data or not data[field]]

        if missing_fields:
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {", ".join(missing_fields)}'
            }), 400

        # Extract and normalize class name
        airline = analyzer.engine._extract_airline(data.get('flight_number', ''))
        original_class = data['classes']
        normalized_class = normalize_class_name(airline, original_class)

        # Calculate days_to_flight
        flight_date_obj = datetime.strptime(data['flight_date'], '%Y-%m-%d').date()
        current_date = datetime.now().date()
        days_to_flight = (flight_date_obj - current_date).days

        # Prepare flight info for prediction
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

        # Get prediction with taxes breakdown
        prediction_detail = analyzer.predict_with_taxes(flight_info)

        # Get route for analysis
        route = f"{flight_info['departure_airport']}_{flight_info['arrival_airport']}"

        # Get price classification
        classification = analyzer.engine.classify_price(
            prediction_detail['total'],
            route,
            airline,
            normalized_class
        )

        # Get buy score
        buy_score = analyzer.engine.calculate_buy_score(
            flight_info,
            prediction_detail['total']
        )

        # Get volatility assessment
        volatility = analyzer.engine.assess_volatility(
            route,
            airline,
            normalized_class
        )

        # Get optimal booking time
        optimal_booking = analyzer.engine.find_optimal_booking_time(flight_info)

        # Get deal alert
        deal_alert = analyzer.analyzer.check_deal_alert(
            flight_info,
            prediction_detail['total'],
            None
        )

        # Get confidence assessment
        confidence = analyzer.analyzer.assess_price_confidence(
            flight_info,
            prediction_detail['total']
        )

        # Prepare response
        response = {
            'success': True,
            'data': {
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
                    'optimal_days': optimal_booking.get('optimal_days'),
                    'optimal_date': optimal_booking.get('optimal_date'),
                    'days_from_now': optimal_booking.get('days_from_now'),
                    'optimal_price': optimal_booking.get('optimal_price'),
                    'current_price': optimal_booking.get('current_price'),
                    'savings_vs_now': optimal_booking.get('savings_vs_now'),
                    'savings_percent': optimal_booking.get('savings_percent'),
                    'recommendation': optimal_booking.get('recommendation', optimal_booking.get('message', '')),
                    'is_good_time_now': optimal_booking.get('is_good_time_now', False),
                    'price_trajectory': optimal_booking.get('price_trajectory', [])
                },
                'deal_alert': {
                    'quality': deal_alert['deal_quality'],
                    'message': deal_alert['message'],
                    'emoji': deal_alert['emoji']
                },
                'confidence': {
                    'level': confidence['confidence'],
                    'score': confidence['score'],
                    'message': confidence['message']
                },
                'flight_info': {
                    'airline': airline,
                    'original_class': original_class,
                    'normalized_class': normalized_class,
                    'days_to_flight': days_to_flight,
                    'route': f"{data['departure_airport']} → {data['arrival_airport']}",
                    'flight_date': data['flight_date']
                }
            },
            'timestamp': datetime.now().isoformat()
        }

        return jsonify(response), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Invalid input data: {str(e)}'
        }), 400

    except Exception as e:
        print(f"❌ Prediction error: {e}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Internal server error: {str(e)}'
        }), 500


@app.route('/api/batch-predict', methods=['POST'])
def batch_predict():
    """
    Batch prediction for multiple flights

    Expected request body:
    {
        "flights": [
            {
                "flight_number": "VJ182",
                "departure_airport": "SGN",
                ...
            },
            ...
        ]
    }
    """
    try:
        if analyzer is None:
            return jsonify({
                'success': False,
                'error': 'ML model not initialized'
            }), 503

        data = request.get_json()
        flights = data.get('flights', [])

        if not flights or not isinstance(flights, list):
            return jsonify({
                'success': False,
                'error': 'Invalid request: "flights" array required'
            }), 400

        results = []

        for idx, flight_data in enumerate(flights):
            try:
                # Extract and normalize class name
                airline = analyzer.engine._extract_airline(flight_data.get('flight_number', ''))
                original_class = flight_data.get('classes', 'Eco')
                normalized_class = normalize_class_name(airline, original_class)

                # Calculate days_to_flight
                flight_date_obj = datetime.strptime(flight_data['flight_date'], '%Y-%m-%d').date()
                current_date = datetime.now().date()
                days_to_flight = (flight_date_obj - current_date).days

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

                prediction_detail = analyzer.predict_with_taxes(flight_info)

                results.append({
                    'index': idx,
                    'success': True,
                    'prediction': prediction_detail,
                    'flight_info': {
                        'route': f"{flight_data['departure_airport']} → {flight_data['arrival_airport']}",
                        'flight_date': flight_data['flight_date'],
                        'normalized_class': normalized_class
                    }
                })

            except Exception as e:
                results.append({
                    'index': idx,
                    'success': False,
                    'error': str(e)
                })

        return jsonify({
            'success': True,
            'data': {
                'results': results,
                'total': len(flights),
                'successful': sum(1 for r in results if r['success'])
            },
            'timestamp': datetime.now().isoformat()
        }), 200

    except Exception as e:
        print(f"❌ Batch prediction error: {e}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Internal server error: {str(e)}'
        }), 500


@app.route('/api/normalize-class', methods=['POST'])
def normalize_class():
    """
    Normalize class name based on airline

    Expected request body:
    {
        "airline": "VJ",
        "class_name": "economy"
    }
    """
    try:
        data = request.get_json()
        airline = data.get('airline', '')
        class_name = data.get('class_name', '')

        normalized = normalize_class_name(airline, class_name)

        return jsonify({
            'success': True,
            'data': {
                'original': class_name,
                'normalized': normalized,
                'airline': airline
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    print("\n" + "="*60)
    print("🚀 STARTING ML FLIGHT PREDICTION API SERVICE")
    print("="*60 + "\n")

    print("✅ Server starting on http://localhost:5000")
    print("📝 Press CTRL+C to stop the server")
    print("\n" + "="*60 + "\n")

    # Run on port 5000
    # Use threaded=True for better performance on Windows
    app.run(
        host='127.0.0.1',
        port=5000,
        debug=False,  # Disable debug mode to prevent auto-reload issues on Windows
        threaded=True,
        use_reloader=False  # Disable reloader on Windows
    )
