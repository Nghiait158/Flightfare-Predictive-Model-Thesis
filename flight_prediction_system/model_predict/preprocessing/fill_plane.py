import pandas as pd
import numpy as np

def process_flight_data(input_file, output_file):
    print(f"Đang đọc file {input_file}...")
    try:
        df = pd.read_csv(input_file)
    except FileNotFoundError:
        print(f"Lỗi: Không tìm thấy file '{input_file}'.")
        return

    initial_rows = len(df)
    
    # ---------------------------------------------------------
    # BƯỚC 1: Xử lý cột flight_number bị gộp (VD: VN7106,VN7150)
    # ---------------------------------------------------------
    df['flight_number'] = df['flight_number'].astype(str)
    
    combined_mask = df['flight_number'].str.contains(',')
    num_combined_dropped = combined_mask.sum()
    
    df_clean = df[~combined_mask].copy()
    
    # Chuẩn hóa dữ liệu: Coi các chuỗi rỗng/khoảng trắng là NaN
    df_clean['type_of_plane'] = df_clean['type_of_plane'].replace(r'^\s*$', np.nan, regex=True)
    
    missing_before = df_clean['type_of_plane'].isna().sum()

    # ---------------------------------------------------------
    # BƯỚC 2: Điền khuyết theo QUY TẮC CỐ ĐỊNH (Yêu cầu mới)
    # ---------------------------------------------------------
    # Định nghĩa các quy tắc thủ công
    manual_rules = {
        'VU750': 'Airbus A321',
        'VU770': 'Airbus A321',
        'VU780': 'Airbus A321',
        'VU774': 'Airbus A320',
        'VU778': 'Airbus A320',
        'VU794': 'Airbus A320'
    }
    
    # Thực hiện điền thủ công trước
    # Logic: Chỉ điền vào ô nào đang là NaN và có flight_number nằm trong danh sách trên
    for flight_code, plane_type in manual_rules.items():
        # Tìm các dòng có flight_code này VÀ đang thiếu type_of_plane
        mask = (df_clean['flight_number'] == flight_code) & (df_clean['type_of_plane'].isna())
        df_clean.loc[mask, 'type_of_plane'] = plane_type

    # Đếm số lượng còn thiếu sau bước điền thủ công
    missing_after_manual = df_clean['type_of_plane'].isna().sum()
    num_filled_manual = missing_before - missing_after_manual

    # ---------------------------------------------------------
    # BƯỚC 3: Điền khuyết tự động dựa trên dữ liệu còn lại
    # ---------------------------------------------------------
    # Tạo map tham chiếu từ dữ liệu hiện có (những dòng không bị null)
    reference_df = df_clean.dropna(subset=['type_of_plane'])
    plane_map = reference_df.drop_duplicates(subset=['flight_number']).set_index('flight_number')['type_of_plane'].to_dict()
    
    # Tìm các vị trí vẫn đang bị thiếu dữ liệu
    missing_indices = df_clean[df_clean['type_of_plane'].isna()].index
    
    # Điền dữ liệu
    filled_values = df_clean.loc[missing_indices, 'flight_number'].map(plane_map)
    df_clean.loc[missing_indices, 'type_of_plane'] = filled_values
    
    # Đếm số lượng còn thiếu cuối cùng
    missing_final = df_clean['type_of_plane'].isna().sum()
    num_filled_auto = missing_after_manual - missing_final
    
    # Tổng số dòng được điền (cả thủ công và tự động)
    total_filled = num_filled_manual + num_filled_auto

    # ---------------------------------------------------------
    # BƯỚC 4: Loại bỏ các hàng vẫn không xử lý được
    # ---------------------------------------------------------
    num_dropped_missing = missing_final
    df_final = df_clean.dropna(subset=['type_of_plane'])
    
    # Xuất file
    df_final.to_csv(output_file, index=False)
    
    # ---------------------------------------------------------
    # BÁO CÁO
    # ---------------------------------------------------------
    print("-" * 50)
    print("BÁO CÁO XỬ LÝ DỮ LIỆU (CẬP NHẬT)")
    print("-" * 50)
    print(f"Tổng số hàng ban đầu: {initial_rows}")
    print(f"1. Số hàng bị loại do flight_number gộp: {num_combined_dropped}")
    print(f"2. Số hàng được điền theo QUY TẮC CỐ ĐỊNH (VU...): {num_filled_manual}")
    print(f"3. Số hàng được điền TỰ ĐỘNG (tra cứu lịch sử): {num_filled_auto}")
    print(f"   => Tổng số hàng được cứu (điền khuyết thành công): {total_filled}")
    print(f"4. Số hàng bị loại do vẫn KHÔNG tìm thấy loại máy bay: {num_dropped_missing}")
    print(f"Tổng số hàng còn lại trong file sạch: {len(df_final)}")
    print("-" * 50)
    print(f"Đã lưu file kết quả tại: {output_file}")

if __name__ == "__main__":
    process_flight_data('flight_price_history-2.csv', 'cleaned_flight_price_history.csv')