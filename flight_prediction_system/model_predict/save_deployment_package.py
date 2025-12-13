"""
Save Deployment Package
Saves all necessary components for quick loading in production:
- Trained model
- Preprocessed data (only latest snapshots)
- Route statistics
- Lookup structures
"""

import pandas as pd
import numpy as np
import pickle
from datetime import datetime
import os


def save_deployment_package(df_features, ensemble, output_dir='.'):
    """
    Save a lightweight deployment package for fast loading.
    
    Args:
        df_features: Full preprocessed dataframe with features
        ensemble: Trained EnsembleModel
        output_dir: Directory to save package
    """
    print("\n" + "=" * 70)
    print("CREATING DEPLOYMENT PACKAGE")
    print("=" * 70)
    
    os.makedirs(output_dir, exist_ok=True)
    model_path = os.path.join(output_dir, 'flight_ensemble_model.pkl')
    if not os.path.exists(model_path):
        ensemble.save(model_path)
        print(f"\nSaved ensemble model: {model_path}")
    else:
        print(f"\nModel already exists: {model_path}")
    
    print("\nCreating lightweight lookup data...")    
    latest_data = df_features.sort_values('create_at').groupby('flight_instance').last().reset_index()
    
    print(f"   Original data: {len(df_features):,} rows")
    print(f"   Latest snapshots: {len(latest_data):,} rows")
    print(f"   Size reduction: {100*(1 - len(latest_data)/len(df_features)):.1f}%")
    
    # Save to parquet (more efficient than CSV)
    latest_data_path = os.path.join(output_dir, 'flight_latest_data.parquet')
    latest_data.to_parquet(latest_data_path, index=False, compression='gzip')
    print(f"   Saved: {latest_data_path}")
    print("\nCreating route statistics...")
    
    route_stats = df_features.groupby('route')['price'].agg([
        ('q1', lambda x: x.quantile(0.25)),
        ('q3', lambda x: x.quantile(0.75)),
        ('mean', 'mean'),
        ('median', 'median'),
        ('std', 'std'),
        ('min', 'min'),
        ('max', 'max'),
        ('count', 'count')
    ]).reset_index()
    
    route_stats_path = os.path.join(output_dir, 'route_statistics.parquet')
    route_stats.to_parquet(route_stats_path, index=False)
    print(f"   Saved: {route_stats_path}")
    print(f"   Routes covered: {len(route_stats):,}")
    
    # ========================================
    # 4. Save full historical data for price history queries
    # (Keep only essential columns)
    # ========================================
    print("\nCreating historical price data...")
    
    essential_cols = [
        'flight_instance', 'flight_number', 'route', 
        'departure_airport', 'arrival_airport', 'flight_date',
        'classes', 'create_at', 'price', 'days_to_departure'
    ]
    
    existing_cols = [col for col in essential_cols if col in df_features.columns]
    history_data = df_features[existing_cols].copy()
    
    history_path = os.path.join(output_dir, 'flight_price_history.parquet')
    history_data.to_parquet(history_path, index=False, compression='gzip')
    print(f"   Saved: {history_path}")
    print(f"   Size: {os.path.getsize(history_path) / (1024*1024):.1f} MB")
    
    print("\n📋 Creating metadata...")
    
    metadata = {
        'created_at': datetime.now().isoformat(),
        'total_flights': df_features['flight_instance'].nunique(),
        'total_routes': df_features['route'].nunique(),
        'airports': sorted(df_features['departure_airport'].unique().tolist()),
        'date_range': {
            'earliest_snapshot': df_features['create_at'].min().isoformat(),
            'latest_snapshot': df_features['create_at'].max().isoformat(),
            'earliest_flight': df_features['flight_date'].min().isoformat(),
            'latest_flight': df_features['flight_date'].max().isoformat()
        },
        'price_range': {
            'min': float(df_features['price'].min()),
            'max': float(df_features['price'].max()),
            'mean': float(df_features['price'].mean())
        },
        'files': {
            'model': 'flight_ensemble_model.pkl',
            'latest_data': 'flight_latest_data.parquet',
            'route_stats': 'route_statistics.parquet',
            'history': 'flight_price_history.parquet'
        }
    }
    
    metadata_path = os.path.join(output_dir, 'deployment_metadata.json')
    import json
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"   Saved: {metadata_path}")
    
    # ========================================
    # SUMMARY
    # ========================================
    print("\n" + "=" * 70)
    print("DEPLOYMENT PACKAGE CREATED")
    print("=" * 70)
    print(f"\nPackage contents:")
    print(f"   1. flight_ensemble_model.pkl - Trained models")
    print(f"   2. flight_latest_data.parquet - Latest flight snapshots")
    print(f"   3. route_statistics.parquet - Route price statistics")
    print(f"   4. flight_price_history.parquet - Historical price data")
    print(f"   5. deployment_metadata.json - Package metadata")
    
    total_size = sum([
        os.path.getsize(os.path.join(output_dir, f)) 
        for f in [
            'flight_ensemble_model.pkl',
            'flight_latest_data.parquet',
            'route_statistics.parquet',
            'flight_price_history.parquet',
            'deployment_metadata.json'
        ]
    ]) / (1024 * 1024)
    
    print(f"\nTotal package size: {total_size:.1f} MB")
    print(f"\nReady for production deployment!")
    print("=" * 70 + "\n")
    
    return {
        'model_path': model_path,
        'latest_data_path': latest_data_path,
        'route_stats_path': route_stats_path,
        'history_path': history_path,
        'metadata_path': metadata_path
    }


if __name__ == "__main__":
    print("from save_deployment_package import save_deployment_package")
    print("paths = save_deployment_package(df_features, ensemble)")