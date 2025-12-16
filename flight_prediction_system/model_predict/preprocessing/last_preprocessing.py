import pandas as pd
import numpy as np
from dateutil import parser
import math

def parse_date_standard(date_str):
    """
    Chuẩn hóa ngày tháng về dạng YYYY-MM-DD
    Hỗ trợ cả format ISO 8601 và dd/mm/yyyy
    """
    if pd.isna(date_str):
        return pd.NaT
    date_str = str(date_str).strip()
    try:
        # dayfirst=True để ưu tiên hiểu 01/08/2025 là ngày 1 tháng 8
        dt = parser.parse(date_str, dayfirst=True)
        return dt.strftime('%Y-%m-%d')
    except:
        return pd.NaT

def recalculate_price_logic(row):
    """
    Hàm tính toán lại giá vé cho 1 người lớn dựa trên công thức hãng bay.
    Đơn vị tính toán: VNĐ (các số liệu 20, 100... được nhân 1000)
    """
    # Lấy dữ liệu từ hàng
    try:
        flight_num = str(row['flight_number']).strip().upper()
        # Giá data gốc
        data_price = float(row['price'])
        # Số lượng khách (đã được fill 1.0/0.0 từ bước trước, nhưng safety check)
        n_a = float(row['adult']) if not pd.isna(row['adult']) else 1.0
        n_c = float(row['child']) if not pd.isna(row['child']) else 0.0
        n_i = float(row['infant']) if not pd.isna(row['infant']) else 0.0
    except:
        return row['price']

    # -----------------------------------------------------------
    # BƯỚC 1: Tính Tổng giá thực (Total Real)
    # Công thức: Real = Data_Price - (Adult + Child + Infant) * 50,000
    # -----------------------------------------------------------
    discount_per_pax = 50000 
    total_real = data_price - (n_a + n_c + n_i) * discount_per_pax

    # Khởi tạo biến kết quả
    base_fare_adult = 0
    tax_adult_final = 0
    
    # -----------------------------------------------------------
    # BƯỚC 2: Giải ngược tìm Base Fare (Giá gốc chưa thuế) theo hãng
    # -----------------------------------------------------------
    
    # === HÃNG VIETJET (VJ) ===
    if flight_num.startswith('VJ'):
        # Phí Adult = An ninh(20k) + Quốc nội(100k) + Quản trị(464k) = 584k
        tax_adult_calc = 20000 + 100000 + 464000 # = 584,000
        # Phí Child = Adult - 60k
        tax_child_calc = tax_adult_calc - 60000  # = 524,000
        # Vé em bé cố định: 100k
        p_baby_fixed = 100000
        
        # Phương trình:
        # TotalReal = (100k*Ni + Pa*Nc + Pa*Na)*1.08 + (TaxA * Na) + (TaxC * Nc)
        # => TotalReal - 108k*Ni - TaxA*Na - TaxC*Nc = Pa * 1.08 * (Nc + Na)
        
        numerator = total_real - (p_baby_fixed * 1.08 * n_i) - (tax_adult_calc * n_a) - (tax_child_calc * n_c)
        denominator = 1.08 * (n_c + n_a)
        
        if denominator != 0:
            base_fare_adult = numerator / denominator
            tax_adult_final = tax_adult_calc

    # === HÃNG VIETNAM AIRLINES (VN) ===
    elif flight_num.startswith('VN'):
        # Phí Adult = An ninh(20k) + Quốc nội(100k) + Quản trị(450k) = 570k
        tax_adult_calc = 20000 + 100000 + 450000
        # Phí Child = Adult - 60k
        tax_child_calc = tax_adult_calc - 60000
        
        # Vé: Child=90% Adult, Baby=10% Adult
        # Phương trình:
        # TotalReal = (0.1Pa*Ni + 0.9Pa*Nc + Pa*Na)*1.08 + TaxA*Na + TaxC*Nc
        
        numerator = total_real - (tax_adult_calc * n_a) - (tax_child_calc * n_c)
        denominator = 1.08 * (0.1 * n_i + 0.9 * n_c + n_a)
        
        if denominator != 0:
            base_fare_adult = numerator / denominator
            tax_adult_final = tax_adult_calc

    # === HÃNG VIETRAVEL (VU) ===
    elif flight_num.startswith('VU'):
        # Phí Quản trị = 480 * 1.08 = 518.4k
        admin_fee = 480000 * 1.08 
        # Phí Adult = 20k + 100k + 518.4k = 638.4k
        tax_adult_calc = 20000 + 100000 + admin_fee
        # Phí Child = Adult - 60k
        tax_child_calc = tax_adult_calc - 60000
        # Vé em bé cố định: 150k
        p_baby_fixed = 150000
        
        # Vé Child = Vé Adult
        # Phương trình:
        # TotalReal = (150k*Ni + Pa*Nc + Pa*Na)*1.08 + TaxA*Na + TaxC*Nc
        
        numerator = total_real - (p_baby_fixed * 1.08 * n_i) - (tax_adult_calc * n_a) - (tax_child_calc * n_c)
        denominator = 1.08 * (n_c + n_a)
        
        if denominator != 0:
            base_fare_adult = numerator / denominator
            tax_adult_final = tax_adult_calc

    # === HÃNG BAMBOO (QH) ===
    elif flight_num.startswith('QH'):
        # Phí Quản trị = 440 * 1.08 = 475.2k
        admin_fee = 440000 * 1.08
        # Phí Adult = 20k + 100k + 475.2k = 595.2k
        tax_adult_calc = 20000 + 100000 + admin_fee
        # Phí Child = Adult - 60k
        tax_child_calc = tax_adult_calc - 60000
        # Vé em bé cố định: 100k
        p_baby_fixed = 100000
        
        # Vé Child = 75% Adult
        # Phương trình:
        # TotalReal = (100k*Ni + 0.75Pa*Nc + Pa*Na)*1.08 + TaxA*Na + TaxC*Nc
        
        numerator = total_real - (p_baby_fixed * 1.08 * n_i) - (tax_adult_calc * n_a) - (tax_child_calc * n_c)
        denominator = 1.08 * (0.75 * n_c + n_a)
        
        if denominator != 0:
            base_fare_adult = numerator / denominator
            tax_adult_final = tax_adult_calc
    
    else:
        # Nếu không thuộc hãng nào đã định nghĩa, giữ nguyên giá data
        return data_price

    # -----------------------------------------------------------
    # BƯỚC 3: Tính giá cuối cùng cho 1 người lớn
    # Formula: BaseFare * 1.08 + Tax_Adult
    # -----------------------------------------------------------
    if base_fare_adult <= 0:
        # Trường hợp tính ra âm (do dữ liệu đầu vào có thể không khớp logic), trả về giá gốc chia số người lớn
        # hoặc giữ nguyên để debug. Ở đây mình giữ nguyên giá gốc.
        return data_price

    final_single_price = (base_fare_adult * 1.08) + tax_adult_final
    
    # Làm tròn về số nguyên
    return int(round(final_single_price))

def process_final_step(input_file, output_file):
    print(f"Đang đọc file {input_file}...")
    try:
        df = pd.read_csv(input_file)
    except FileNotFoundError:
        print("Lỗi: Không tìm thấy file.")
        return

    # 1. Chuẩn hóa ngày tháng
    print("Đang chuẩn hóa cột flight_date...")
    df['flight_date'] = df['flight_date'].apply(parse_date_standard)

    # 2. Xử lý giá (Chỉ từ dòng 102182 trở đi)
    start_row_index = 102182
    print(f"Đang tính toán lại giá từ dòng index {start_row_index}...")
    
    if len(df) > start_row_index:
        # Tách phần cần xử lý để không ảnh hưởng các dòng phía trên
        # Sử dụng .loc với điều kiện index >= start_row_index
        mask_process = df.index >= start_row_index
        
        # Áp dụng hàm tính giá
        df.loc[mask_process, 'price'] = df.loc[mask_process].apply(recalculate_price_logic, axis=1)
        
        print(f"-> Đã xử lý lại giá cho {mask_process.sum()} dòng.")
    else:
        print(f"Cảnh báo: File chỉ có {len(df)} dòng, không chạm tới dòng {start_row_index}.")

    # 3. Xóa cột thừa
    print("Đang xóa các cột adult, child, infant...")
    df.drop(columns=['adult', 'child', 'infant'], inplace=True, errors='ignore')

    # Xuất file
    df.to_csv(output_file, index=False)
    print("-" * 50)
    print(f"XỬ LÝ HOÀN TẤT. File kết quả: {output_file}")
    print("-" * 50)

if __name__ == "__main__":
    # Đảm bảo cài đặt: pip install python-dateutil pandas
    process_final_step('./preprocessing/filter_class_flight_price_history.csv', 'final_flight_price_history.csv')