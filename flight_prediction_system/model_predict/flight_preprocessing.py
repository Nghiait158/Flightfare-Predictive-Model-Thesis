import pandas as pd
import numpy as np
from datetime import datetime
from typing import Tuple, Optional
import warnings
warnings.filterwarnings('ignore')


def robust_date_parser(date_str: str) -> Optional[datetime]:
    """
    Parse dates with multiple format support.
    Handles: DD/MM/YYYY, YYYY-MM-DD, ISO format with timezone
    
    Args:
        date_str: String representation of date
        
    Returns:
        datetime object or None if parsing fails
    """
    if pd.isna(date_str) or date_str == '':
        return None
    
    formats = [
        '%d/%m/%Y',           # 01/08/2025
        '%Y-%m-%d',           # 2025-08-03
        '%Y/%m/%d',           # 2025/08/03
        '%m/%d/%Y',           # 08/01/2025 (US format)
        '%d-%m-%Y',           # 01-08-2025
    ]
    
    try:
        if 'T' in str(date_str):
            return pd.to_datetime(date_str, utc=True).tz_localize(None)
    except:
        pass
    
    for fmt in formats:
        try:
            return datetime.strptime(str(date_str).strip(), fmt)
        except:
            continue
    
    try:
        return pd.to_datetime(date_str, errors='coerce')
    except:
        return None


def impute_plane_type_by_flight_number(df: pd.DataFrame) -> pd.DataFrame:
    """
    Impute missing type_of_plane based on flight_number mode.
    Logic: For each flight_number, find the most common plane type and fill NaNs.
    
    Args:
        df: DataFrame with flight_number and type_of_plane columns
        
    Returns:
        DataFrame with imputed type_of_plane
    """
    df = df.copy()
    
    # Calculate mode (most frequent) plane type for each flight number
    plane_mode = df.groupby('flight_number')['type_of_plane'].agg(
        lambda x: x.mode()[0] if not x.mode().empty else np.nan
    ).to_dict()
    
    # Fill missing values
    mask = df['type_of_plane'].isna()
    df.loc[mask, 'type_of_plane'] = df.loc[mask, 'flight_number'].map(plane_mode)
    
    return df


def parse_time_to_hour(time_str: str) -> Optional[float]:
    """
    Extract hour from time string (e.g., '14:30' -> 14.5)
    
    Args:
        time_str: Time string in various formats
        
    Returns:
        Hour as float or None
    """
    if pd.isna(time_str):
        return None
    
    try:
        if ':' in str(time_str):
            parts = str(time_str).split(':')
            hour = int(parts[0])
            minute = int(parts[1])
            return hour + minute / 60.0
        return float(time_str)
    except:
        return None


def preprocess_pipeline(df: pd.DataFrame) -> pd.DataFrame:
    """
    Main preprocessing pipeline for flight data.
    
    Handles:
    1. Inconsistent date formats in flight_date and create_at
    2. Missing type_of_plane values (impute by flight_number mode)
    3. Data type conversions
    4. Remove invalid records
    
    Args:
        df: Raw flight data DataFrame
        
    Returns:
        Cleaned DataFrame ready for feature engineering
    """
    print("=" * 60)
    print("FLIGHT DATA PREPROCESSING PIPELINE")
    print("=" * 60)
    
    df = df.copy()
    initial_rows = len(df)
    print(f"\nInitial dataset size: {initial_rows:,} rows")
    
    # ========================================
    # STEP 1: Parse dates with robust handling
    # ========================================
    print("\nStep 1: Parsing dates...")
    
    # Parse create_at
    df['create_at'] = df['create_at'].apply(robust_date_parser)
    create_at_nulls = df['create_at'].isna().sum()
    print(f"   - create_at parsed: {create_at_nulls} null values")
    
    # Parse flight_date
    df['flight_date'] = df['flight_date'].apply(robust_date_parser)
    flight_date_nulls = df['flight_date'].isna().sum()
    print(f"   - flight_date parsed: {flight_date_nulls} null values")
    
    # Remove rows with invalid dates
    df = df.dropna(subset=['create_at', 'flight_date'])
    print(f"   - Removed {initial_rows - len(df)} rows with invalid dates")
    
    # ========================================
    # STEP 2: Impute missing type_of_plane
    # ========================================
    print("\nStep 2: Imputing missing plane types...")
    missing_before = df['type_of_plane'].isna().sum()
    print(f"   - Missing type_of_plane: {missing_before}")
    
    df = impute_plane_type_by_flight_number(df)
    
    missing_after = df['type_of_plane'].isna().sum()
    print(f"   - After imputation: {missing_after} missing")
    print(f"   - Successfully imputed: {missing_before - missing_after} values")
    
    # ========================================
    # STEP 3: Data type conversions
    # ========================================
    print("\nStep 3: Converting data types...")
    
    # Convert price to numeric
    df['price'] = pd.to_numeric(df['price'], errors='coerce')
    price_nulls = df['price'].isna().sum()
    print(f"   - price converted to numeric: {price_nulls} null values")
    
    # Remove rows with invalid prices
    df = df[df['price'] > 0]
    
    # Parse departure and arrival times
    df['departure_hour'] = df['departure_time'].apply(parse_time_to_hour)
    df['arrival_hour'] = df['arrival_time'].apply(parse_time_to_hour)
    
    # ========================================
    # STEP 4: Create composite keys
    # ========================================
    print("\nStep 4: Creating composite keys...")
    
    # Create unique flight instance identifier
    df['flight_instance'] = (
        df['flight_number'].astype(str) + '_' + 
        df['flight_date'].dt.strftime('%Y%m%d') + '_' + 
        df['classes'].astype(str)
    )
    
    # Create route identifier
    df['route'] = df['departure_airport'].astype(str) + '_' + df['arrival_airport'].astype(str)
    
    print(f"   - Unique flight instances: {df['flight_instance'].nunique():,}")
    print(f"   - Unique routes: {df['route'].nunique():,}")
    
    # ========================================
    # STEP 5: Sort by time
    # ========================================
    print("\nStep 5: Sorting by time...")
    df = df.sort_values(['flight_instance', 'create_at']).reset_index(drop=True)
    
    # ========================================
    # FINAL SUMMARY
    # ========================================
    final_rows = len(df)
    print("\n" + "=" * 60)
    print("PREPROCESSING COMPLETE")
    print("=" * 60)
    print(f"Final dataset size: {final_rows:,} rows")
    print(f"Rows removed: {initial_rows - final_rows:,} ({100*(initial_rows-final_rows)/initial_rows:.1f}%)")
    print(f"Date range: {df['create_at'].min()} to {df['create_at'].max()}")
    print(f"Price range: ${df['price'].min():.2f} to ${df['price'].max():.2f}")
    print("=" * 60 + "\n")
    
    return df


def validate_data_quality(df: pd.DataFrame) -> dict:
    """
    Validate data quality after preprocessing.
    
    Args:
        df: Preprocessed DataFrame
        
    Returns:
        Dictionary with quality metrics
    """
    quality_report = {
        'total_rows': len(df),
        'missing_values': df.isnull().sum().to_dict(),
        'date_range': {
            'earliest_snapshot': df['create_at'].min(),
            'latest_snapshot': df['create_at'].max(),
            'earliest_flight': df['flight_date'].min(),
            'latest_flight': df['flight_date'].max()
        },
        'price_stats': {
            'mean': df['price'].mean(),
            'median': df['price'].median(),
            'std': df['price'].std(),
            'min': df['price'].min(),
            'max': df['price'].max()
        },
        'unique_counts': {
            'flights': df['flight_number'].nunique(),
            'routes': df['route'].nunique(),
            'airports': df['departure_airport'].nunique() + df['arrival_airport'].nunique(),
            'plane_types': df['type_of_plane'].nunique()
        }
    }
    
    return quality_report


if __name__ == "__main__":
    print("Preprocessing module loaded successfully!")
    print("Ready to process flight data.")