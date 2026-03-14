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

class CellphoneSJsonCrawler:
    def __init__(self, driver=None):
        # self.options = Options()
        # self.options.add_argument("--window-size=1920,1080")
        # self.options.add_argument("--disable-notifications")
        # self.driver = webdriver.Chrome(
        #     service=Service(ChromeDriverManager().install()), 
        #     options=self.options
        # )
        # self.wait = WebDriverWait(self.driver, 10)
        self.url_processed = set()
        self.driver = driver

    def to_slug(self,text):
        # Xử lý chữ Đ trước vì NFD không tách được Đ
        text = text.replace("đ", "d").replace("Đ", "D")
        # Chuẩn hóa và loại bỏ dấu
        text = unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode("utf-8")
        # Chuyển về chữ thường và thay khoảng trắng bằng gạch ngang
        text = re.sub(r'\s+', '-', text.lower())
        return text
    def get_clean_image_url(self, thumbnail_url):
        """Lấy link ảnh gốc từ thumbnail"""
        if not thumbnail_url:
            return ""
        if "/plain/" in thumbnail_url:
            return thumbnail_url.split("/plain/")[-1]
        return thumbnail_url

    def clean_price(self, price_str):
        """Chuyển đổi chuỗi tiền tệ thành số nguyên"""
        if not price_str: 
            return 0
        clean = re.sub(r'[^\d]', '', price_str)
        return int(clean) if clean else 0

    def parse_product_detail(self, link):
        print(f"[*] Đang xử lý: {link}")
        self.driver.get(link)
        time.sleep(2)

        try:
            # 1. Lấy thông tin cơ bản (Title)
            try:
                title = self.driver.find_element(By.CSS_SELECTOR, ".box-product-name h1").text.strip()
            except:
                title = "Unknown Product"

            # 2. Lấy Specifications (Thông số kỹ thuật)
            specifications = []
            try:
                text_box = self.driver.find_element(By.ID, "thong-so-ky-thuat")
                rows = text_box.find_elements(By.CLASS_NAME, "technical-content-item")

                for row in rows:
                    row_text = row.text.strip()
                    if "\n" in row_text:
                        key, value = row_text.split("\n", 1)
                    elif ":" in row_text:
                        key, value = row_text.split(":", 1)
                    else:
                        key = row_text
                        value = ""

                    if key:
                        specifications.append({
                            "key": key.strip(),
                            "value": value.strip()
                        })
            except Exception as e:
                print(f"    [!] Lỗi lấy spec: {e}")

            # 3. Lấy Mô tả
            try:
                intro_element = self.driver.find_element(By.CSS_SELECTOR, ".cps-content-introduction")
                description = intro_element.text.strip().replace("\n", " ")
                description_detail = ""
            except:
                description = "Đang cập nhật"
                description_detail = ""

            time.sleep(3)

            # 3. Tìm thẻ script chứa JSON-LD
            # Lưu ý: Một trang có thể có nhiều thẻ ld+json, ta lấy tất cả và lọc
            script_tags = self.driver.find_elements(By.XPATH, '//script[@type="application/ld+json"]')

            found_brand = None

            for script in script_tags:
                # Lấy nội dung text bên trong thẻ script
                json_content = script.get_attribute('innerHTML')
                
                try:
                    # Chuyển string thành Dictionary Python
                    data = json.loads(json_content)
                    
                    # 4. Kiểm tra xem đây có phải là block chứa thông tin Sản phẩm không
                    # Dựa vào context bạn đưa: @type là Product
                    if data.get('@type') == 'Product':
                        # Trích xuất Brand
                        # Cấu trúc trong context: "brand": {"@type": "Brand", "name": "Huawei"}
                        brand_info = data.get('brand', {})
                        
                        if isinstance(brand_info, dict):
                            found_brand = brand_info.get('name')
                        elif isinstance(brand_info, str):
                            found_brand = brand_info # Trường hợp web để thẳng tên
                        
                        break # Đã tìm thấy, thoát vòng lặp
                        
                except json.JSONDecodeError:
                    continue # Bỏ qua nếu nội dung thẻ không phải JSON hợp lệ

            # 5. In kết quả
            if not found_brand:
                found_brand = "default"
                

            # 4. Lấy Variants (Màu sắc) và Ảnh đại diện theo màu
            main_name_color_list = []
            final_images_list = []
            
            try:
                print("    -> Đang lấy danh sách màu và ảnh...")
                variant_items = self.driver.find_elements(By.CSS_SELECTOR, ".list-variants .item-variant")

                for item in variant_items:
                    try:
                        # 1. Tìm thẻ <a> bên trong <li>
                        a_tag = item.find_element(By.TAG_NAME, "a")
                        
                        # Lấy tên màu (title)
                        name = a_tag.get_attribute("title")
                        
                        # 2. Thay vì lấy href, ta tìm thẻ <img> ngay bên trong thẻ <a> này
                        img_tag = a_tag.find_element(By.TAG_NAME, "img")
                        raw_src = img_tag.get_attribute("src")
                        
                        # 3. Xử lý link ảnh (vì ảnh thumbnail thường có cdn resize, 
                        # hàm này của bạn cần lọc để lấy link gốc phía sau)
                        clean_src = self.get_clean_image_url(raw_src)

                        main_name_color_list.append({
                            "color": name,
                            "main_image": str(clean_src)
                        })

                    except Exception as e:
                        print(f"Lỗi khi lấy thông tin variant: {e}")

                # Lấy bộ sưu tập ảnh (Gallery)
                image_elements = self.driver.find_elements(By.CSS_SELECTOR, ".swiper-slide.button__view-gallery img")
                gallery_images = set()
                for img in image_elements:
                    try:
                        c_src = self.get_clean_image_url(img.get_attribute("src"))
                        if c_src and any(ext in c_src for ext in [".jpg", ".png", ".jpeg", ".webp"]):
                            gallery_images.add(c_src)
                    except:
                        continue
                final_images_list = list(gallery_images)

            except Exception as e:
                print(f"    [!] Lỗi khi xử lý ảnh: {e}")

            # 5. Lấy Giá theo từng Phiên bản (Dung lượng)
            version_price = []
            version_links_data = []
            try:
                list_container = self.driver.find_element(By.CLASS_NAME, "list-linked")
                # Tìm tất cả thẻ a có class item-linked
                raw_versions = list_container.find_elements(By.CSS_SELECTOR, "a.item-linked")
                
                for v in raw_versions:
                    v_link = v.get_attribute("href")
                    v_name = v.text.replace("\n", " ").strip()
                    if v_link:
                        version_links_data.append({
                            "name": v_name,
                            "url": v_link
                        })
            except Exception as e:
                print(f"    [!] Lỗi khi quét danh sách version: {e}")

            # Nếu không tìm thấy version nào (Sản phẩm chỉ có 1 loại), ta lấy luôn trang hiện tại
            if not version_links_data:
                version_links_data.append({
                    "name": "Tiêu chuẩn", # Hoặc lấy từ title
                    "url": link
                })

            # BƯỚC 2: Đi từng Link để lấy giá
            print(f"    -> Tìm thấy {len(version_links_data)} phiên bản dung lượng. Bắt đầu lấy giá...")
            
            for v_data in version_links_data:
                target_url = v_data['url']
                current_url = self.driver.current_url

                # Chỉ load lại trang nếu URL khác trang hiện tại (tối ưu tốc độ)
                # So sánh tương đối bỏ qua query params nếu cần
                if target_url.split('?')[0] != current_url.split('?')[0]:
                    self.driver.get(target_url)
                    time.sleep(1.5) # Đợi load giá

            # try:
            #     list_container = self.driver.find_element(By.CLASS_NAME, "list-linked")
            #     versions = list_container.find_elements(By.CLASS_NAME, "item-linked")
            #     count = len(versions)

            #     for i in range(count):
            #         # Tìm lại element để tránh StaleElementReferenceException
            #         try:
            #             self.wait.until(
            #                 EC.presence_of_all_elements_located((By.CSS_SELECTOR, ".list-linked .item-linked"))
            #             )
            #         except:
            #             print("    [!] Timeout chờ load danh sách version.")
            #             continue
            #         current_list = self.driver.find_elements(By.CSS_SELECTOR, ".list-linked .item-linked")
            #         if i >= len(current_list):
            #             print(f"    [!] Cảnh báo: Index {i} vượt quá số lượng phần tử tìm thấy ({len(current_list)}). Dừng vòng lặp giá.")
            #             break
            #         current_item = current_list[i]
                    
            #         version_name = current_item.text.replace("\n", " ").strip()
            #         item_link = current_item.get_attribute("href")
            #         self.url_processed.add(item_link)
                    
            #         # Click để lấy giá
            #         self.driver.execute_script("arguments[0].click();", current_item)
            #         time.sleep(2)
                self.url_processed.add(target_url)   
                try:
                    sale_price_elem = self.driver.find_element(By.CSS_SELECTOR, ".box-product-price .sale-price")
                    sale_price = self.clean_price(sale_price_elem.text)
                except:
                    sale_price = 0
                
                try:
                    price_elem = self.driver.find_element(By.CSS_SELECTOR, ".box-product-price .base-price")
                    price = self.clean_price(price_elem.text)
                except:
                    price = sale_price

                # Tạo SKU dựa trên link của version
                sku = target_url.split("/")[-1].replace(".html", "")

                version_price.append({
                    "version": v_data['name'],
                    "price": price,
                    "salePrice": sale_price,
                    "sku": sku
                })

        

            # 6. Tổng hợp Data (Cartesian Product: Version x Color)
            variants = []    
            for version in version_price:
                for image in main_name_color_list:
                    # Tạo list ảnh riêng cho từng biến thể
                    current_variant_images = list(final_images_list)
                    if image['main_image']:
                        current_variant_images.insert(0, image['main_image'])
                    color = str(image['color'])
                    slug = self.to_slug(color).strip()
                    sku = version['sku'] + "-" + slug
                    variant_item = {
                        "version": version['version'],
                        "colorName": color,
                        "hexcode": "#000000",
                        "images": current_variant_images,
                        "quantity": 100,
                        "price": version['price'],
                        "salePrice": version['salePrice'],
                        "sku": sku
                    }
                    variants.append(variant_item)

            # 7. Trả về kết quả
            return {
                "title": title,
                "brand": found_brand,
                "description": description,
                "descriptionDetail": description_detail,
                "specifications": specifications,
                "variants": variants,
                "categoryId": "PLACEHOLDER_ID",
                "isHide": 0,
                "rating": 5
            }

        except Exception as e:
            print(f"[!] Critical Error: {e}")
            return None

    def save_to_json(self, data, filename="products_export.json"):
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        print(f"\n[*] Đã xuất {len(data)} sản phẩm ra file: {filename}")

    def run(self,url):
        # url = "https://cellphones.com.vn/apple-macbook-air-13-m4-10cpu-8gpu-16gb-256gb-2025.html"
        data = self.parse_product_detail(url)
        if data:
            print(json.dumps(data, ensure_ascii=False, indent=4))
            return data
        else:
            print("Không lấy được dữ liệu.")
        

if __name__ == "__main__":
    crawler = CellphoneSJsonCrawler()
    data = crawler.run("https://cellphones.com.vn/iphone-13.html")
    try:
        with open('test.json','w',encoding='utf-8') as f:
            json.dump(data,f,ensure_ascii=False,indent=4)
    except Exception as e:
        print(f"Loi in ra ket qua {e}")
    # crawler.run()