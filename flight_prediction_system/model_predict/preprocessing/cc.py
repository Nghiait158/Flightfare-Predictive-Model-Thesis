import pandas as pd
from datetime import datetime

# ======================
# CONFIG
# ======================
INPUT_CSV = "./data/all_airlines_merged.csv"
OUTPUT_CSV = "./data/all_airlines_fixed.csv"

# ======================
# LOAD DATA
# ======================
df = pd.read_csv(INPUT_CSV)
df = df.rename(columns={
    "create_at": "create_at",
    "flight_number": "flight_number",
    "type_of_plane": "type_of_plane",
    "departure_airport": "departure_airport",
    "arrival_airport": "arrival_airport",
    "flight_date": "flight_date",
    "departure_time": "departure_time",
    "arrival_time": "arrival_time",
    "classes": "classes",
    "price": "price",
    "days_to_flight": "days_to_flight"
})

df["crawl_date"] = pd.to_datetime(df["create_at"]).dt.date

df["flight_date"] = pd.to_datetime(df["flight_date"], format="%Y-%m-%d", errors="coerce")
def fix_row(row):
    if row["days_to_flight"] < 0 and pd.notna(row["flight_date"]):
        year = row["flight_date"].year
        month = row["flight_date"].month
        day = row["flight_date"].day

        # Đổi vị trí day <-> month
        try:
            new_flight_date = datetime(year, day, month).date()
        except ValueError:
            # Nếu ngày không hợp lệ (ví dụ 31-02) thì bỏ qua
            return row

        # Tính lại days_to_flight
        new_days = (new_flight_date - row["crawl_date"]).days

        row["flight_date"] = new_flight_date
        row["days_to_flight"] = new_days

    return row

df = df.apply(fix_row, axis=1)

# ======================
# CLEAN & SAVE
# ======================
df["flight_date"] = df["flight_date"].astype(str)
df.drop(columns=["crawl_date"], inplace=True)

df.to_csv(OUTPUT_CSV, index=False)

print("✅ DONE: File đã được sửa và lưu tại:", OUTPUT_CSV)