import pandas as pd
import numpy as np
from datetime import datetime
from typing import Optional
import os
import warnings
warnings.filterwarnings('ignore')

from flight_preprocessing import preprocess_pipeline, validate_data_quality
from flight_features import engineer_features, get_feature_columns
from flight_models import EnsembleModel, TimeBasedSplitter
from flight_business_logic import PriceAnalyzer
from flight_recommender import FlightRecommender, create_recommendation_summary


def main_pipeline(csv_filepath: str, 
                 test_mode: bool = False,
                 sample_size: Optional[int] = None,
                 output_dir: str = '.'):
    """
    Execute complete flight recommendation pipeline.
    
    Args:
        csv_filepath: Path to input CSV file
        test_mode: If True, use smaller subset for testing
        sample_size: Optional sample size for testing
        output_dir: Directory to save outputs (default: current directory)
    """
    
    os.makedirs(output_dir, exist_ok=True)
    
    print("\n" + "=" * 70)
    print("FLIGHT RECOMMENDATION & PRICE PREDICTION SYSTEM")
    print("=" * 70)
    print("\nStarting pipeline...\n")
    print(f"Output directory: {output_dir}")
    
    # ========================================
    # STAGE 1: DATA LOADING
    # ========================================
    print("\nSTAGE 1: Loading data...")
    try:
        df_raw = pd.read_csv(csv_filepath)
        print(f"Loaded {len(df_raw):,} rows from {csv_filepath}")
    except Exception as e:
        print(f"Error loading data: {e}")
        return None
    
    # Sample for testing
    if test_mode or sample_size:
        sample_size = sample_size or 10000
        df_raw = df_raw.sample(n=min(sample_size, len(df_raw)), random_state=42)
        print(f"Test mode: Using {len(df_raw):,} samples")
    
    # ========================================
    # STAGE 2: PREPROCESSING
    # ========================================
    print("\nSTAGE 2: Preprocessing data...")
    df_clean = preprocess_pipeline(df_raw)
    
    # Validate quality
    quality = validate_data_quality(df_clean)
    print(f"\nData Quality Report:")
    print(f"   Date Range: {quality['date_range']['earliest_snapshot']} to {quality['date_range']['latest_snapshot']}")
    print(f"   Unique Flights: {quality['unique_counts']['flights']:,}")
    print(f"   Unique Routes: {quality['unique_counts']['routes']:,}")
    
    # ========================================
    # STAGE 3: FEATURE ENGINEERING
    # ========================================
    print("\nSTAGE 3: Engineering features...")
    df_features = engineer_features(df_clean, for_training=True)
    
    # Remove rows with NaN in critical features (from lag/rolling windows)
    critical_cols = ['price', 'days_to_departure', 'trend_label']
    df_features = df_features.dropna(subset=critical_cols)
    print(f"Feature engineering complete: {len(df_features.columns)} total columns")
    print(f"Dataset size after feature engineering: {len(df_features):,} rows")
    
    # ========================================
    # STAGE 4: TRAIN/VAL SPLIT (TIME-BASED)
    # ========================================
    print("\nSTAGE 4: Creating time-based train/validation split...")
    
    # Sort by time
    df_features = df_features.sort_values('create_at').reset_index(drop=True)
    
    # Use 80/20 split based on time
    split_idx = int(len(df_features) * 0.8)
    df_train = df_features.iloc[:split_idx].copy()
    df_val = df_features.iloc[split_idx:].copy()
    
    print(f"✅ Train set: {len(df_train):,} rows")
    print(f"✅ Validation set: {len(df_val):,} rows")
    print(f"   Train date range: {df_train['create_at'].min()} to {df_train['create_at'].max()}")
    print(f"   Val date range: {df_val['create_at'].min()} to {df_val['create_at'].max()}")
    
    # ========================================
    # STAGE 5: MODEL TRAINING
    # ========================================
    print("\nSTAGE 5: Training ensemble models...")
    ensemble = EnsembleModel()
    metrics = ensemble.train(df_train, df_val)
    
    # ========================================
    # STAGE 6: SAVE MODEL
    # ========================================
    model_path = os.path.join(output_dir, 'flight_ensemble_model.pkl')
    ensemble.save(model_path)
    
    # ========================================
    # STAGE 7: CREATE RECOMMENDER SYSTEM
    # ========================================
    print("\nSTAGE 7: Initializing recommendation system...")
    analyzer = PriceAnalyzer(df_features)
    recommender = FlightRecommender(df_features, ensemble, analyzer)
    print("Recommender system ready!")
    
    # ========================================
    # FINAL SUMMARY
    # ========================================
    print("\n" + "=" * 70)
    print("PIPELINE COMPLETE")
    print("=" * 70)
    print("\nAll stages completed successfully!")
    print("\nDeliverables:")
    print(f"   1. Trained ensemble model: {model_path}")
    print(f"   2. Recommender system: Ready for queries")
    print(f"   3. Sample recommendations: JSON files in {output_dir}")
    
    print("\nNext Steps:")
    print("   - Use FlightRecommender.get_recommendations() for custom queries")
    print("   - Query by route, date, and budget")
    print("   - Export results to JSON for integration")
    
    return {
        'df_features': df_features,
        'ensemble': ensemble,
        'recommender': recommender,
        'metrics': metrics
    }


def example_usage():
    """
    Example of how to use the recommender system after training.
    """
    print("\n" + "=" * 70)
    print("EXAMPLE USAGE")
    print("=" * 70)
    
    example_code = '''
# After training, use the recommender like this:

from datetime import datetime

# Example 1: Get recommendations for a specific route
recommendations = recommender.get_recommendations(
    departure_airport='LAX',
    arrival_airport='JFK',
    flight_date=datetime(2025, 8, 15),
    budget=500  # Optional budget constraint
)

# Example 2: Get price history for a specific flight
history = recommender.get_price_history(
    flight_number='AA123',
    flight_date=datetime(2025, 8, 15),
    class_type='Economy'
)

# Example 3: Export recommendations
recommender.export_recommendations_json(
    recommendations, 
    'my_recommendations.json'
)

# Example 4: Print human-readable summary
from flight_recommender import create_recommendation_summary
summary = create_recommendation_summary(recommendations)
print(summary)
'''
    
    print(example_code)


if __name__ == "__main__":
    import sys
    if os.path.exists('/content'):
        output_dir = '/content'
    else:
        output_dir = '.'
    
    if len(sys.argv) > 1:
        csv_path = sys.argv[1]
        test_mode = '--test' in sys.argv
        
        if '--output' in sys.argv:
            output_idx = sys.argv.index('--output')
            if output_idx + 1 < len(sys.argv):
                output_dir = sys.argv[output_idx + 1]
        
        # Run pipeline
        results = main_pipeline(csv_path, test_mode=test_mode, output_dir=output_dir)
        
        if results:
            print("\nPipeline executed successfully!")
            print("\nModel Performance Summary:")
            print(f"   Price RMSE: ${results['metrics']['price_regressor']['val_rmse']:.2f}")
            print(f"   Price R²: {results['metrics']['price_regressor']['val_r2']:.4f}")
            print(f"   Trend Accuracy: {results['metrics']['trend_classifier']['val_accuracy']:.4f}")
            
    else:
        print("\n" + "=" * 70)
        print("Flight Recommendation System - Main Pipeline")
        print("=" * 70)
        print("\nUsage:")
        print("   python flight_main.py <path_to_csv> [--test] [--output <dir>]")
        print("\nOptions:")
        print("   --test              Use smaller sample for testing")
        print("   --output <dir>      Specify output directory (default: current dir)")
        print("\nExamples:")
        print("   python flight_main.py flight_data.csv")
        print("   python flight_main.py flight_data.csv --test")
        print("   python flight_main.py flight_data.csv --output /content")
        print("\n")
        
        example_usage()