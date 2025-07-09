from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
import time

def take_screenshot_simple():
 
    url = "https://www.vietnamairlines.com/vn/vi/home"
    filename = f"vietnam_airlines_screenshot_{int(time.time())}.png"
    
    try:
        print("khởi tạo Chrome browser...")
        
        # Cấu hình Chrome
        chrome_options = Options()
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        
        # Tạo driver
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        
        print(f"📱 Đang mở trang Vietnam Airlines: {url}")
        driver.get(url)
        
        print("⏳ Chờ trang load (10 giây)...")
        time.sleep(10)
        
        print(f"📸 Đang chụp màn hình...")
        driver.save_screenshot(filename)
        
        # Lấy thông tin trang
        title = driver.title
        current_url = driver.current_url
        
        print(f"✅ Chụp màn hình thành công!")
        print(f"📄 Title: {title}")
        print(f"🔗 URL: {current_url}")
        print(f"💾 File đã lưu: {filename}")
        
        driver.quit()
        return True
        
    except Exception as e:
        print(f"❌ Lỗi: {e}")
        if 'driver' in locals():
            driver.quit()
        return False

if __name__ == "__main__":
    print("🇻🇳 VIETNAM AIRLINES SCREENSHOT TOOL")
    print("="*50)
    take_screenshot_simple() 