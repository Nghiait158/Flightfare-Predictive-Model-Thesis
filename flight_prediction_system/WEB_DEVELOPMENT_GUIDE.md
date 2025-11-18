# 🚀 Hướng dẫn phát triển Web Application

## ✅ Đã hoàn thành

### 1. Di chuyển `web-app/` vào `flight-prediction-monolith/`
✅ Folder `web-app/` đã được di chuyển vào `flight-prediction-monolith/`

### 2. Cấu trúc dự án

```
flight-prediction-monolith/
├── server.js                    # ✅ Đã update để serve React
├── package.json                 # ✅ Đã thêm scripts mới
├── src/server/                  # Backend crawler services
└── web-app/
    └── client/
        ├── src/
        │   ├── components/      # ✅ Components
        │   │   ├── common/      # Common components
        │   │   ├── layout/      # Layout components
        │   │   └── flight/      # Flight-specific components
        │   │       └── SearchForm.js  # ✅ Đã tạo
        │   ├── pages/           # Pages
        │   ├── services/        # ✅ API services
        │   │   └── api.js       # ✅ Đã tạo
        │   ├── utils/           # ✅ Utility functions
        │   │   └── formatters.js # ✅ Đã tạo
        │   ├── constants/       # ✅ Constants
        │   │   └── airports.js  # ✅ Đã tạo
        │   └── App.js           # ✅ Đã update
        └── package.json
```

---

## 🏃 Cách chạy dự án

### **Development Mode (2 terminals)**

#### Terminal 1: Backend API
```bash
cd flight-prediction-monolith
npm start
# Chạy trên http://localhost:3000
```

#### Terminal 2: React Dev Server
```bash
cd flight-prediction-monolith
npm run dev:client
# Chạy trên http://localhost:3000 (React default)
```

**⚠️ LƯU Ý:** Cần đổi PORT của backend hoặc React để tránh conflict!

**Giải pháp:** Đổi backend sang port 3001
```javascript
// flight-prediction-monolith/server.js
const PORT = process.env.PORT || 3001;  // Đổi từ 3000 → 3001
```

Sau đó:
- Backend: http://localhost:3001
- React: http://localhost:3000

---

### **Production Mode (1 service)**

```bash
# Build React app
cd flight-prediction-monolith
npm run build:client

# Run production server
npm run deploy
```

Server sẽ serve cả frontend + backend trên cùng 1 port.

---

## 📝 Tính năng hiện có

### ✅ Đã implement:

1. **SearchForm Component**
   - Chọn sân bay đi/đến
   - Chọn ngày bay
   - Chọn số hành khách (adult/child/infant)
   - Validation form đầy đủ
   - Auto-crawl nhiều ngày

2. **API Integration**
   - Service để gọi BayDep API
   - Service để gọi VietJet API
   - Auto switch giữa dev/production URL

3. **UI Components**
   - Airline selection (BayDep/VietJet)
   - Loading spinner
   - Error display
   - Results display

4. **Utilities**
   - Price formatting (VND currency)
   - Date formatting (DD/MM/YYYY)
   - Airport data constants

---

## 🎯 Bước tiếp theo để phát triển

### 1. **Tạo FlightCard Component**
```bash
# File: web-app/client/src/components/flight/FlightCard.js
```
**Mục đích:** Hiển thị thông tin 1 chuyến bay (giá, giờ bay, v.v.)

### 2. **Tạo FlightList Component**
```bash
# File: web-app/client/src/components/flight/FlightList.js
```
**Mục đích:** Danh sách các FlightCard

### 3. **Tạo PriceChart Component**
```bash
# File: web-app/client/src/components/flight/PriceChart.js
```
**Mục đích:** Biểu đồ giá vé theo ngày

**Cần install:**
```bash
cd web-app/client
npm install recharts
```

### 4. **Tạo FilterPanel Component**
```bash
# File: web-app/client/src/components/flight/FilterPanel.js
```
**Mục đích:** Filter kết quả (giá, hãng bay, giờ bay)

### 5. **Tạo Results Page**
```bash
# File: web-app/client/src/pages/ResultsPage.js
```
**Mục đích:** Trang hiển thị đầy đủ kết quả crawl

### 6. **Thêm React Router**
```bash
cd web-app/client
npm install react-router-dom
```

**Routes:**
- `/` - Home page (SearchForm)
- `/results` - Results page
- `/history` - Xem lịch sử crawl

### 7. **Tích hợp ML Prediction**
Tạo API endpoint để gọi Python model và hiển thị giá dự đoán

---

## 🎨 Design Improvements

### Màu sắc hiện tại:
- Primary: #667eea → #764ba2 (gradient)
- Button Primary: #1976d2
- Success: #4caf50
- Error: #f44336

### Gợi ý cải thiện:
1. Thêm dark mode toggle
2. Thêm animations (fade in/out)
3. Skeleton loaders thay vì spinner
4. Toast notifications thay vì alert()

---

## 📦 Dependencies cần cài đặt

### Đã có sẵn:
- ✅ React 19.1.0
- ✅ react-dom 19.1.0

### Khuyến nghị cài thêm:

```bash
cd web-app/client

# UI Components & Icons
npm install @mui/material @emotion/react @emotion/styled
npm install @mui/icons-material

# Charts
npm install recharts

# Date handling
npm install date-fns

# Routing
npm install react-router-dom

# Notifications
npm install react-toastify

# HTTP client (thay vì fetch)
npm install axios
```

---

## 🧪 Testing

### Cách test:

1. **Start backend:**
```bash
cd flight-prediction-monolith
npm start
```

2. **Start frontend:**
```bash
cd flight-prediction-monolith
npm run dev:client
```

3. **Test crawl:**
   - Mở http://localhost:3000
   - Chọn sân bay: SGN → HAN
   - Chọn ngày: hôm nay hoặc tương lai
   - Click "Bắt đầu crawl"
   - Chờ kết quả (có thể mất vài phút)

---

## 🐛 Debugging

### Common Issues:

**1. Port conflict:**
```
Error: Port 3000 already in use
```
**Fix:** Đổi backend sang port 3001 (xem hướng dẫn ở trên)

**2. CORS Error:**
```
Access to fetch has been blocked by CORS policy
```
**Fix:** Kiểm tra backend có `app.use(cors())` 

**3. Module not found:**
```
Cannot find module './components/flight/SearchForm'
```
**Fix:** Kiểm tra đường dẫn import đúng chưa

---

## 📚 Tài liệu tham khảo

- React Docs: https://react.dev/
- Material UI: https://mui.com/
- Recharts: https://recharts.org/
- React Router: https://reactrouter.com/

---

## 💡 Tips

1. **Hot Reload:** React dev server tự động reload khi bạn sửa code
2. **Console Logs:** Mở DevTools (F12) để xem logs và debug
3. **React DevTools:** Cài extension để inspect components
4. **Git:** Commit thường xuyên để tránh mất code

---

## 🎓 Cho Thesis/Demo

### Checklist trước khi demo:

- [ ] Backend API chạy ổn định
- [ ] Frontend load được
- [ ] Search form hoạt động
- [ ] Crawl được dữ liệu
- [ ] Hiển thị kết quả đẹp
- [ ] Responsive trên mobile
- [ ] Có error handling
- [ ] Loading state rõ ràng

---

**Chúc bạn code vui vẻ! 🚀**

Nếu có vấn đề gì, check lại file này hoặc xem logs trong console.

