import pandas as pd
import os

def merge_airline_files(output_file):
    # Danh sách file cần nối
    airline_files = [
        "./data/VJ_flight_data1.csv",
        "./data/VN_flight_data1.csv",
        "./data/QH_flight_data1.csv",
        "./data/VU_flight_data1.csv"
    ]

    dataframes = []

    print("Đang đọc các file CSV...")

    for file in airline_files:
        if os.path.exists(file):
            print(f"-> Đang đọc {file}")
            df = pd.read_csv(file)
            dataframes.append(df)
        else:
            print(f"⚠️ Cảnh báo: Không tìm thấy file {file}")

    if not dataframes:
        print("❌ Không có file nào hợp lệ để nối.")
        return

    print("Đang nối dữ liệu...")
    merged_df = pd.concat(dataframes, axis=0, ignore_index=True)

    print(f"Đang ghi file kết quả: {output_file}")
    merged_df.to_csv(output_file, index=False)

    print("-" * 50)
    print("HOÀN TẤT!")
    print(f"Tổng số dòng sau khi nối: {len(merged_df)}")
    print("-" * 50)

if __name__ == "__main__":
    output_filename = "all_airlines_merged.csv"
    merge_airline_files(output_filename)