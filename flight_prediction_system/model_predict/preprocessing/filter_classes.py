import pandas as pd
import numpy as np

def get_class_mapping():
    """
    Hàm trả về từ điển ánh xạ cho từng hãng bay dựa trên yêu cầu chi tiết.
    """
    # 1. VietJet Air (VJ)
    vj_map = {
        # Target: Eco
        'Eco': 'Eco', 'Economy': 'Eco', 'Economy (Y_SBoss)': 'Eco',
        'Eco (T1_ECO)': 'Eco', 'Eco (B1_ECO)': 'Eco', 'Eco (I1_ECO)': 'Eco',
        'Eco (U1_ECO)': 'Eco', 'Economy (U1_ECO)': 'Eco', 'Economy (U1_DLX)': 'Eco',
        'Economy (J1_ECO)': 'Eco', 'Economy (J1_DLX)': 'Eco', 'Eco (Z1_ECO)': 'Eco',
        'Eco (J1_ECO)': 'Eco', 'Economy (Z1_ECO)': 'Eco', 'Economy (Z1_DLX)': 'Eco',
        'Economy (W1_DLX)': 'Eco', 'Economy (W1_ECO)': 'Eco',
        # Target: Deluxe
        'Deluxe': 'Deluxe', 'Deluxe (J1_DLX)': 'Deluxe', 'Deluxe (T1_DLX)': 'Deluxe',
        'Deluxe (B1_DLX)': 'Deluxe', 'Deluxe (I1_DLX)': 'Deluxe', 'Deluxe (U1_DLX)': 'Deluxe',
        'Deluxe (Z1_DLX)': 'Deluxe', 'Deluxe (W1_DLX)': 'Deluxe',
        # Target: Skyboss
        'Skyboss': 'Skyboss', 'SkyBoss': 'Skyboss', 'SkyBoss (Y_SBoss)': 'Skyboss',
        # Target: Business
        'Business': 'Business', 'SkybossBusiness': 'Business', 
        'SkybossBusiness (C_Boss)': 'Business', 'Business (C_Boss)': 'Business'
    }

    # 2. Vietnam Airlines (VN)
    vn_map = {
        # Target: Premium Economy Flex
        'Phổ thông đặc biệt linh hoạt': 'Premium Economy Flex', 'Premium Economy Flex': 'Premium Economy Flex',
        'Premium Economy Flex (W)': 'Premium Economy Flex', '(W)': 'Premium Economy Flex',
        # Target: Business Flex
        'Thương gia linh hoạt': 'Business Flex', 'Business Flex': 'Business Flex',
        'Business Flex (J)': 'Business Flex', '(J)': 'Business Flex', 
        '(C)': 'Business Flex', 'Business Flex (C)': 'Business Flex',
        # Target: Economy Flex
        'Phổ thông linh hoạt': 'Economy Flex', 'Economy Flex': 'Economy Flex',
        'Economy Flex (B)': 'Economy Flex', 'Economy Flex (M)': 'Economy Flex', 'Economy Flex (S)': 'Economy Flex',
        # Target: Economy Classic
        'Phổ thông tiêu chuẩn': 'Economy Classic', 'Economy Classic': 'Economy Classic',
        'Economy Classic (S)': 'Economy Classic', 'Economy Classic (H)': 'Economy Classic',
        'Economy Classic (K)': 'Economy Classic', 'Economy Classic (L)': 'Economy Classic', 
        'Economy Classic (Q)': 'Economy Classic',
        # Target: Premium Economy Classic
        'Phổ thông đặc biệt tiêu chuẩn': 'Premium Economy Classic', 'Premium Economy Classic': 'Premium Economy Classic',
        'Premium Economy Classic (Z)': 'Premium Economy Classic', '(Z)': 'Premium Economy Classic',
        'Premium Economy Classic (U)': 'Premium Economy Classic', '(U)': 'Premium Economy Classic',
        # Target: Economy Lite
        'Phổ thông tiết kiệm': 'Economy Lite', 'Economy Lite': 'Economy Lite',
        'Economy Lite (Q)': 'Economy Lite', 'Economy Lite (N)': 'Economy Lite', 'Economy Lite (R)': 'Economy Lite',
        # Target: Economy Super Lite
        'Phổ thông siêu tiết kiệm': 'Economy Super Lite', 'Economy Super Lite': 'Economy Super Lite',
        # Target: Business Classic
        'Thương gia tiêu chuẩn': 'Business Classic', 'Business Classic': 'Business Classic',
        '</strong> | Plating: <strong>VN': 'Business Classic', # Xử lý trường hợp lỗi HTML trong data gốc
        'Business Classic (D)': 'Business Classic', '(D)': 'Business Classic',
        'Business Classic (I)': 'Business Classic', '(I)': 'Business Classic'
    }

    # 3. Bamboo Airways (QH)
    qh_map = {
        # Target: Economy Flex
        'EconomyFlex': 'Economy Flex', 'EconomyFlex (B)': 'Economy Flex', 'EconomyFlex (W)': 'Economy Flex',
        # Target: Economy Smart
        'EconomySmart': 'Economy Smart', 'EconomySmart (M)': 'Economy Smart', 'EconomySmart (N)': 'Economy Smart',
        'EconomySmart (L)': 'Economy Smart', 'EconomySmart (Q)': 'Economy Smart', 'EconomySmart (K)': 'Economy Smart',
        'EconomySmart (T)': 'Economy Smart', 'EconomySaverMax': 'Economy Smart', 'Hotdeal': 'Economy Smart',
        # Target: Business Flex
        'BusinessFlex': 'Business Flex', 'BusinessFlex (J)': 'Business Flex',
        # Target: Business Smart
        'BusinessSmart': 'Business Smart', 'BusinessSmart (I)': 'Business Smart', 'BusinessSmart (C)': 'Business Smart'
    }

    # 4. Vietravel Airlines (VU)
    vu_map = {
        'ECONOMY': 'ECONOMY',
        'PREMIUM': 'PREMIUM', 'PREMIUM (W)': 'PREMIUM'
    }

    return vj_map, vn_map, qh_map, vu_map

def normalize_class(row, maps):
    """
    Hàm chuẩn hóa class dựa trên flight_number
    """
    flight_num = str(row['flight_number']).strip().upper()
    original_class = str(row['classes']).strip()
    
    # Nếu original_class là nan/empty thì trả về nguyên bản
    if pd.isna(row['classes']) or original_class == '':
        return row['classes']

    vj_map, vn_map, qh_map, vu_map = maps

    # Kiểm tra mã hãng bay
    if flight_num.startswith('VJ'):
        return vj_map.get(original_class, original_class) # Trả về giá trị map, nếu không có giữ nguyên
    elif flight_num.startswith('VN'):
        return vn_map.get(original_class, original_class)
    elif flight_num.startswith('QH'):
        return qh_map.get(original_class, original_class)
    elif flight_num.startswith('VU'):
        return vu_map.get(original_class, original_class)
    
    return original_class

def process_flight_data(input_file, output_file):
    print(f"Đang đọc file {input_file}...")
    try:
        df = pd.read_csv(input_file)
    except FileNotFoundError:
        print(f"Lỗi: Không tìm thấy file '{input_file}'.")
        return

    initial_rows = len(df)

    # =========================================================
    # BƯỚC 1: Xử lý cột flight_number bị gộp
    # =========================================================
    df['flight_number'] = df['flight_number'].astype(str)
    combined_mask = df['flight_number'].str.contains(',')
    num_combined_dropped = combined_mask.sum()
    df_clean = df[~combined_mask].copy()

    # =========================================================
    # BƯỚC 2: Điền khuyết type_of_plane (Thủ công + Tự động)
    # =========================================================
    df_clean['type_of_plane'] = df_clean['type_of_plane'].replace(r'^\s*$', np.nan, regex=True)
    
    # 2.1 Điền thủ công (VU...)
    manual_rules = {
        'VU750': 'Airbus A321', 'VU770': 'Airbus A321', 'VU780': 'Airbus A321',
        'VU774': 'Airbus A320', 'VU778': 'Airbus A320', 'VU794': 'Airbus A320'
    }
    for flight_code, plane_type in manual_rules.items():
        mask = (df_clean['flight_number'] == flight_code) & (df_clean['type_of_plane'].isna())
        df_clean.loc[mask, 'type_of_plane'] = plane_type

    # 2.2 Điền tự động từ lịch sử
    reference_df = df_clean.dropna(subset=['type_of_plane'])
    plane_map = reference_df.drop_duplicates(subset=['flight_number']).set_index('flight_number')['type_of_plane'].to_dict()
    
    missing_indices = df_clean[df_clean['type_of_plane'].isna()].index
    filled_values = df_clean.loc[missing_indices, 'flight_number'].map(plane_map)
    df_clean.loc[missing_indices, 'type_of_plane'] = filled_values
    
    # 2.3 Xóa các dòng vẫn còn thiếu
    missing_final = df_clean['type_of_plane'].isna().sum()
    df_final = df_clean.dropna(subset=['type_of_plane']).copy()

    # =========================================================
    # BƯỚC 3: Ánh xạ cột CLASSES (MỚI)
    # =========================================================
    print("Đang chuẩn hóa dữ liệu cột classes...")
    mapping_dicts = get_class_mapping()
    
    # Áp dụng mapping
    df_final['classes'] = df_final.apply(lambda row: normalize_class(row, mapping_dicts), axis=1)

    # =========================================================
    # BƯỚC 4: Điền dữ liệu thiếu cho Adult, Child, Infant (MỚI)
    # =========================================================
    print("Đang điền dữ liệu hành khách thiếu...")
    fill_values = {'adult': 1.0, 'child': 0.0, 'infant': 0.0}
    df_final.fillna(value=fill_values, inplace=True)

    # Đảm bảo format số (tuỳ chọn: ép về float theo yêu cầu 1.0)
    for col in ['adult', 'child', 'infant']:
        df_final[col] = df_final[col].astype(float)

    # =========================================================
    # XUẤT FILE VÀ BÁO CÁO
    # =========================================================
    df_final.to_csv(output_file, index=False)
    
    print("-" * 60)
    print("BÁO CÁO XỬ LÝ DỮ LIỆU HOÀN TẤT")
    print("-" * 60)
    print(f"Tổng số hàng ban đầu: {initial_rows}")
    print(f"1. Số hàng loại bỏ do flight_number gộp: {num_combined_dropped}")
    print(f"2. Số hàng loại bỏ do thiếu type_of_plane: {missing_final}")
    print(f"3. Đã chuẩn hóa cột 'classes' theo hãng (VJ, VN, QH, VU)")
    print(f"4. Đã điền Default cho Adult/Child/Infant (1.0/0.0/0.0) tại các ô trống")
    print(f"Tổng số hàng còn lại: {len(df_final)}")
    print("-" * 60)
    print(f"File kết quả: {output_file}")

if __name__ == "__main__":
    process_flight_data('./preprocessing/cleaned_flight_price_history.csv', 'filter_class_flight_price_history.csv')