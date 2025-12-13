import pandas as pd
import numpy as np
from typing import Tuple, Dict, List, Optional
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.metrics import accuracy_score, classification_report
import lightgbm as lgb
import xgboost as xgb
import pickle
import warnings
warnings.filterwarnings('ignore')


def calculate_naive_baseline(df: pd.DataFrame, 
                             train_idx: List[int],
                             val_idx: List[int]) -> Dict:
    """
    Calculate naive baseline: predict price_t = price_{t-3}
    This is our minimum performance threshold.
    
    Args:
        df: DataFrame with price and lag features
        train_idx: Training indices
        val_idx: Validation indices
        
    Returns:
        Dictionary with baseline metrics
    """
    print("\n" + "=" * 60)
    print("📊 NAIVE BASELINE CALCULATION")
    print("=" * 60)
    
    if 'price_lag_3d' not in df.columns:
        print("⚠️  Warning: price_lag_3d not found, cannot calculate baseline")
        return {'baseline_rmse': None, 'baseline_mae': None}
    
    # # Get validation data
    # df_val = df.iloc[val_idx].copy()
    # df_val = df_val.dropna(subset=['price', 'price_lag_3d'])

    # Get validation data
    # FIX: df được truyền vào đã là df_val, không cần dùng iloc để cắt lại
    df_val = df.copy()
    
    # Nếu muốn lọc theo index được truyền vào (đề phòng trường hợp df là full data)
    # Hãy dùng .loc (theo nhãn) thay vì .iloc (theo vị trí), hoặc bỏ qua nếu df đã là validation set
    if len(val_idx) > 0 and len(df) > len(val_idx):
         # Chỉ cắt nếu df lớn hơn số lượng index được yêu cầu (trường hợp df là full dataset)
         df_val = df.iloc[val_idx].copy()

    df_val = df_val.dropna(subset=['price', 'price_lag_3d'])
    
    if len(df_val) == 0:
        print("No valid data for baseline calculation")
        return {'baseline_rmse': None, 'baseline_mae': None}
    
    y_true = df_val['price'].values
    y_pred_naive = df_val['price_lag_3d'].values
    
    baseline_rmse = np.sqrt(mean_squared_error(y_true, y_pred_naive))
    baseline_mae = mean_absolute_error(y_true, y_pred_naive)
    baseline_mape = np.mean(np.abs((y_true - y_pred_naive) / y_true)) * 100
    
    print(f"\n🎯 Naive Baseline (Predict = price_lag_3d):")
    print(f"   RMSE: ${baseline_rmse:,.2f}")
    print(f"   MAE: ${baseline_mae:,.2f}")
    print(f"   MAPE: {baseline_mape:.2f}%")
    print("=" * 60 + "\n")
    
    return {
        'baseline_rmse': baseline_rmse,
        'baseline_mae': baseline_mae,
        'baseline_mape': baseline_mape
    }


class TimeBasedSplitter:
    """
    Time-based splitting to prevent data leakage.
    Train on past dates, validate on future dates.
    """
    
    def __init__(self, n_splits: int = 3):
        self.n_splits = n_splits
    
    def split(self, df: pd.DataFrame, date_col: str = 'create_at') -> List[Tuple]:
        """
        Create time-based train/validation splits.
        
        Args:
            df: DataFrame with date column
            date_col: Name of date column to split on
            
        Returns:
            List of (train_idx, val_idx) tuples
        """
        df = df.sort_values(date_col).reset_index(drop=True)
        n = len(df)
        
        splits = []
        for i in range(1, self.n_splits + 1):
            train_end = int(n * i / (self.n_splits + 1))
            val_end = int(n * (i + 1) / (self.n_splits + 1)) if i < self.n_splits else n
            
            train_idx = df.index[:train_end].tolist()
            val_idx = df.index[train_end:val_end].tolist()
            
            splits.append((train_idx, val_idx))
        
        return splits


class PriceRegressor:
    """
    Model A: Price prediction using LightGBM/XGBoost
    Predicts exact price for future dates
    """
    
    def __init__(self, model_type: str = 'lightgbm'):
        self.model_type = model_type
        self.model = None
        self.feature_columns = None
        self.categorical_features = None
        self.label_encoders = {}
        
    def prepare_features(self, 
                        df: pd.DataFrame, 
                        feature_cols: List[str],
                        categorical_cols: List[str]) -> pd.DataFrame:
        """
        Prepare features for training, including encoding categoricals.
        
        Args:
            df: DataFrame with features
            feature_cols: List of feature column names
            categorical_cols: List of categorical column names
            
        Returns:
            DataFrame with encoded features
        """
        df = df.copy()
        
        # Encode categorical features
        for col in categorical_cols:
            if col in df.columns:
                if col not in self.label_encoders:
                    self.label_encoders[col] = LabelEncoder()
                    df[col] = self.label_encoders[col].fit_transform(df[col].astype(str))
                else:
                    # Handle unseen categories
                    df[col] = df[col].astype(str).apply(
                        lambda x: self.label_encoders[col].transform([x])[0] 
                        if x in self.label_encoders[col].classes_ 
                        else -1
                    )
        
        return df
    
    def train(self, 
              X_train: pd.DataFrame, 
              y_train: pd.Series,
              X_val: Optional[pd.DataFrame] = None,
              y_val: Optional[pd.Series] = None,
              categorical_features: Optional[List[str]] = None) -> Dict:
        """
        Train the price regression model with STRONG REGULARIZATION.
        
        Args:
            X_train: Training features
            y_train: Training targets
            X_val: Validation features
            y_val: Validation targets
            categorical_features: List of categorical feature names
            
        Returns:
            Dictionary with training metrics
        """
        self.feature_columns = X_train.columns.tolist()
        self.categorical_features = categorical_features or []
        
        if self.model_type == 'lightgbm':
            params = {
                'objective': 'regression',
                'metric': 'rmse',
                'boosting_type': 'gbdt',
                'num_leaves': 20,  # REDUCED from 31
                'learning_rate': 0.03,  # REDUCED from 0.05
                'feature_fraction': 0.7,  # REDUCED from 0.8
                'bagging_fraction': 0.7,  # REDUCED from 0.8
                'bagging_freq': 5,
                'verbose': -1,
                'min_child_samples': 30,  # INCREASED from 20
                'reg_alpha': 0.1,  # NEW: L1 regularization
                'reg_lambda': 0.1,  # NEW: L2 regularization
                'max_depth': 5  # NEW: Limit tree depth
            }
            
            train_data = lgb.Dataset(
                X_train, 
                label=y_train,
                categorical_feature=self.categorical_features
            )
            
            if X_val is not None and y_val is not None:
                val_data = lgb.Dataset(
                    X_val, 
                    label=y_val,
                    categorical_feature=self.categorical_features
                )
                self.model = lgb.train(
                    params,
                    train_data,
                    num_boost_round=500,
                    valid_sets=[train_data, val_data],
                    valid_names=['train', 'valid'],
                    callbacks=[lgb.early_stopping(50), lgb.log_evaluation(100)]
                )
            else:
                self.model = lgb.train(params, train_data, num_boost_round=300)
        
        elif self.model_type == 'xgboost':
            params = {
                'objective': 'reg:squarederror',
                'eval_metric': 'rmse',
                'learning_rate': 0.03,  # REDUCED
                'max_depth': 4,  # REDUCED from 6
                'subsample': 0.7,  # REDUCED
                'colsample_bytree': 0.7,  # REDUCED
                'reg_alpha': 0.1,  # NEW: L1
                'reg_lambda': 1.0,  # NEW: L2
                'min_child_weight': 5,  # NEW
                'verbosity': 0
            }
            
            if X_val is not None and y_val is not None:
                self.model = xgb.train(
                    params,
                    xgb.DMatrix(X_train, label=y_train),
                    num_boost_round=500,
                    evals=[(xgb.DMatrix(X_val, label=y_val), 'valid')],
                    early_stopping_rounds=50,
                    verbose_eval=100
                )
            else:
                self.model = xgb.train(
                    params,
                    xgb.DMatrix(X_train, label=y_train),
                    num_boost_round=300
                )
        
        train_pred = self.predict(X_train)
        metrics = {
            'train_rmse': np.sqrt(mean_squared_error(y_train, train_pred)),
            'train_mae': mean_absolute_error(y_train, train_pred),
            'train_r2': r2_score(y_train, train_pred)
        }
        
        if X_val is not None and y_val is not None:
            val_pred = self.predict(X_val)
            metrics.update({
                'val_rmse': np.sqrt(mean_squared_error(y_val, val_pred)),
                'val_mae': mean_absolute_error(y_val, val_pred),
                'val_r2': r2_score(y_val, val_pred)
            })
        
        return metrics
    
    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Predict prices."""
        if self.model_type == 'lightgbm':
            return self.model.predict(X[self.feature_columns])
        else:
            return self.model.predict(xgb.DMatrix(X[self.feature_columns]))
    
    def get_feature_importance(self) -> pd.DataFrame:
        """Get feature importance."""
        if self.model_type == 'lightgbm':
            importance = self.model.feature_importance(importance_type='gain')
        else:
            importance = self.model.get_score(importance_type='gain')
            importance = [importance.get(f'f{i}', 0) for i in range(len(self.feature_columns))]
        
        return pd.DataFrame({
            'feature': self.feature_columns,
            'importance': importance
        }).sort_values('importance', ascending=False)


class TrendClassifier:
    """
    Model B: Trend classification (Up/Down/Stable)
    Predicts price direction
    """
    
    def __init__(self):
        self.model = None
        self.feature_columns = None
        self.label_encoders = {}
        
    def train(self,
              X_train: pd.DataFrame,
              y_train: pd.Series,
              X_val: Optional[pd.DataFrame] = None,
              y_val: Optional[pd.Series] = None) -> Dict:
        """Train trend classification model."""
        
        self.feature_columns = X_train.columns.tolist()
        
        le = LabelEncoder()
        y_train_encoded = le.fit_transform(y_train)
        self.classes_ = le.classes_
        
        params = {
            'objective': 'multiclass',
            'num_class': len(self.classes_),
            'metric': 'multi_logloss',
            'boosting_type': 'gbdt',
            'num_leaves': 31,
            'learning_rate': 0.05,
            'feature_fraction': 0.8,
            'verbose': -1
        }
        
        train_data = lgb.Dataset(X_train, label=y_train_encoded)
        
        if X_val is not None and y_val is not None:
            y_val_encoded = le.transform(y_val)
            val_data = lgb.Dataset(X_val, label=y_val_encoded)
            
            self.model = lgb.train(
                params,
                train_data,
                num_boost_round=300,
                valid_sets=[train_data, val_data],
                callbacks=[lgb.early_stopping(30), lgb.log_evaluation(100)]
            )
        else:
            self.model = lgb.train(params, train_data, num_boost_round=200)
        
        # Calculate metrics
        train_pred = self.predict(X_train)
        metrics = {
            'train_accuracy': accuracy_score(y_train, train_pred)
        }
        
        if X_val is not None and y_val is not None:
            val_pred = self.predict(X_val)
            metrics.update({
                'val_accuracy': accuracy_score(y_val, val_pred),
                'classification_report': classification_report(y_val, val_pred)
            })
        
        return metrics
    
    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Predict trend labels."""
        proba = self.model.predict(X[self.feature_columns])
        predictions = np.argmax(proba, axis=1)
        return self.classes_[predictions]
    
    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Predict probabilities for each class."""
        return self.model.predict(X[self.feature_columns])


class QuantileRegressor:
    """
    Model C: Quantile regression for confidence intervals
    Predicts 10th and 90th percentile to measure uncertainty
    """
    
    def __init__(self):
        self.model_10 = None  # 10th percentile
        self.model_90 = None  # 90th percentile
        self.feature_columns = None
        
    def train(self,
              X_train: pd.DataFrame,
              y_train: pd.Series,
              X_val: Optional[pd.DataFrame] = None,
              y_val: Optional[pd.Series] = None) -> Dict:
        """Train quantile regression models."""
        
        self.feature_columns = X_train.columns.tolist()
        
        params_10 = {
            'objective': 'quantile',
            'alpha': 0.1,
            'metric': 'quantile',
            'num_leaves': 31,
            'learning_rate': 0.05,
            'verbose': -1
        }
        
        train_data = lgb.Dataset(X_train, label=y_train)
        self.model_10 = lgb.train(params_10, train_data, num_boost_round=200)
        
        params_90 = {
            'objective': 'quantile',
            'alpha': 0.9,
            'metric': 'quantile',
            'num_leaves': 31,
            'learning_rate': 0.05,
            'verbose': -1
        }
        
        self.model_90 = lgb.train(params_90, train_data, num_boost_round=200)        
        train_pred_10 = self.model_10.predict(X_train[self.feature_columns])
        train_pred_90 = self.model_90.predict(X_train[self.feature_columns])
        train_interval_width = np.mean(train_pred_90 - train_pred_10)
        
        metrics = {
            'train_interval_width': train_interval_width
        }
        
        if X_val is not None:
            val_pred_10 = self.model_10.predict(X_val[self.feature_columns])
            val_pred_90 = self.model_90.predict(X_val[self.feature_columns])
            val_interval_width = np.mean(val_pred_90 - val_pred_10)
            metrics['val_interval_width'] = val_interval_width
        
        return metrics
    
    def predict(self, X: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Predict quantile intervals."""
        pred_10 = self.model_10.predict(X[self.feature_columns])
        pred_90 = self.model_90.predict(X[self.feature_columns])
        return pred_10, pred_90
    
    def get_confidence_score(self, X: pd.DataFrame) -> np.ndarray:
        """
        Get confidence score (inverse of interval width).
        Higher score = more confident prediction.
        """
        pred_10, pred_90 = self.predict(X)
        interval_width = pred_90 - pred_10
        # Normalize to 0-100 scale (inverse)
        max_width = np.percentile(interval_width, 95)
        confidence = 100 * (1 - np.clip(interval_width / max_width, 0, 1))
        return confidence


class EnsembleModel:
    """
    Combined ensemble of all three models.
    """
    
    def __init__(self):
        self.price_regressor = PriceRegressor(model_type='lightgbm')
        self.trend_classifier = TrendClassifier()
        self.quantile_regressor = QuantileRegressor()
        
    def train(self, 
              df_train: pd.DataFrame,
              df_val: Optional[pd.DataFrame] = None) -> Dict:
        """
        Train all models in the ensemble.
        
        Args:
            df_train: Training dataframe with features and targets
            df_val: Validation dataframe
            
        Returns:
            Dictionary with all training metrics
        """
        from flight_features import get_feature_columns
        
        feature_cols = get_feature_columns()
        
        all_features = (
            feature_cols['temporal'] +
            feature_cols['time_of_day'] +
            feature_cols['lag'] +
            feature_cols['rolling'] +
            feature_cols['route'] +
            feature_cols['flight']
        )
        all_features = [f for f in all_features if f in df_train.columns]        
        df_train_clean = df_train[all_features + ['price', 'trend_label']].dropna()
        
        X_train = df_train_clean[all_features]
        y_train_price = df_train_clean['price']
        y_train_trend = df_train_clean['trend_label']
        
        if df_val is not None:
            df_val_clean = df_val[all_features + ['price', 'trend_label']].dropna()
            X_val = df_val_clean[all_features]
            y_val_price = df_val_clean['price']
            y_val_trend = df_val_clean['trend_label']
        else:
            X_val = None
            y_val_price = None
            y_val_trend = None
        
        print("\nTraining Ensemble Models...")
        print("=" * 60)
        
        # STEP 0: Calculate Naive Baseline
        if df_val is not None:
            baseline_metrics = calculate_naive_baseline(
                df_val, 
                train_idx=[], 
                val_idx=df_val.index.tolist()
            )
        else:
            baseline_metrics = {'baseline_rmse': None}
        
        # Train Model A: Price Regressor
        print("\nTraining Price Regressor...")
        metrics_price = self.price_regressor.train(X_train, y_train_price, X_val, y_val_price)
        print(f"   Train RMSE: {metrics_price['train_rmse']:.2f}")
        print(f"   Train MAE: {metrics_price['train_mae']:.2f}")
        print(f"   Train RÂ²: {metrics_price['train_r2']:.4f}")
        if 'val_rmse' in metrics_price:
            print(f"   Val RMSE: {metrics_price['val_rmse']:.2f}")
            print(f"   Val MAE: {metrics_price['val_mae']:.2f}")
            print(f"   Val RÂ²: {metrics_price['val_r2']:.4f}")
        
        # Train Model B: Trend Classifier
        print("\nTraining Trend Classifier...")
        metrics_trend = self.trend_classifier.train(X_train, y_train_trend, X_val, y_val_trend)
        print(f"   Train Accuracy: {metrics_trend['train_accuracy']:.4f}")
        if 'val_accuracy' in metrics_trend:
            print(f"   Val Accuracy: {metrics_trend['val_accuracy']:.4f}")
        
        # Train Model C: Quantile Regressor
        print("\nTraining Quantile Regressor...")
        metrics_quantile = self.quantile_regressor.train(X_train, y_train_price, X_val, y_val_price)
        print(f"   Train Interval Width: {metrics_quantile['train_interval_width']:.2f}")
        if 'val_interval_width' in metrics_quantile:
            print(f"   Val Interval Width: {metrics_quantile['val_interval_width']:.2f}")
        
        print("\nEnsemble training complete!")
        print("=" * 60)
        
        return {
            'price_regressor': metrics_price,
            'trend_classifier': metrics_trend,
            'quantile_regressor': metrics_quantile,
            'baseline': baseline_metrics,
            'feature_importance': self.price_regressor.get_feature_importance().head(20).to_dict('records')
        }
    
    def save(self, filepath: str):
        """Save ensemble to disk."""
        with open(filepath, 'wb') as f:
            pickle.dump(self, f)
        print(f"\nEnsemble saved to {filepath}")
    
    @staticmethod
    def load(filepath: str) -> 'EnsembleModel':
        """Load ensemble from disk."""
        with open(filepath, 'rb') as f:
            return pickle.load(f)


if __name__ == "__main__":
    print("Ensemble model module loaded successfully!")