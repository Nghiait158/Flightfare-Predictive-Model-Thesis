import pandas as pd
import numpy as np

def finalize_and_split(input_file):
    print(f"Đang đọc file '{input_file}'...")
    try:
        df = pd.read_csv(input_file)
    except FileNotFoundError:
        print(f"Lỗi: Không tìm thấy file '{input_file}'.")
        return
    print("Đang tính toán cột 'days_to_flight'...")

    # Chuyển đổi sang datetime object
    # errors='coerce': biến giá trị lỗi thành NaT để không crash chương trình
    # utc=True: chuẩn hóa múi giờ để tránh lỗi so sánh offset-naive và offset-aware
    create_at_dt = pd.to_datetime(df['create_at'], utc=True, errors='coerce')
    flight_date_dt = pd.to_datetime(df['flight_date'], utc=True, errors='coerce')

    # Chuẩn hóa về dạng ngày (bỏ giờ phút giây) để tính số ngày chính xác
    # .dt.normalize() sẽ đưa giờ về 00:00:00
    # .dt.tz_localize(None) để bỏ thông tin múi giờ, giúp trừ nhau dễ dàng
    create_at_norm = create_at_dt.dt.tz_localize(None).dt.normalize()
    flight_date_norm = flight_date_dt.dt.tz_localize(None).dt.normalize()

    # Tính khoảng cách ngày
    df['days_to_flight'] = (flight_date_norm - create_at_norm).dt.days

    # Xử lý trường hợp lỗi (nếu có NaT) thì fill bằng 0 hoặc -1 tuỳ bạn, ở đây mình để NaN hoặc 0
    # Thông thường days_to_flight nên >= 0.
    
    # ---------------------------------------------------------
    # BƯỚC 2: CHIA TÁCH THÀNH 4 FILE HÃNG BAY
    # ---------------------------------------------------------
    print("Đang chia tách file theo hãng bay...")
    
    # Đảm bảo flight_number là string và viết hoa
    df['flight_number'] = df['flight_number'].astype(str).str.upper()

    # Danh sách các tiền tố hãng bay
    airlines = ['VJ', 'VN', 'QH', 'VU']
    
    count_summary = {}

    for code in airlines:
        # Lọc các dòng có flight_number bắt đầu bằng mã hãng
        airline_df = df[df['flight_number'].str.startswith(code)]
        
        if not airline_df.empty:
            file_name = f"{code}_flight_data.csv"
            airline_df.to_csv(file_name, index=False)
            count_summary[code] = len(airline_df)
            print(f"-> Đã xuất file: {file_name} ({len(airline_df)} dòng)")
        else:
            print(f"-> Cảnh báo: Không tìm thấy dữ liệu của hãng {code}")

    print("-" * 50)
    print("HOÀN TẤT!")
    print(f"Đã thêm cột 'days_to_flight' và tách thành công các file.")
    print("Thống kê số lượng dòng:")
    for code, count in count_summary.items():
        print(f" - {code}: {count}")
    print("-" * 50)

if __name__ == "__main__":
    # Thay tên file đầu vào của bạn vào đây
    input_filename = './preprocessing/final_flight_price_history.csv' 
    finalize_and_split(input_filename)