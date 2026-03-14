import time
import json
import re
import unicodedata
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support import expected_conditions as EC
from crawl_detail import CellphoneSJsonCrawler

class CellphoneSMasterCrawler:
    def __init__(self):
        # self.processed_links = set()
        self.options = Options()
        self.options.add_argument("--window-size=1920,1080")
        self.options.add_argument("--disable-notifications")
        
        self.driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()), 
            options=self.options
        )
        self.wait = WebDriverWait(self.driver, 10)
        self.crawl_detail_engine = CellphoneSJsonCrawler(driver = self.driver)
        self.all_product = []

    
    def get_all_links_from_category(self, category_url, max_clicks = 15):
        """Lấy link"""
        print(f"[*] Truy cập danh mục: {category_url}")
        self.driver.get(category_url)
        time.sleep(3) # Chờ load

        click_count = 0
        while click_count < max_clicks:
            try:
                # 1. Cuộn xuống cuối để kích hoạt nút (nếu cần)
                self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight - 1000);")
                time.sleep(1)

                # 2. Tìm nút "Xem thêm"
                # CellphoneS thường dùng class: btn-show-more, btn-load-more...
                # Ta dùng XPATH tìm nút có chứa chữ "Xem thêm" cho chắc ăn
                load_more_btn = WebDriverWait(self.driver, 5).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR,".button.btn-show-more.button__show-more-product"))
                )

                # 3. Click nút (Dùng JS click cho mượt, tránh bị banner che)
                self.driver.execute_script("arguments[0].click();", load_more_btn)
                print(f"    -> Đã bấm 'Xem thêm' lần thứ {click_count + 1}")
                
                # 4. QUAN TRỌNG: Chờ 20 sản phẩm mới tải xong
                time.sleep(3) 
                click_count += 1
                
            except Exception as e:
                print("    [i] Đã hết nút 'Xem thêm' hoặc tải xong hết danh sách.")
                break
        # Nếu muốn lấy nhiều hơn 16 cái, hãy viết vòng lặp click "Xem thêm" ở đây
        # self.click_load_more() 

        # Lấy tất cả thẻ a
        elements = self.driver.find_elements(By.CSS_SELECTOR, ".product-info-container a")
        
        # Chỉ lấy thuộc tính href (Chuỗi văn bản), KHÔNG giữ lại WebElement
        links = []
        for elm in elements:
            url = elm.get_attribute("href")
            if url:
                links.append(url)
        print(list(set(links)))
        # Xóa trùng lặp ngay tại bước này (nếu danh mục có 2 link giống hệt nhau)
        return list(set(links))

    def crawl_details(self, links_list):
        """GIAI ĐOẠN 2: Đi từng link để xử lý"""
        print(f"[*] Đã thu thập {len(links_list)} link. Bắt đầu xử lý chi tiết...")
        
        for link in links_list:
            # 1. Chuẩn hóa link (bỏ ? tham số thừa)
            clean_link = link.split("?")[0]

            # 2. Check xem link này (hoặc anh em của nó) đã làm chưa
            if clean_link in self.crawl_detail_engine.url_processed:
                print(f"  [SKIP] Đã xử lý rồi: {clean_link}")
                continue
            # 3. Vào thẳng trang chi tiết 
            print(f"  -> Đang crawl: {link}")
            data = self.crawl_detail_engine.run(link)
            
            self.all_product.append(data)
            
            # 4. QUAN TRỌNG: Tìm các link anh em (variants) để đánh dấu là "Đã làm"
            # Để tí nữa vòng lặp đến lượt tụi nó thì mình bỏ qua luôn
            
            time.sleep(1) # Tránh server chặn

    # def mark_siblings_as_processed(self, current_url):
    #     """Tìm các link variant trong trang này và thêm vào danh sách đã làm"""
    #     try:
    #         # Lấy các nút chọn dung lượng/màu sắc
    #         siblings = self.driver.find_elements(By.CSS_SELECTOR, ".list-linked .item-linked a")
            
    #         # Thêm chính nó vào trước
    #         self.processed_links.add(current_url)
            
    #         for sib in siblings:
    #             sib_url = sib.get_attribute("href")
    #             if sib_url:
    #                 clean_sib = sib_url.split("?")[0]
    #                 self.processed_links.add(clean_sib)
                    
    #     except:
    #         pass

    def run(self,url):
        # url = "https://cellphones.com.vn/phu-kien.html"
        
        # Bước 1: Gom lúa về kho
        raw_links = self.get_all_links_from_category(url)
        
        # Bước 2: Xay lúa
        self.crawl_details(raw_links)
        self.driver.quit()
if __name__ == "__main__":
    s = CellphoneSMasterCrawler()
    # link_url = [
    #     "https://cellphones.com.vn/phu-kien/apple.html",
    #     "https://cellphones.com.vn/phu-kien/sac-dien-thoai.html",
    #     "https://cellphones.com.vn/phu-kien/the-nho-usb-otg.html"
    # ]
    # for url in link_url:
    #     s.run(url)
    s.run("https://cellphones.com.vn/phu-kien/camera.html")
    data_to_save = s.all_product
    try:
        with open('camera.json','w',encoding='utf-8') as f:
            json.dump(data_to_save,f, ensure_ascii=False, indent=4)
        print("Create json file success")
    except Exception as e:
        print(f"Error with write to file {e}")
