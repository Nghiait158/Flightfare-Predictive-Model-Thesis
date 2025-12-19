# -*- coding: utf-8 -*-
"""
Price Adjuster Module
Điều chỉnh giá dự đoán dựa trên các yếu tố thực tế
"""

class PriceAdjuster:
    """
    Điều chỉnh giá dự đoán để phù hợp hơn với giá thực tế
    Có thể bật/tắt tùy theo nhu cầu
    """
    
    def __init__(self):
        self.enabled = True
        
        # Các hệ số điều chỉnh mặc định
        self.airline_multipliers = {
            'VJ': 1.0,   # Vietjet
            'VN': 1.05,  # Vietnam Airlines
            'QH': 1.02,  # Bamboo Airways
            'VU': 1.08   # Vietravel Airlines
        }
        
        # Điều chỉnh theo thời gian đặt vé
        self.booking_time_adjustments = {
            'last_minute': 1.15,  # < 7 ngày
            'normal': 1.0,         # 7-60 ngày
            'early_bird': 0.95     # > 60 ngày
        }
        
    def adjust_prediction(self, base_prediction, airline=None, flight_class=None, 
                         flight_date=None, days_to_flight=None):
        """
        Điều chỉnh giá dự đoán
        
        Args:
            base_prediction: Giá dự đoán từ model
            airline: Mã hãng bay (VJ, VN, QH, VU)
            flight_class: Hạng vé (Eco, Business, etc.)
            flight_date: Ngày bay (không sử dụng trong version này)
            days_to_flight: Số ngày đến chuyến bay
            
        Returns:
            Giá đã điều chỉnh
        """
        if not self.enabled:
            return base_prediction
            
        adjusted_price = base_prediction
        
        # Điều chỉnh theo hãng bay
        if airline and airline in self.airline_multipliers:
            adjusted_price *= self.airline_multipliers[airline]
        
        # Điều chỉnh theo thời gian đặt vé
        if days_to_flight is not None:
            if days_to_flight < 7:
                adjusted_price *= self.booking_time_adjustments['last_minute']
            elif days_to_flight > 60:
                adjusted_price *= self.booking_time_adjustments['early_bird']
        
        # Điều chỉnh theo hạng vé (Business thường đắt hơn)
        if flight_class and 'Business' in str(flight_class):
            adjusted_price *= 1.05
        
        return adjusted_price
    
    def disable(self):
        """Tắt điều chỉnh giá"""
        self.enabled = False
    
    def enable(self):
        """Bật điều chỉnh giá"""
        self.enabled = True

