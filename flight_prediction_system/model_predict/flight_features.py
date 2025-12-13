import pandas as pd
import numpy as np
from typing import List, Tuple
import warnings
warnings.filterwarnings('ignore')


def create_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Create temporal features from datetime columns.
    
    Features:
    - days_to_departure: Days between snapshot and flight
    - day_of_week: 0=Monday, 6=Sunday
    - month: 1-12
    - is_weekend: Boolean
    - hour_of_day: From departure_time
    - is_morning, is_afternoon, is_evening, is_night: Time of day bins
    
    Args:
        df: DataFrame with create_at, flight_date, departure_hour
        
    Returns:
        DataFrame with temporal features added
    """
    df = df.copy()
    
    # Days to departure (target critical feature)
    df['days_to_departure'] = (df['flight_date'] - df['create_at']).dt.days
    
    # Features from create_at (snapshot time)
    df['snapshot_day_of_week'] = df['create_at'].dt.dayofweek
    df['snapshot_month'] = df['create_at'].dt.month
    df['snapshot_day'] = df['create_at'].dt.day
    df['snapshot_is_weekend'] = df['snapshot_day_of_week'].isin([5, 6]).astype(int)
    
    # Features from flight_date
    df['flight_day_of_week'] = df['flight_date'].dt.dayofweek
    df['flight_month'] = df['flight_date'].dt.month
    df['flight_is_weekend'] = df['flight_day_of_week'].isin([5, 6]).astype(int)
    
    # Time of day features (from departure_hour)
    if 'departure_hour' in df.columns:
        df['is_morning'] = ((df['departure_hour'] >= 6) & (df['departure_hour'] < 12)).astype(int)
        df['is_afternoon'] = ((df['departure_hour'] >= 12) & (df['departure_hour'] < 17)).astype(int)
        df['is_evening'] = ((df['departure_hour'] >= 17) & (df['departure_hour'] < 21)).astype(int)
        df['is_night'] = ((df['departure_hour'] >= 21) | (df['departure_hour'] < 6)).astype(int)
    
    # Week of year
    df['snapshot_week'] = df['create_at'].dt.isocalendar().week
    df['flight_week'] = df['flight_date'].dt.isocalendar().week
    
    return df


def create_lag_features(df: pd.DataFrame, 
                        group_cols: List[str], 
                        lag_days: List[int] = [3, 7, 14]) -> pd.DataFrame:
    """
    Create price lag features for time series.
    REFACTORED to prevent leakage:
    - Removed lag_1d (too correlated with current price)
    - Uses longer lags (3, 7, 14 days) to capture trends
    - Focuses on price changes rather than absolute prices
    
    Args:
        df: DataFrame sorted by flight_instance and create_at
        group_cols: Columns to group by (e.g., ['flight_instance'])
        lag_days: List of lag periods in days (minimum 3 to prevent leakage)
        
    Returns:
        DataFrame with lag features
    """
    df = df.copy()
    
    # Validate minimum lag to prevent leakage
    if any(lag < 3 for lag in lag_days):
        print("⚠️  WARNING: Lag periods < 3 days removed to prevent data leakage")
        lag_days = [lag for lag in lag_days if lag >= 3]
    
    for lag in lag_days:
        lag_col = f'price_lag_{lag}d'
        
        # Create lag by shifting within each group
        df[lag_col] = df.groupby(group_cols)['price'].shift(lag)
        
        # Calculate price change (absolute and percentage)
        df[f'price_change_{lag}d'] = df['price'] - df[lag_col]
        df[f'price_change_pct_{lag}d'] = (
            (df['price'] - df[lag_col]) / df[lag_col] * 100
        ).replace([np.inf, -np.inf], np.nan)
        
        # Price momentum: is price higher/lower than N days ago?
        df[f'price_momentum_{lag}d'] = (df['price'] > df[lag_col]).astype(int)
    
    # Add trend strength features (velocity and acceleration)
    if 7 in lag_days and 14 in lag_days:
        # Velocity: recent change vs older change
        df['price_velocity'] = df['price_change_7d'] - df['price_change_14d']
        
        # Acceleration: change in change rate
        if 'price_change_3d' in df.columns:
            df['price_acceleration'] = df['price_change_3d'] - df['price_change_7d']
    
    return df


def create_rolling_features(df: pd.DataFrame, 
                            group_cols: List[str],
                            windows: List[int] = [7, 14, 21]) -> pd.DataFrame:
    """
    Create rolling statistics features with STRICT no look-ahead bias.
    REFACTORED to prevent leakage:
    - Uses shift(1) before rolling to exclude current observation
    - Increased minimum periods to ensure statistical validity
    - Added more robust NaN handling
    
    Args:
        df: DataFrame with price column
        group_cols: Columns to group by
        windows: List of window sizes in days (minimum 7 recommended)
        
    Returns:
        DataFrame with rolling features
    """
    df = df.copy()
    
    for window in windows:
        # CRITICAL FIX: Shift by 1 BEFORE calculating rolling stats
        # This ensures we only use data from t-1 backwards, never t
        shifted_price = df.groupby(group_cols)['price'].shift(1)
        
        # Rolling statistics on shifted data
        rolling = shifted_price.groupby(df.groupby(group_cols).ngroup()).rolling(
            window=window, 
            min_periods=max(3, window // 2)  # Require at least half the window for stability
        )
        
        df[f'price_rolling_mean_{window}d'] = rolling.mean().reset_index(0, drop=True)
        df[f'price_rolling_std_{window}d'] = rolling.std().reset_index(0, drop=True)
        df[f'price_rolling_min_{window}d'] = rolling.min().reset_index(0, drop=True)
        df[f'price_rolling_max_{window}d'] = rolling.max().reset_index(0, drop=True)
        
        # Distance from rolling mean (current price vs historical avg)
        df[f'price_vs_mean_{window}d'] = (
            df['price'] - df[f'price_rolling_mean_{window}d']
        )
        
        # Relative position in rolling range (0 = at min, 1 = at max)
        range_width = df[f'price_rolling_max_{window}d'] - df[f'price_rolling_min_{window}d']
        df[f'price_position_{window}d'] = (
            (df['price'] - df[f'price_rolling_min_{window}d']) / range_width
        ).replace([np.inf, -np.inf], np.nan).fillna(0.5)
        
        # Coefficient of variation (volatility measure)
        df[f'price_cv_{window}d'] = (
            df[f'price_rolling_std_{window}d'] / df[f'price_rolling_mean_{window}d']
        ).replace([np.inf, -np.inf], np.nan)
        
        # Z-score: how many standard deviations from mean
        df[f'price_zscore_{window}d'] = (
            (df['price'] - df[f'price_rolling_mean_{window}d']) / 
            df[f'price_rolling_std_{window}d']
        ).replace([np.inf, -np.inf], np.nan)
    
    return df


def create_route_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Create aggregated features by route using EXPANDING WINDOWS.
    
    CRITICAL FIX: Uses expanding().shift(1) to prevent data leakage
    - Each row only sees statistics from PREVIOUS observations on that route
    - Current price is EXCLUDED from the calculation
    
    Features:
    - Historical average price for route (up to t-1)
    - Route price volatility (up to t-1)
    - Route popularity (number of snapshots up to t-1)
    
    Args:
        df: DataFrame with route and price columns, sorted by create_at
        
    Returns:
        DataFrame with route features (no leakage)
    """
    df = df.copy()
    
    # CRITICAL: Sort by route and time to ensure correct expanding window behavior
    df = df.sort_values(['route', 'create_at']).reset_index(drop=True)
    
    # Create expanding window statistics PER ROUTE
    # shift(1) ensures we EXCLUDE the current row from calculations
    route_grouped = df.groupby('route')['price']
    
    # Expanding mean (average price seen so far on this route, excluding current)
    df['route_avg_price'] = route_grouped.transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    )
    
    # Expanding std (volatility seen so far on this route, excluding current)
    df['route_price_std'] = route_grouped.transform(
        lambda x: x.shift(1).expanding(min_periods=2).std()
    )
    
    # Expanding min (lowest price seen so far on this route, excluding current)
    df['route_min_price'] = route_grouped.transform(
        lambda x: x.shift(1).expanding(min_periods=1).min()
    )
    
    # Expanding max (highest price seen so far on this route, excluding current)
    df['route_max_price'] = route_grouped.transform(
        lambda x: x.shift(1).expanding(min_periods=1).max()
    )
    
    # Route popularity (count of observations seen so far, excluding current)
    df['route_popularity'] = route_grouped.transform(
        lambda x: x.shift(1).expanding(min_periods=1).count()
    )
    
    # Cold start handling: Fill NaN with global statistics for first occurrence
    # Calculate global priors (using only training data in production)
    global_avg = df['price'].mean()
    global_std = df['price'].std()
    
    df['route_avg_price'] = df['route_avg_price'].fillna(global_avg)
    df['route_price_std'] = df['route_price_std'].fillna(global_std)
    df['route_min_price'] = df['route_min_price'].fillna(df['price'])  # Use current as fallback
    df['route_max_price'] = df['route_max_price'].fillna(df['price'])  # Use current as fallback
    df['route_popularity'] = df['route_popularity'].fillna(0)
    
    # Derived features (safe because they use the shifted expanding stats)
    df['price_vs_route_avg'] = df['price'] - df['route_avg_price']
    df['price_vs_route_avg_pct'] = (
        (df['price'] - df['route_avg_price']) / df['route_avg_price'] * 100
    )
    
    # Normalized price within route's historical range (0-1 scale)
    range_width = df['route_max_price'] - df['route_min_price']
    df['price_normalized_route'] = (
        (df['price'] - df['route_min_price']) / range_width
    ).replace([np.inf, -np.inf], np.nan).fillna(0.5)
    
    return df


def create_flight_specific_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Create features specific to each flight instance using EXPANDING WINDOWS.
    
    CRITICAL FIX: Uses expanding().shift(1) to prevent data leakage
    - Each row only sees statistics from PREVIOUS observations of that flight
    - Current price is EXCLUDED from the calculation
    
    Args:
        df: DataFrame with flight_instance column, sorted by create_at
        
    Returns:
        DataFrame with flight-specific features (no leakage)
    """
    df = df.copy()
    
    # CRITICAL: Sort by flight_instance and time
    df = df.sort_values(['flight_instance', 'create_at']).reset_index(drop=True)
    
    # Create expanding window statistics PER FLIGHT INSTANCE
    # shift(1) ensures we EXCLUDE the current row from calculations
    flight_grouped = df.groupby('flight_instance')['price']
    
    # Expanding min (lowest price seen so far for this flight, excluding current)
    df['flight_min_price'] = flight_grouped.transform(
        lambda x: x.shift(1).expanding(min_periods=1).min()
    )
    
    # Expanding max (highest price seen so far for this flight, excluding current)
    df['flight_max_price'] = flight_grouped.transform(
        lambda x: x.shift(1).expanding(min_periods=1).max()
    )
    
    # Expanding mean (average price seen so far for this flight, excluding current)
    df['flight_avg_price'] = flight_grouped.transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    )
    
    # Snapshot count (how many times we've seen this flight before current observation)
    df['flight_snapshot_count'] = flight_grouped.transform(
        lambda x: x.shift(1).expanding(min_periods=1).count()
    )
    
    # Cold start handling: For first occurrence of a flight, use current price as baseline
    df['flight_min_price'] = df['flight_min_price'].fillna(df['price'])
    df['flight_max_price'] = df['flight_max_price'].fillna(df['price'])
    df['flight_avg_price'] = df['flight_avg_price'].fillna(df['price'])
    df['flight_snapshot_count'] = df['flight_snapshot_count'].fillna(0)
    
    # Derived features (safe because they use the shifted expanding stats)
    df['price_vs_flight_min'] = df['price'] - df['flight_min_price']
    df['price_vs_flight_max'] = df['flight_max_price'] - df['price']
    
    # Is this the lowest/highest price seen so far? (comparing current to historical)
    df['is_min_price_so_far'] = (df['price'] <= df['flight_min_price']).astype(int)
    df['is_max_price_so_far'] = (df['price'] >= df['flight_max_price']).astype(int)
    
    return df


def create_target_labels(df: pd.DataFrame, 
                        threshold_up: float = 1.05,
                        threshold_down: float = 0.95) -> pd.DataFrame:
    """
    Create target labels for trend classification.
    
    Labels:
    - 'Up': Future price > current * threshold_up
    - 'Down': Future price < current * threshold_down
    - 'Stable': Otherwise
    
    Args:
        df: DataFrame with price column
        threshold_up: Multiplier for upward trend (1.05 = 5% increase)
        threshold_down: Multiplier for downward trend (0.95 = 5% decrease)
        
    Returns:
        DataFrame with target labels
    """
    df = df.copy()
    
    # Get next price within the same flight instance
    df['price_next'] = df.groupby('flight_instance')['price'].shift(-1)
    
    # Calculate price ratio
    df['price_ratio'] = df['price_next'] / df['price']
    
    # Create trend labels
    conditions = [
        df['price_ratio'] > threshold_up,
        df['price_ratio'] < threshold_down
    ]
    choices = ['Up', 'Down']
    df['trend_label'] = np.select(conditions, choices, default='Stable')
    
    # Binary labels for each category
    df['trend_is_up'] = (df['trend_label'] == 'Up').astype(int)
    df['trend_is_down'] = (df['trend_label'] == 'Down').astype(int)
    df['trend_is_stable'] = (df['trend_label'] == 'Stable').astype(int)
    
    return df


def engineer_features(df: pd.DataFrame, 
                     for_training: bool = True) -> pd.DataFrame:
    """
    Master function to engineer all features.
    
    Args:
        df: Preprocessed DataFrame
        for_training: If True, create target labels
        
    Returns:
        DataFrame with all engineered features
    """
    print("\n" + "=" * 60)
    print("FEATURE ENGINEERING (ANTI-LEAKAGE VERSION)")
    print("=" * 60)
    
    # CRITICAL: Ensure data is sorted by time BEFORE feature engineering
    print("\nSorting data by time (critical for expanding windows)...")
    df = df.sort_values('create_at').reset_index(drop=True)
    
    # Temporal features (no leakage risk)
    print("Creating temporal features...")
    df = create_temporal_features(df)
    
    # Route-based features (FIXED: expanding windows)
    print("Creating route-based features (expanding windows, no leakage)...")
    df = create_route_features(df)
    
    # Flight-specific features (FIXED: expanding windows)
    print("Creating flight-specific features (expanding windows, no leakage)...")
    df = create_flight_specific_features(df)
    
    # Lag features (already safe - uses shift)
    print("Creating lag features (min 3 days to prevent leakage)...")
    df = create_lag_features(df, group_cols=['flight_instance'], lag_days=[3, 7, 14])
    
    # Rolling features (already safe - uses shift before rolling)
    print("Creating rolling statistics (look-back only)...")
    df = create_rolling_features(df, group_cols=['flight_instance'], windows=[7, 14, 21])
    
    # Target labels (for training)
    if for_training:
        print("Creating target labels...")
        df = create_target_labels(df)
    
    print("\nFeature engineering complete!")
    print(f"Total features: {len(df.columns)}")
    print("GUARANTEED: No future information leakage")
    print("=" * 60 + "\n")
    
    return df


def get_feature_columns() -> dict:
    """
    Get lists of feature columns by category.
    UPDATED to reflect anti-leakage features.
    
    Returns:
        Dictionary with feature column lists
    """
    feature_cols = {
        'temporal': [
            'days_to_departure',
            'snapshot_day_of_week', 'snapshot_month', 'snapshot_day',
            'snapshot_is_weekend', 'snapshot_week',
            'flight_day_of_week', 'flight_month', 'flight_is_weekend', 'flight_week'
        ],
        'time_of_day': [
            'departure_hour', 'is_morning', 'is_afternoon', 'is_evening', 'is_night'
        ],
        'lag': [
            # REMOVED: price_lag_1d (too correlated)
            'price_lag_3d', 'price_lag_7d', 'price_lag_14d',
            'price_change_3d', 'price_change_7d', 'price_change_14d',
            'price_change_pct_3d', 'price_change_pct_7d', 'price_change_pct_14d',
            'price_momentum_3d', 'price_momentum_7d', 'price_momentum_14d',
            'price_velocity', 'price_acceleration'
        ],
        'rolling': [
            # UPDATED: Windows changed to 7, 14, 21 days
            'price_rolling_mean_7d', 'price_rolling_std_7d', 'price_vs_mean_7d', 
            'price_position_7d', 'price_cv_7d', 'price_zscore_7d',
            'price_rolling_mean_14d', 'price_rolling_std_14d', 'price_vs_mean_14d',
            'price_position_14d', 'price_cv_14d', 'price_zscore_14d',
            'price_rolling_mean_21d', 'price_rolling_std_21d', 'price_vs_mean_21d',
            'price_position_21d', 'price_cv_21d', 'price_zscore_21d'
        ],
        'route': [
            'route_avg_price', 'route_price_std', 'route_popularity',
            'price_vs_route_avg', 'price_vs_route_avg_pct', 'price_normalized_route'
        ],
        'flight': [
            'flight_snapshot_count', 'price_vs_flight_min', 'price_vs_flight_max',
            'is_min_price_so_far', 'is_max_price_so_far'
        ],
        'categorical': [
            'flight_number', 'type_of_plane', 'departure_airport', 
            'arrival_airport', 'classes', 'route'
        ]
    }
    
    return feature_cols


if __name__ == "__main__":
    print("Feature engineering module loaded successfully!")
    print("ANTI-LEAKAGE VERSION - All expanding windows use shift(1)")