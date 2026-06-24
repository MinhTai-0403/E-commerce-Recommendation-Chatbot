import "./App.css";
import { TopBar, MainHeader } from "./components/Header/Header";
import HeroSection from "./components/HeroSection/HeroSection";
import HotTrend from "./components/HotTrend/HotTrend";
import CategoryBlock from "./components/CategoryBlock/CategoryBlock";
import AccessoryCategories from "./components/AccessoryCategories/AccessoryCategories";
import HomeApplianceCategories from "./components/HomeApplianceCategories/HomeApplianceCategories";
import UsedProducts from "./components/UsedProducts/UsedProducts";
import TechNews from "./components/TechNews/TechNews";
import Footer from "./components/Footer/Footer";
import LoginSmember from "./components/LoginSmember/LoginSmember";
import {
  phoneSubCategories,
  phoneBrandFilters,
  phoneProducts,
  laptopBrandFilters,
  laptopProducts,
  watchProducts,
  tvBrandFilters,
  tvProducts,
  applianceBrandFilters,
  applianceProducts,
} from "./data/mockData";
import { useEffect, useState } from "react";

// Mảng 47 tỉnh thành thực tế của CellphoneS được sắp xếp chuẩn Alphabet tiếng Việt
const CELLPHONES_47_PROVINCES = [
  "An Giang",
  "Bà Rịa - Vũng Tàu",
  "Bắc Giang",
  "Bắc Ninh",
  "Bến Tre",
  "Bình Định",
  "Bình Dương",
  "Bình Phước",
  "Bình Thuận",
  "Cà Mau",
  "Cần Thơ",
  "Đà Nẵng",
  "Đắk Lắk",
  "Đồng Nai",
  "Đồng Tháp",
  "Hà Nam",
  "Hà Nội",
  "Hà Tĩnh",
  "Hải Dương",
  "Hải Phòng",
  "Hậu Giang",
  "Hòa Bình",
  "Hồ Chí Minh",
  "Hưng Yên",
  "Khánh Hòa",
  "Kiên Giang",
  "Lạng Sơn",
  "Lâm Đồng",
  "Lào Cai",
  "Long An",
  "Nam Định",
  "Nghệ An",
  "Ninh Bình",
  "Ninh Thuận",
  "Phú Thọ",
  "Quảng Bình",
  "Quảng Nam",
  "Quảng Ngãi",
  "Quảng Ninh",
  "Tây Ninh",
  "Thái Bình",
  "Thái Nguyên",
  "Thanh Hóa",
  "Thừa Thiên - Huế",
  "Tiền Giang",
  "Trà Vinh",
  "Vĩnh Long",
  "Vĩnh Phúc",
].sort((a, b) => a.localeCompare(b, "vi"));

function FloatingActions() {
  const [visible, setVisible] = useState(false);
  const [showApp, setShowApp] = useState(true);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <aside className="floating-actions" aria-label="Liên kết hỗ trợ nhanh">
      {showApp && (
        <div className="floating-app">
          <button
            type="button"
            onClick={() => setShowApp(false)}
            aria-label="Đóng quảng cáo tải ứng dụng"
          >
            ×
          </button>
          <a href="#" aria-label="Tải ứng dụng CellphoneS">
            <img
              src="https://cdn2.cellphones.com.vn/insecure/rs:fill:100:100/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon_downloadapp.png"
              alt="Tải ứng dụng CellphoneS"
              width="100"
              height="100"
            />
          </a>
        </div>
      )}
      <button
        className={`floating-action-button back-to-top ${visible ? "visible" : ""}`}
        onClick={scrollToTop}
        type="button"
      >
        <span>Lên đầu</span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <polyline points="18 15 12 9 6 15" />
          <polyline points="18 20 12 14 6 20" />
        </svg>
      </button>
      <a className="floating-action-button floating-contact" href="#">
        <span>Liên hệ</span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
          <path d="M18 19h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-1zM6 19H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h1z" />
          <path d="M18 19c0 1.1-.9 2-2 2h-3" />
        </svg>
      </a>
    </aside>
  );
}

function App() {
  const [activePopup, setActivePopup] = useState(null); // 'category' | 'location' | 'auth' | null
  const [currentPage, setCurrentPage] = useState("home"); // 'home' | 'login'
  const [selectedLocation, setSelectedLocation] = useState("Hồ Chí Minh");
  const [locationSearch, setLocationSearch] = useState("");

  const filteredProvinces = CELLPHONES_47_PROVINCES.filter((p) =>
    p.toLowerCase().includes(locationSearch.toLowerCase()),
  );

  const handleCloseAllPopups = () => {
    setActivePopup(null);
    setLocationSearch("");
  };

  // ĐIỀU HƯỚNG TRANG: Đưa xuống dưới sau khi toàn bộ Hooks đã được khởi tạo để tránh vi phạm Rule of Hooks
  if (currentPage === "login") {
    return <LoginSmember onBackToHome={() => setCurrentPage("home")} />;
  }

  return (
    <div className="app">
      {/* MÀN MỜ ĐEN 1: Khi mở Danh mục sản phẩm dọc */}
      {activePopup === "category" && (
        <div
          className="global-backdrop-overlay"
          onClick={handleCloseAllPopups}
        />
      )}

      {/* MÀN MỜ ĐEN 2: Khi bật Box Vị trí hoặc Box Đăng nhập Smember */}
      {(activePopup === "location" || activePopup === "auth") && (
        <div
          className="location-global-overlay"
          onClick={handleCloseAllPopups}
        />
      )}

      {/* Header */}
      <TopBar />
      <MainHeader
        activePopup={activePopup}
        setActivePopup={setActivePopup}
        selectedLocation={selectedLocation}
      />

      {/* Main Content */}
      <main className="main-content">
        <HeroSection />
        <HotTrend />

        <CategoryBlock
          title="Điện thoại nổi bật"
          tabs={["Điện thoại", "Máy tính bảng"]}
          subCategories={phoneSubCategories}
          filters={phoneBrandFilters}
          products={phoneProducts}
          campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:795/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KTXD3MF8YTC80J2CHM6AVC9F.jpg"
        />

        <AccessoryCategories />

        <CategoryBlock
          title="Laptop"
          tabs={["Laptop", "Màn hình", "PC Gaming"]}
          filters={laptopBrandFilters}
          products={laptopProducts}
          campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:795/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KVFPDXRAJ749QHYHQKZFR23W.png"
        />

        <CategoryBlock
          title="Đồng hồ thông minh"
          tabs={["Đồng hồ thông minh"]}
          filters={[
            { id: "all", name: "Tất cả" },
            { id: "apple", name: "Apple" },
            { id: "samsung", name: "Samsung" },
            { id: "garmin", name: "Garmin" },
            { id: "xiaomi", name: "Xiaomi" },
          ]}
          products={watchProducts}
          campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KTQYDCRMJX3BWCYNHPYJ6FRC.png"
        />

        <CategoryBlock
          title="Tivi"
          tabs={["Tivi"]}
          filters={tvBrandFilters}
          products={tvProducts}
          campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KT8ANYD04XX6K1VH0NZ387P7.png"
        />

        <HomeApplianceCategories />

        <CategoryBlock
          title="Tủ lạnh - Tủ đông"
          tabs={[
            "Tủ lạnh - Tủ đông",
            "Máy giặt",
            "Máy sấy quần áo",
            "Điều hòa - Máy lạnh",
          ]}
          filters={applianceBrandFilters}
          products={applianceProducts}
          campaignBanner="https://cdn2.cellphones.com.vn/insecure/rs:fill:321:960/q:100/plain/https://media-asset.cellphones.com.vn/page_configs/01KDCX8QQYKQ4AX3BEHBRA5B9W.png"
        />

        <UsedProducts />
        <TechNews />
      </main>

      <Footer />
      <FloatingActions />

      {/* FORM BOX CHỌN VỊ TRÍ TỈNH THÀNH (HÌNH SỐ 3) */}
      {activePopup === "location" && (
        <div className="location-modal-box">
          <div className="location-modal-header-bar">
            <div className="location-modal-search-wrapper">
              <svg
                className="modal-search-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#999"
                strokeWidth="2.5"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Nhập tên tỉnh thành"
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                autoFocus
              />
            </div>
            <button
              className="location-modal-close-btn"
              onClick={handleCloseAllPopups}
            >
              Đóng ×
            </button>
          </div>

          <div className="location-modal-hint">
            Vui lòng chọn tỉnh, thành phố để biết chính xác giá, khuyến mãi và
            tồn kho
          </div>

          <div className="location-modal-body">
            {filteredProvinces.length > 0 ? (
              <div className="location-grid-layout">
                {filteredProvinces.map((province, idx) => (
                  <button
                    key={idx}
                    className={`location-grid-item ${selectedLocation === province ? "active" : ""}`}
                    onClick={() => {
                      setSelectedLocation(province);
                      handleCloseAllPopups();
                    }}
                  >
                    <span>{province}</span>
                    {selectedLocation === province && (
                      <span className="check-mark">✓</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="location-no-data">
                Không tìm thấy tỉnh thành phù hợp
              </div>
            )}
          </div>
        </div>
      )}

      {/* FORM BOX HỘP THOẠI HỎI ĐĂNG NHẬP NHANH */}
      {activePopup === "auth" && (
        <div className="auth-modal-box">
          <button className="auth-modal-close-x" onClick={handleCloseAllPopups}>
            ×
          </button>
          <h2 className="auth-modal-title">Smember</h2>
          <div className="auth-modal-mascot">
            <img
              src="https://cellphones.com.vn/media/wysiwyg/ant-smile.png"
              alt="Smember Mascot"
            />
          </div>
          <p className="auth-modal-desc">
            Vui lòng đăng nhập tài khoản Smember để xem ưu đãi và thanh toán dễ
            dàng hơn.
          </p>
          <div className="auth-modal-actions">
            <button
              className="auth-btn btn-register"
              onClick={() => {
                handleCloseAllPopups();
                setCurrentPage("login");
              }}
            >
              Đăng ký
            </button>
            <button
              className="auth-btn btn-login"
              onClick={() => {
                handleCloseAllPopups();
                setCurrentPage("login");
              }}
            >
              Đăng nhập
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
