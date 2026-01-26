# -*- coding: utf-8 -*-
import pandas as pd
import numpy as np
from tqdm import tqdm
tqdm.pandas()
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')
import sys
import io

# Fix encoding for Windows console
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import xgboost as xgb
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib
import json2
from pathlib import Path
from typing import Dict, List, Tuple, Any


class FlightDataProcessor:
    """
    Advanced feature engineering for flight price prediction.
    
    CRITICAL FIX: Implements proper fit/transform pattern to prevent data leakage.
    - fit(): Calculate statistics ONLY on training data
    - transform(): Apply pre-calculated statistics to new data
    """
    
    def __init__(self):
        self.label_encoders = {}
        self.route_stats = None
        self.feature_columns = None
        self.global_fallback_stats = None  # For unseen routes in validation/test
        # Map flight_number -> type_of_plane (for inference fallback)
        self.plane_map = None
        self._is_fitted = False
        
    def extract_airline(self, flight_number: str) -> str:
        """Extract airline code from flight number (VJ1198 -> VJ)"""
        if pd.isna(flight_number):
            return 'UNKNOWN'
        return ''.join([c for c in str(flight_number) if c.isalpha()])
    
    def get_time_bucket(self, time_str: str) -> str:
        """Convert time to time bucket (Morning/Afternoon/Evening/Night)"""
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
    
    def _calculate_route_statistics(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate historical statistics for each (route, airline, class) combination.        
        """
        print("Calculating route statistics (Q1, Median, Q3, Mean, Std)...")
        
        # Create route identifier
        df['route'] = df['departure_airport'] + '_' + df['arrival_airport']        
        stats = df.groupby(['route', 'airline', 'classes'])['price'].agg([
            ('q1', lambda x: x.quantile(0.25)),
            ('median', 'median'),
            ('q3', lambda x: x.quantile(0.75)),
            ('mean', 'mean'),
            ('std', 'std'),
            ('min', 'min'),
            ('max', 'max'),
            ('count', 'count')
        ]).reset_index()        
        stats['std'] = stats['std'].fillna(0)
        print(f"Calculated stats for {len(stats)} unique route-airline-class combinations")
        return stats
    
    def _add_temporal_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract temporal features from flight_date"""
        # Convert to datetime - handle mixed formats
        df['flight_date'] = pd.to_datetime(df['flight_date'], format='mixed', errors='coerce')
        
        # Extract features
        df['day_of_week'] = df['flight_date'].dt.dayofweek  # 0=Monday, 6=Sunday
        df['month'] = df['flight_date'].dt.month
        df['day_of_month'] = df['flight_date'].dt.day
        df['is_weekend'] = (df['flight_date'].dt.dayofweek >= 5).astype(int)
        df['is_month_start'] = (df['flight_date'].dt.day <= 7).astype(int)
        df['is_month_end'] = (df['flight_date'].dt.day >= 24).astype(int)
        df['quarter'] = df['flight_date'].dt.quarter
        
        return df

    def _add_route_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Add route-based features
        """
        df['route'] = df['departure_airport'] + '_' + df['arrival_airport']        
        existing_routes = set(df['route'].unique())        
        num_chunks = 50 
        chunks = np.array_split(df, num_chunks)
        processed_chunks = []
        
        for chunk in tqdm(chunks, desc="   Processing Route Batches", unit="chunk", leave=False):
            chunk = chunk.copy()
            reverse_routes = chunk['arrival_airport'] + '_' + chunk['departure_airport']
            chunk['is_round_trip_route'] = reverse_routes.isin(existing_routes).astype(int)
            processed_chunks.append(chunk)
        
        df_final = pd.concat(processed_chunks)
        return df_final
    
    def _add_booking_window_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Create features based on days_to_flight (booking window)"""
        # Categorize booking windows
        df['booking_category'] = pd.cut(
            df['days_to_flight'],
            bins=[-1, 3, 7, 14, 30, 60, 90, float('inf')],
            labels=['last_minute', 'week', 'two_weeks', 'month', 'two_months', 'three_months', 'early_bird']
        )        
        df['is_high_volatility_window'] = ((df['days_to_flight'] <= 14) | (df['days_to_flight'] >= 90)).astype(int)
        df['is_optimal_booking_window'] = ((df['days_to_flight'] >= 30) & (df['days_to_flight'] <= 60)).astype(int)
        
        return df
    
    def _create_base_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Create all non-leaking features (no statistics involved).
        This is used by both fit() and transform().
        """
        df = df.copy()        
        df['airline'] = df['flight_number'].apply(self.extract_airline)        
        df['departure_time_bucket'] = df['departure_time'].apply(self.get_time_bucket)
        df['arrival_time_bucket'] = df['arrival_time'].apply(self.get_time_bucket)        
        df = self._add_temporal_features(df)        
        df = self._add_route_features(df)        
        df = self._add_booking_window_features(df)
        return df
    
    def fit(self, df_train: pd.DataFrame) -> 'FlightDataProcessor':
        """
        Fit the processor on TRAINING DATA ONLY.
        
        This calculates:
        - Route statistics (mean, median, std, etc.) from training prices
        - Label encoder mappings
        
        Args:
            df_train: Training dataframe WITH the 'price' column
        
        Returns:
            self (for method chaining)
        """
        print("\n" + "="*60)
        print("FITTING FEATURE PROCESSOR (TRAINING DATA ONLY)")
        print("="*60 + "\n")
        
        if 'price' not in df_train.columns:
            raise ValueError("Training data must contain 'price' column for fitting")
        
        print("Creating base features on training data...")
        df_train = self._create_base_features(df_train)
        
        print("Calculating route statistics (TRAINING DATA ONLY)...")
        self.route_stats = self._calculate_route_statistics(df_train)
        
        self.global_fallback_stats = {
            'q1': df_train['price'].quantile(0.25),
            'median': df_train['price'].median(),
            'q3': df_train['price'].quantile(0.75),
            'mean': df_train['price'].mean(),
            'std': df_train['price'].std()
        }
        print(f"✓ Global fallback stats: mean={self.global_fallback_stats['mean']:,.0f} VND, "
              f"std={self.global_fallback_stats['std']:,.0f} VND")
        
        # Build plane_map from TRAINING data (flight_number -> type_of_plane)
        if 'flight_number' in df_train.columns and 'type_of_plane' in df_train.columns:
            print("Building plane map (flight_number -> type_of_plane) from training data...")
            plane_ref = df_train.dropna(subset=['type_of_plane'])
            # Use last occurrence in case of duplicates (usually consistent)
            self.plane_map = (
                plane_ref
                .drop_duplicates(subset=['flight_number'], keep='last')
                .set_index('flight_number')['type_of_plane']
                .to_dict()
            )
            print(f"✓ Plane map built with {len(self.plane_map)} flight_number entries")
        else:
            print("⚠️ Warning: 'flight_number' or 'type_of_plane' missing in training data - plane_map not built")
            self.plane_map = {}
        
        print("Fitting label encoders on training data...")
        categorical_features = [
            'airline', 'departure_airport', 'arrival_airport', 
            'classes', 'departure_time_bucket', 'booking_category', 'type_of_plane'
        ]
        
        for col in tqdm(categorical_features, desc="   Encoding variables"):
            if col in df_train.columns:
                self.label_encoders[col] = LabelEncoder()
                df_train[col] = df_train[col].astype('object')
                df_train[col] = df_train[col].fillna('UNKNOWN')
                self.label_encoders[col].fit(df_train[col].astype(str))
        
        self.feature_columns = [
            'airline_encoded', 'departure_airport_encoded', 'arrival_airport_encoded',
            'classes_encoded', 'departure_time_bucket_encoded', 'booking_category_encoded',
            'type_of_plane_encoded',
            'day_of_week', 'month', 'day_of_month', 'is_weekend', 
            'is_month_start', 'is_month_end', 'quarter',
            'days_to_flight', 'is_high_volatility_window', 'is_optimal_booking_window',
            # Historical stats (from TRAINING data only)
            'q1', 'median', 'q3', 'mean', 'std',
            'is_round_trip_route'
        ]
        
        self._is_fitted = True
        
        print("\n" + "="*60)
        print(f"PROCESSOR FITTED SUCCESSFULLY")
        print(f"   Total Features: {len(self.feature_columns)}")
        print(f"   Route Stats Combinations: {len(self.route_stats)}")
        print("="*60 + "\n")
        
        return self
    
    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Transform data using fitted statistics.
        
        This applies:
        - Pre-calculated route statistics from training data
        - Pre-fitted label encoders
        - Handles unseen categories gracefully
        
        Args:
            df: Dataframe to transform (can be train, val, or test)
        
        Returns:
            Transformed dataframe with feature columns
        """
        if not self._is_fitted:
            raise RuntimeError("Processor must be fitted before transform. Call fit() first.")
        print(f"Transforming {len(df):,} samples...")
        df = df.copy()        
        df = self._create_base_features(df)
        print("   Merging pre-calculated route statistics...")
        df = df.merge(
            self.route_stats,
            on=['route', 'airline', 'classes'],
            how='left',
            suffixes=('', '_hist')
        )
        
        unseen_mask = df['mean'].isna()
        if unseen_mask.sum() > 0:
            print(f"   {unseen_mask.sum()} samples with unseen routes - using global fallback stats")
            for stat_name, stat_value in self.global_fallback_stats.items():
                df.loc[unseen_mask, stat_name] = stat_value
        
        for col, encoder in self.label_encoders.items():
            if col in df.columns:
                df[col] = df[col].astype('object')
                df[col] = df[col].fillna('UNKNOWN')                
                def safe_encode(x):
                    if x in encoder.classes_:
                        return encoder.transform([x])[0]
                    else:
                        return -1
                
                df[f'{col}_encoded'] = df[col].astype(str).apply(safe_encode)
        
        for col in self.feature_columns:
            if col in df.columns:
                df[col] = df[col].fillna(0)
            else:
                df[col] = 0
        
        print(f"Transformation complete")
        
        return df[self.feature_columns]
    
    def fit_transform(self, df_train: pd.DataFrame) -> pd.DataFrame:
        """
        Fit on training data and transform it in one step.
        
        Args:
            df_train: Training dataframe WITH 'price' column
        
        Returns:
            Transformed training dataframe
        """
        self.fit(df_train)
        return self.transform(df_train)


class FlightPriceModel:
    """
    XGBoost-based flight price prediction model with robust training pipeline.
    """
    
    def __init__(self):
        self.model = None
        self.feature_columns = None
        
    def train(self, X_train: pd.DataFrame, y_train: pd.Series, 
              X_val: pd.DataFrame, y_val: pd.Series) -> Dict[str, float]:
        """
        Train XGBoost model with optimized hyperparameters.
        """
        print("\n" + "="*60)
        print("TRAINING XGBOOST MODEL")
        print("="*60 + "\n")
                     
        params = {
            'objective': 'reg:squarederror',
            'max_depth': 8,  
            'learning_rate': 0.05,
            'n_estimators': 500,
            'min_child_weight': 3,
            'subsample': 0.8,
            'colsample_bytree': 0.8,
            'gamma': 0.1,
            'reg_alpha': 0.1,
            'reg_lambda': 1.0,
            'random_state': 42,
            'n_jobs': -1,
            'early_stopping_rounds': 50
        }
        
        self.model = xgb.XGBRegressor(**params)
        
        print(f"Training samples: {len(X_train)}")
        print(f"Validation samples: {len(X_val)}")
        print(f"Features: {len(X_train.columns)}\n")
        
        self.model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            verbose=50
        )
        
        train_pred = self.model.predict(X_train)
        val_pred = self.model.predict(X_val)
        
        metrics = {
            'train_mae': mean_absolute_error(y_train, train_pred),
            'train_rmse': np.sqrt(mean_squared_error(y_train, train_pred)),
            'train_r2': r2_score(y_train, train_pred),
            'val_mae': mean_absolute_error(y_val, val_pred),
            'val_rmse': np.sqrt(mean_squared_error(y_val, val_pred)),
            'val_r2': r2_score(y_val, val_pred)
        }
        
        print("\n" + "="*60)
        print("MODEL PERFORMANCE METRICS")
        print("="*60)
        print(f"\nTraining Set:")
        print(f"  MAE:  {metrics['train_mae']:,.0f} VND")
        print(f"  RMSE: {metrics['train_rmse']:,.0f} VND")
        print(f"  R²:   {metrics['train_r2']:.4f}")
        print(f"\nValidation Set:")
        print(f"  MAE:  {metrics['val_mae']:,.0f} VND")
        print(f"  RMSE: {metrics['val_rmse']:,.0f} VND")
        print(f"  R²:   {metrics['val_r2']:.4f}")
        
        # Calculate generalization gap
        gap = metrics['train_r2'] - metrics['val_r2']
        print(f"\n  Generalization Gap: {gap:.4f}")
        if gap < 0.05:
            print("   Good generalization - minimal overfitting")
        elif gap < 0.15:
            print("     Moderate overfitting detected")
        else:
            print("    High overfitting - model may not generalize well")
        
        print("="*60 + "\n")
        
        return metrics
    
    def get_feature_importance(self, feature_names: List[str], top_n: int = 15) -> pd.DataFrame:
        """Get top N most important features"""
        if self.model is None:
            return None
        
        importance_df = pd.DataFrame({
            'feature': feature_names,
            'importance': self.model.feature_importances_
        }).sort_values('importance', ascending=False).head(top_n)
        
        return importance_df


class DeploymentPackage:
    """
    Saves and loads complete deployment package for production inference.
    Includes: model, encoders, route statistics, feature metadata.
    """
    
    def __init__(self, save_dir: str = 'deployment_package'):
        self.save_dir = Path(save_dir)
        self.save_dir.mkdir(exist_ok=True)
        
    def save(self, model: xgb.XGBRegressor, processor: FlightDataProcessor, 
             metrics: Dict[str, float], feature_importance: pd.DataFrame):
        """
        Save complete deployment package.
        """
        print("\n" + "="*60)
        print("💾 SAVING DEPLOYMENT PACKAGE")
        print("="*60 + "\n")
        
        # 1. Save XGBoost model
        model_path = self.save_dir / 'xgboost_model.json'
        model.save_model(model_path)
        print(f"✓ Model saved: {model_path}")
        
        # 2. Save label encoders
        encoders_path = self.save_dir / 'label_encoders.pkl'
        joblib.dump(processor.label_encoders, encoders_path)
        print(f"✓ Encoders saved: {encoders_path}")
        
        # 3. Save route statistics (CRITICAL for deal detection)
        stats_path = self.save_dir / 'route_statistics.parquet'
        processor.route_stats.to_parquet(stats_path, index=False)
        print(f"✓ Route stats saved: {stats_path}")
        
        # 4. Save global fallback stats
        fallback_path = self.save_dir / 'global_fallback_stats.json'
        with open(fallback_path, 'w') as f:
            json.dump(processor.global_fallback_stats, f, indent=2)
        print(f"✓ Global fallback stats saved: {fallback_path}")
        
        # 5. Save feature metadata
        metadata = {
            'feature_columns': processor.feature_columns,
            'training_metrics': metrics,
            'trained_at': datetime.now().isoformat(),
            'total_routes': len(processor.route_stats),
            'airlines': list(processor.label_encoders['airline'].classes_),
            'leakage_free': True,
            'version': '2.0'
        }
        
        metadata_path = self.save_dir / 'metadata.json'
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        print(f"✓ Metadata saved: {metadata_path}")
        
        # 6. Save feature importance
        importance_path = self.save_dir / 'feature_importance.csv'
        feature_importance.to_csv(importance_path, index=False)
        print(f"✓ Feature importance saved: {importance_path}")
        
        # 7. Create complete package archive
        package_path = self.save_dir / 'flight_ai_engine.pkl'
        package = {
            'model_path': str(model_path),
            'encoders': processor.label_encoders,
            'route_stats': processor.route_stats,
            'global_fallback_stats': processor.global_fallback_stats,
            'feature_columns': processor.feature_columns,
            'metadata': metadata,
            # Add plane_map for inference-time type_of_plane reconstruction
            'plane_map': processor.plane_map
        }
        joblib.dump(package, package_path)
        print(f"✓ Complete package saved: {package_path}")
        
        print("\n" + "="*60)
        print("✅ DEPLOYMENT PACKAGE SAVED SUCCESSFULLY")
        print(f"   Location: {self.save_dir.absolute()}")
        print("="*60 + "\n")
        
        return package_path
    
    def load(self) -> Dict[str, Any]:
        """Load deployment package"""
        package_path = self.save_dir / 'flight_ai_engine.pkl'
        if not package_path.exists():
            raise FileNotFoundError(f"Package not found: {package_path}")
        
        return joblib.load(package_path)


def main():

    print("\n" + "="*80)
    print("FLIGHT PRICE PREDICTION & INTELLIGENCE SYSTEM v2.0")
    print("   Production-Ready ML Pipeline (LEAKAGE-FREE)")
    print("="*80 + "\n")
    
    # ========== LOAD DATA ==========
    print("Loading flight data...")
    df = pd.read_csv('data/all_airlines_cleaned.csv')
    print(f"✓ Loaded {len(df):,} flight records (cleaned data)")
    print(f"✓ Columns: {list(df.columns)}")
    print(f"✓ Date range: {df['flight_date'].min()} to {df['flight_date'].max()}\n")
    
    # ========== CRITICAL FIX: SPLIT BEFORE FEATURE ENGINEERING ==========
    print("="*80)
    print("CRITICAL STEP: Splitting data BEFORE feature engineering")
    print("   This prevents validation data from leaking into training statistics")
    print("="*80 + "\n")
    
    print("Splitting data (80% train, 20% validation)...")
    
    # Split on the RAW data (before any feature engineering)
    train_df, val_df = train_test_split(
        df, test_size=0.2, random_state=42, shuffle=True
    )
    
    print(f"✓ Train: {len(train_df):,} samples")
    print(f"✓ Validation: {len(val_df):,} samples\n")
    
    # ========== FEATURE ENGINEERING (LEAKAGE-FREE) ==========
    processor = FlightDataProcessor()
    
    # Fit processor on TRAINING data only
    print("="*80)
    print("📊 Step 1: FIT processor on TRAINING data")
    print("="*80)
    X_train = processor.fit_transform(train_df)
    y_train = train_df['price']
    
    # Transform validation data using TRAINING statistics
    print("="*80)
    print("📊 Step 2: TRANSFORM validation data using TRAINING statistics")
    print("="*80)
    X_val = processor.transform(val_df)
    y_val = val_df['price']
    
    print(f"\n✓ Training features shape: {X_train.shape}")
    print(f"✓ Validation features shape: {X_val.shape}")
    print(f"✓ Feature columns: {len(processor.feature_columns)}\n")
    
    # ========== TRAIN MODEL ==========
    model_trainer = FlightPriceModel()
    metrics = model_trainer.train(X_train, y_train, X_val, y_val)
    
    # ========== FEATURE IMPORTANCE ==========
    print("Analyzing feature importance...")
    importance_df = model_trainer.get_feature_importance(processor.feature_columns, top_n=15)
    print("\nTop 15 Most Important Features:")
    print(importance_df.to_string(index=False))
    
    # Check for leakage indicators
    print("\n" + "="*60)
    print("LEAKAGE DIAGNOSTIC CHECK")
    print("="*60)
    
    stat_features = ['q1', 'median', 'q3', 'mean', 'std']
    stat_importance = importance_df[importance_df['feature'].isin(stat_features)]
    total_stat_importance = stat_importance['importance'].sum()
    
    print(f"Statistical features importance: {total_stat_importance:.2%}")
    
    if total_stat_importance > 0.90:
        print("WARNING: Statistical features dominate (>90%)")
        print("   This may indicate residual leakage or overfitting")
    elif total_stat_importance > 0.70:
        print("  CAUTION: Statistical features are very important (>70%)")
        print("   Model relies heavily on historical patterns")
    else:
        print("✓ GOOD: Feature importance is well-distributed")
        print("   Model uses diverse features for prediction")
    
    print("="*60 + "\n")
    
    # ========== SAVE DEPLOYMENT PACKAGE ==========
    deployer = DeploymentPackage()
    package_path = deployer.save(
        model=model_trainer.model,
        processor=processor,
        metrics=metrics,
        feature_importance=importance_df
    )
    
    print("="*80)
    print("TRAINING PIPELINE COMPLETED SUCCESSFULLY!")
    print(f"   Deployment package ready at: {package_path}")
    print("   Version: 2.0 (Leakage-Free)")
    print("="*80 + "\n")


if __name__ == '__main__':
    main()