import pandas as pd
import numpy as np
import pickle
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split, cross_val_score, KFold, GridSearchCV, learning_curve
from sklearn.preprocessing import LabelEncoder, StandardScaler, RobustScaler
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.tree import DecisionTreeRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import warnings
warnings.filterwarnings('ignore')

plt.style.use('seaborn-v0_8')
sns.set_palette("husl")

class FlightPricePredictor:
    def __init__(self, csv_file=None):
        self.csv_file = csv_file
        self.df = None
        self.X = None
        self.y = None
        self.scaler = RobustScaler()
        self.label_encoders = {}
        self.best_model = None
        self.model_type = None
        self.feature_columns = None
        self.results = {}
        self.price_stats = None
        self.route_popularity_stats = {}
        self.airline_popularity_stats = {}
        
    def load_and_preprocess_data(self):
        if self.csv_file is None:
            raise ValueError("file CSV đâu ?!")
            
        # Read CSV with correct column names (skip the incorrect header)
        column_names = ['create_at', 'flight_number', 'type_of_plane', 'departure_airport', 
                       'arrival_airport', 'flight_date', 'departure_time', 'arrival_time', 'classes', 'price']
        
        self.df = pd.read_csv(self.csv_file, names=column_names, skiprows=1)
        print(f"{self.df.shape[0]} data rows")
        
        initial_rows = len(self.df)
        self.df = self.df.drop_duplicates()
        print(f"{initial_rows - len(self.df)} duplicate rows")
        
        print("Missing data:")
        print(self.df.isnull().sum())

        print("\nPrice distribution:")
        print(self.df['price'].describe())

        Q1 = self.df['price'].quantile(0.25)
        Q3 = self.df['price'].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR

        print(f"Eliminate the price which is < {lower_bound:,.0f} VNĐ or > {upper_bound:,.0f} VNĐ")
        before_outlier_removal = len(self.df)
        self.df = self.df[(self.df['price'] >= lower_bound) & (self.df['price'] <= upper_bound)]
        print(f"Eliminated {before_outlier_removal - len(self.df)} outliers")

        self.price_stats = {
            'min': self.df['price'].min(),
            'max': self.df['price'].max(),
            'mean': self.df['price'].mean(),
            'std': self.df['price'].std(),
            'Q1': Q1,
            'Q3': Q3
        }
        
        self.df['create_at'] = pd.to_datetime(self.df['create_at'], errors='coerce')
        self.df = self.df.dropna(subset=['create_at'])
        
        def parse_flight_date(date_str):
            if isinstance(date_str, str) and 'T' in date_str:
                try:
                    return pd.to_datetime(date_str)
                except:
                    return pd.NaT
            else:
                return pd.NaT
        
        self.df['flight_date'] = self.df['flight_date'].apply(parse_flight_date)
        self.df = self.df.dropna(subset=['flight_date'])
        
        self.df['type_of_plane'] = self.df['type_of_plane'].str.strip()
        self.df = self.df[self.df['type_of_plane'] != '']
        self.df = self.df.dropna(subset=['type_of_plane'])

        print("Price distribution after processing:")
        print(self.df['price'].describe())
        
    def feature_engineering(self):
        self.df['create_hour'] = self.df['create_at'].dt.hour
        self.df['create_day_of_week'] = self.df['create_at'].dt.dayofweek
        self.df['create_month'] = self.df['create_at'].dt.month
        self.df['flight_month'] = self.df['flight_date'].dt.month
        self.df['flight_day_of_week'] = self.df['flight_date'].dt.dayofweek
        self.df['days_in_advance'] = (self.df['flight_date'] - self.df['create_at']).dt.days
        self.df['is_weekend_booking'] = (self.df['create_day_of_week'] >= 5).astype(int)
        self.df['is_weekend_flight'] = (self.df['flight_day_of_week'] >= 5).astype(int)

        def categorize_advance_booking(days):
            if days < 7:
                return 0  
            elif days < 30:
                return 1  
            elif days < 90:
                return 2  
            else:
                return 3 
            
        self.df['booking_category'] = self.df['days_in_advance'].apply(categorize_advance_booking)

        def time_to_minutes(time_str):
            try:
                hour, minute = map(int, time_str.split(':'))
                return hour * 60 + minute
            except:
                return np.nan
        
        self.df['departure_minutes'] = self.df['departure_time'].apply(time_to_minutes)
        self.df['arrival_minutes'] = self.df['arrival_time'].apply(time_to_minutes)
        self.df['flight_duration'] = self.df['arrival_minutes'] - self.df['departure_minutes']
        self.df.loc[self.df['flight_duration'] < 0, 'flight_duration'] += 24 * 60

        def categorize_time_of_day(minutes):
            hour = minutes // 60
            if 6 <= hour < 12:
                return 0 
            elif 12 <= hour < 18:
                return 1  
            elif 18 <= hour < 22:
                return 2  
            else:
                return 3  
            
        self.df['departure_time_category'] = self.df['departure_minutes'].apply(categorize_time_of_day)

        route_counts = self.df.groupby(['departure_airport', 'arrival_airport']).size()
        self.df['route_popularity'] = self.df.apply(
            lambda row: route_counts.get((row['departure_airport'], row['arrival_airport']), 0), 
            axis=1
        )
        self.route_popularity_stats = {
            'mean': self.df['route_popularity'].mean(),
            'std': self.df['route_popularity'].std()
        }
        
        self.df['airline'] = self.df['flight_number'].str[:2]
        airline_counts = self.df['airline'].value_counts()
        self.df['airline_popularity'] = self.df['airline'].map(airline_counts).fillna(0)

        self.airline_popularity_stats = {
            'mean': self.df['airline_popularity'].mean(),
            'std': self.df['airline_popularity'].std()
        }

        categorical_cols = ['flight_number', 'departure_airport', 'arrival_airport', 'classes', 'type_of_plane', 'airline']
        
        for col in categorical_cols:
            if col in self.df.columns:
                le = LabelEncoder()
                self.df[f'{col}_encoded'] = le.fit_transform(self.df[col].astype(str))
                self.label_encoders[col] = le

        self.feature_columns = [
            'flight_number_encoded', 'departure_airport_encoded', 
            'arrival_airport_encoded', 'classes_encoded', 'type_of_plane_encoded',
            'airline_encoded',
            'create_hour', 'create_day_of_week', 'create_month',
            'flight_month', 'flight_day_of_week',
            'days_in_advance', 'departure_minutes', 'flight_duration',
            'is_weekend_booking', 'is_weekend_flight',
            'booking_category', 'departure_time_category',
            'route_popularity', 'airline_popularity'
        ]
        
        available_features = [col for col in self.feature_columns if col in self.df.columns]
        self.feature_columns = available_features
        self.X = self.df[available_features].copy()
        self.y = self.df['price'].copy()
        
        mask = ~(self.X.isnull().any(axis=1) | self.y.isnull())
        self.X = self.X[mask]
        self.y = self.y[mask]

        print(f"Created {len(available_features)} features")
        print(f"Size of final data: {self.X.shape}")
        print(f"Features: {available_features}")
        
    def train_and_evaluate_models(self):
        X_train, X_test, y_train, y_test = train_test_split(
            self.X, self.y, test_size=0.2, random_state=42
        )

        models = {
            'Random Forest': RandomForestRegressor(
                n_estimators=200,
                max_depth=20,
                min_samples_split=5,
                min_samples_leaf=2,
                max_features='sqrt',
                random_state=42,
                n_jobs=-1
            ),
            'Gradient Boosting': GradientBoostingRegressor(
                n_estimators=200,
                learning_rate=0.1,
                max_depth=8,
                min_samples_split=5,
                min_samples_leaf=2,
                subsample=0.9,
                random_state=42
            ),
            'Decision Tree': DecisionTreeRegressor(
                max_depth=20,
                min_samples_split=5,
                min_samples_leaf=2,
                random_state=42
            )
        }
        
        kfold = KFold(n_splits=5, shuffle=True, random_state=42)
        
        for name, model in models.items():
            print(f"\nEvaluate {name}...")
            
            cv_scores = cross_val_score(model, X_train, y_train, 
                                      cv=kfold, scoring='neg_mean_absolute_error')
            
            model.fit(X_train, y_train)
            
            y_pred_train = model.predict(X_train)
            y_pred_test = model.predict(X_test)
            
            train_mae = mean_absolute_error(y_train, y_pred_train)
            test_mae = mean_absolute_error(y_test, y_pred_test)
            train_rmse = np.sqrt(mean_squared_error(y_train, y_pred_train))
            test_rmse = np.sqrt(mean_squared_error(y_test, y_pred_test))
            train_r2 = r2_score(y_train, y_pred_train)
            test_r2 = r2_score(y_test, y_pred_test)

            overfitting_check = train_mae / test_mae if test_mae > 0 else float('inf')
            
            self.results[name] = {
                'model': model,
                'cv_mae_mean': -cv_scores.mean(),
                'cv_mae_std': cv_scores.std(),
                'train_mae': train_mae,
                'test_mae': test_mae,
                'train_rmse': train_rmse,
                'test_rmse': test_rmse,
                'train_r2': train_r2,
                'test_r2': test_r2,
                'overfitting_ratio': overfitting_check
            }
            
            print(f"   CV MAE: {-cv_scores.mean():,.0f} ± {cv_scores.std():,.0f}")
            print(f"   Train MAE: {train_mae:,.0f}")
            print(f"   Test MAE: {test_mae:,.0f}")
            print(f"   Test R²: {test_r2:.4f}")
            print(f"   Overfitting Check: {overfitting_check:.2f}")
            
        best_model_name = min(self.results.keys(), 
                             key=lambda k: self.results[k]['cv_mae_mean'])
        
        self.best_model = self.results[best_model_name]['model']
        self.model_type = best_model_name
        
        print(f"\n Best model: {best_model_name}")
        print(f"   CV MAE: {self.results[best_model_name]['cv_mae_mean']:.0f}")
        print(f"   Test MAE: {self.results[best_model_name]['test_mae']:.0f}")
        print(f"   Test R²: {self.results[best_model_name]['test_r2']:.4f}")

        if hasattr(self.best_model, 'feature_importances_'):
            feature_importance = pd.DataFrame({
                'feature': self.feature_columns,
                'importance': self.best_model.feature_importances_
            }).sort_values('importance', ascending=False)
            
            print(f"\nTop important features :  ({best_model_name}):")
            for i, row in feature_importance.head(10).iterrows():
                print(f"   {row['feature']}: {row['importance']:.4f}")
        
    def plot_learning_curves(self):   
        plt.figure(figsize=(12, 8))
        
        for i, (name, result) in enumerate(self.results.items()):
            plt.subplot(2, 2, i+1)
            train_sizes, train_scores, val_scores = learning_curve(
                result['model'], self.X, self.y, cv=5, 
                train_sizes=np.linspace(0.1, 1.0, 10),
                scoring='neg_mean_absolute_error', n_jobs=-1
            )
            
            train_mean = -train_scores.mean(axis=1)
            train_std = train_scores.std(axis=1)
            val_mean = -val_scores.mean(axis=1)
            val_std = val_scores.std(axis=1)
            
            plt.plot(train_sizes, train_mean, 'o-', color='blue', label='Training MAE')
            plt.fill_between(train_sizes, train_mean - train_std, train_mean + train_std, alpha=0.1, color='blue')
            
            plt.plot(train_sizes, val_mean, 'o-', color='red', label='Validation MAE')
            plt.fill_between(train_sizes, val_mean - val_std, val_mean + val_std, alpha=0.1, color='red')
            
            plt.title(f'{name} Learning Curve')
            plt.xlabel('Training Set Size')
            plt.ylabel('MAE')
            plt.legend()
            plt.grid(True, alpha=0.3)
        
        plt.tight_layout()
        plt.show()
        
    def save_model(self, filename='flight_price_model.pkl'):
        model_data = {
            'model': self.best_model,
            'model_type': self.model_type,
            'feature_columns': self.feature_columns,
            'label_encoders': self.label_encoders,
            'scaler': self.scaler,
            'price_stats': self.price_stats,
            'route_popularity_stats': self.route_popularity_stats,
            'airline_popularity_stats': self.airline_popularity_stats
        }
        
        with open(filename, 'wb') as f:
            pickle.dump(model_data, f)
        
        print(f"Saving model into {filename}")
        
    def load_model(self, filename='flight_price_model.pkl'):
        with open(filename, 'rb') as f:
            model_data = pickle.load(f)
        
        self.best_model = model_data['model']
        self.model_type = model_data['model_type']
        self.feature_columns = model_data['feature_columns']
        self.label_encoders = model_data['label_encoders']
        self.scaler = model_data['scaler']
        self.price_stats = model_data.get('price_stats', {})
        self.route_popularity_stats = model_data.get('route_popularity_stats', {'mean': 100, 'std': 50})
        self.airline_popularity_stats = model_data.get('airline_popularity_stats', {'mean': 50, 'std': 25})
        
        print(f"Loading model from {filename}")
        
    def predict_single_flight(self, flight_data):
        if self.best_model is None:
            raise ValueError("? model đâu ??")
        
        print(f"Input data: {flight_data}")
        
        df_input = pd.DataFrame([flight_data])
        df_input['create_at'] = pd.to_datetime(df_input['create_at'])
        df_input['flight_date'] = pd.to_datetime(df_input['flight_date'])
        
        df_input['create_hour'] = df_input['create_at'].dt.hour
        df_input['create_day_of_week'] = df_input['create_at'].dt.dayofweek
        df_input['create_month'] = df_input['create_at'].dt.month
        df_input['flight_month'] = df_input['flight_date'].dt.month
        df_input['flight_day_of_week'] = df_input['flight_date'].dt.dayofweek
        df_input['days_in_advance'] = (df_input['flight_date'] - df_input['create_at']).dt.days
        df_input['is_weekend_booking'] = (df_input['create_day_of_week'] >= 5).astype(int)
        df_input['is_weekend_flight'] = (df_input['flight_day_of_week'] >= 5).astype(int)
        
        def categorize_advance_booking(days):
            if days < 7:
                return 0
            elif days < 30:
                return 1
            elif days < 90:
                return 2
            else:
                return 3
        
        df_input['booking_category'] = df_input['days_in_advance'].apply(categorize_advance_booking)

        def time_to_minutes(time_str):
            try:
                hour, minute = map(int, time_str.split(':'))
                return hour * 60 + minute
            except:
                return 0
        
        df_input['departure_minutes'] = df_input['departure_time'].apply(time_to_minutes)
        df_input['arrival_minutes'] = df_input['arrival_time'].apply(time_to_minutes)
        df_input['flight_duration'] = df_input['arrival_minutes'] - df_input['departure_minutes']
        
        if df_input['flight_duration'].iloc[0] < 0:
            df_input['flight_duration'] += 24 * 60

        def categorize_time_of_day(minutes):
            hour = minutes // 60
            if 6 <= hour < 12:
                return 0
            elif 12 <= hour < 18:
                return 1
            elif 18 <= hour < 22:
                return 2
            else:
                return 3
        
        df_input['departure_time_category'] = df_input['departure_minutes'].apply(categorize_time_of_day)
        df_input['route_popularity'] = self.route_popularity_stats['mean']
        df_input['airline'] = df_input['flight_number'].str[:2]
        df_input['airline_popularity'] = self.airline_popularity_stats['mean']

        categorical_cols = ['flight_number', 'departure_airport', 'arrival_airport', 'classes', 'type_of_plane', 'airline']
        
        for col in categorical_cols:
            if col in df_input.columns and col in self.label_encoders:
                le = self.label_encoders[col]
                try:
                    df_input[f'{col}_encoded'] = le.transform(df_input[col].astype(str))
                except ValueError:
                    if hasattr(le, 'classes_') and len(le.classes_) > 0:
                        df_input[f'{col}_encoded'] = 0  
                        print(f"Warning: '{df_input[col].iloc[0]}' not found in training data for {col}, using default encoding")
                    else:
                        df_input[f'{col}_encoded'] = 0

        print("Create feature:")
        for col in self.feature_columns:
            if col in df_input.columns:
                print(f"  {col}: {df_input[col].iloc[0]}")
            else:
                print(f"  {col}: MISSING!")

        X_input = df_input[self.feature_columns].fillna(0)
        print(f"Input shape: {X_input.shape}")
        print(f"Input values: {X_input.iloc[0].values}")
        
        prediction = self.best_model.predict(X_input)[0]
        
        print(f"Raw prediction: {prediction}")
        
        if self.price_stats:
            min_price = max(self.price_stats['min'], 100000)  
            max_price = min(self.price_stats['max'], 50000000)  
            prediction = np.clip(prediction, min_price, max_price)
            print(f"Clipped prediction: {prediction}")
        
        return prediction
    
    def demo_predictions(self):
        print("=" * 50)
        
        flight1 = {
            'flight_number': 'VJ1198',
            'departure_airport': 'SGN',
            'arrival_airport': 'HAN',
            'departure_time': '08:00',
            'arrival_time': '10:15',
            'classes': 'Eco',
            'type_of_plane': 'Airbus A321',
            'create_at': '2024-01-15 10:30:00',
            'flight_date': '2024-01-20T08:00:00'
        }
        
        flight2 = {
            'flight_number': 'VJ124',
            'departure_airport': 'SGN',
            'arrival_airport': 'HAN',
            'departure_time': '14:30',
            'arrival_time': '16:45',
            'classes': 'Eco',
            'type_of_plane': 'Airbus A320',
            'create_at': '2024-01-01 09:00:00',
            'flight_date': '2024-02-15T14:30:00'
        }
        
        flight3 = {
            'flight_number': 'VJ196',
            'departure_airport': 'SGN',
            'arrival_airport': 'HAN',
            'departure_time': '19:00',
            'arrival_time': '21:15',
            'classes': 'Business',
            'type_of_plane': 'Airbus A320',
            'create_at': '2024-01-18 15:20:00',
            'flight_date': '2024-01-25T19:00:00'
        }
        
        demo_flights = [
            ("Economy SGN-HAN", flight1),
            ("book vé sớm", flight2),
            ("Business class", flight3)
        ]

        for name, flight in demo_flights:
                price = self.predict_single_flight(flight)
                advance_days = (pd.to_datetime(flight['flight_date']) - 
                              pd.to_datetime(flight['create_at'])).days
                print(f"\n {name}:")
                print(f"   Route: {flight['departure_airport']} → {flight['arrival_airport']}")
                print(f"   Time: {flight['departure_time']} - {flight['arrival_time']}")
                print(f"   Class: {flight['classes']}")
                print(f"   Aircraft: {flight['type_of_plane']}")
                print(f"   Advance booking: {advance_days} ngày")
                print(f"   Predicted Price: {price:,.0f} VNĐ")
            

    def analyze_data_distribution(self):
        if self.df is None:
            print("Data where?!")
            return
        print("=" * 50)
        print(f"Total records: {len(self.df):,}")
        print(f"Price range: {self.df['price'].min():,.0f} - {self.df['price'].max():,.0f} VNĐ")
        print(f"Mean price: {self.df['price'].mean():,.0f} VNĐ")
        print(f"Median price: {self.df['price'].median():,.0f} VNĐ")
        # print("\nPhân phối theo hạng vé:")
        # print(self.df['classes'].value_counts())
        # print("\nPhân phối theo sân bay:")
        # print("Departure airports:")
        # print(self.df['departure_airport'].value_counts().head())
        # print("Arrival airports:")
        # print(self.df['arrival_airport'].value_counts().head())
        # print("\nPhân phối theo loại máy bay:")
        # print(self.df['type_of_plane'].value_counts())
        # print("\nGiá trung bình theo hạng vé:")
        # price_by_class = self.df.groupby('classes')['price'].agg(['mean', 'count'])
        # print(price_by_class)
    
    def run_complete_pipeline(self):
        print("=" * 60)
        
        self.load_and_preprocess_data()
        self.analyze_data_distribution()
        self.feature_engineering()
        self.train_and_evaluate_models()
        # self.plot_learning_curves()
        self.save_model()
        # self.demo_predictions()
        
        print(f"Best model: {self.model_type}")
        print("Model have been saved into 'flight_price_model.pkl'")
        
        return self.best_model, self.results

def test_saved_model():
    print("=" * 30)
    
    predictor = FlightPricePredictor()
    predictor.load_model('flight_price_model.pkl')
    
    test_flight = {
        'flight_number': 'VJ1126',
        'departure_airport': 'SGN',
        'arrival_airport': 'HAN',
        'departure_time': '08:10',
        'arrival_time': '10:20',
        'classes': 'Eco',
        'type_of_plane': 'Airbus A320',
        'create_at': '2025-06-23 22:13:00',
        'flight_date': '2025-08-15T17:00:00.000'
    }
    
    try:
        price = predictor.predict_single_flight(test_flight)
        print(f"Test flight:")
        print(f"   Route: {test_flight['departure_airport']} → {test_flight['arrival_airport']}")
        print(f"   Predicted Price: {price:,.0f} VNĐ")
    except Exception as e:
        print(f"Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    predictor = FlightPricePredictor('flightfare-predictiveScraping-model/result/flight_price_history.csv')
    best_model, results = predictor.run_complete_pipeline()
    test_saved_model()