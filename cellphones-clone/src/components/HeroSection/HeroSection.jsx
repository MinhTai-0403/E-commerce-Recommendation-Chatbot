import { useState, useEffect } from "react";
import "./HeroSection.css";

// Import các mảng data tĩnh sạch sẽ từ file dữ liệu riêng biệt
import { SafeBrandImage } from "./BrandLogos";
import {
  PHONE_BRANDS,
  LAPTOP_BRANDS,
  TABLET_BRANDS,
  AUDIO_BRANDS,
  SPEAKER_BRANDS,
  WATCH_BRANDS,
  HOME_APPLIANCE_BRANDS,
  MONITOR_PC_BRANDS,
  APPLIANCE_LOGOS,
} from "./brandData";

import {
  categories,
  heroSlides,
  heroSliderTabs,
  subBanners,
} from "../../data/mockData";
import {
  AUDIO_CATEGORY_PATHS,
  buildCategoryPath,
  getAudioCategoryPath,
  getRouteForLabel,
} from "../../utils/linkRoutes";

// BẢNG MAPPING ĐỂ KHỬ SẠCH CÁC LỖI HARDCODE STRING MATCHING
const CATEGORY_MAP = {
  "Điện thoại": "phone",
  Laptop: "laptop",
  "Âm thanh": "audio",
  "Đồng hồ": "watch",
  Camera: "watch",
  "Gia dụng": "appliance",
  "Làm đẹp": "appliance",
  "Phụ kiện": "accessory",
  PC: "pc",
  "Màn hình": "pc",
  "Máy in": "pc",
  Tivi: "tv",
  "Điện máy": "tv",
  "Thu cũ": "tradein",
  "Khuyến mãi": "promo",
};

const getCategorySlug = (name, fallbackId) => {
  if (!name) return fallbackId;
  for (const key in CATEGORY_MAP) {
    if (name.includes(key)) return CATEGORY_MAP[key];
  }
  return fallbackId;
};

const getBrandName = (brand = "") => (
  typeof brand === "string" ? brand : brand?.name || ""
);

const getBrandFilter = (brand = "") => {
  const name = getBrandName(brand);
  if (/iphone|ipad|airpods|apple watch|macbook|apple/i.test(name)) return "apple";
  if (/oppo/i.test(name)) return "oppo";
  if (/samsung/i.test(name)) return "samsung";
  if (/xiaomi|redmi|poco/i.test(name)) return "xiaomi";
  if (/huawei/i.test(name)) return "huawei";
  if (/asus|rog|tuf/i.test(name)) return "asus";
  if (/msi/i.test(name)) return "msi";
  if (/acer/i.test(name)) return "acer";
  if (/dell/i.test(name)) return "dell";
  if (/hp/i.test(name)) return "hp";
  if (/lg/i.test(name)) return "lg";
  return name;
};

const getCategoryTopicPath = (category = "", label = "", options = {}) => {
  if (category === "Khuyến mãi") {
    return getRouteForLabel(label, "promo");
  }
  if (category === "Thu cũ đổi mới") {
    return "/thu-cu-doi-moi";
  }
  if (category === "Thiết bị văn phòng") {
    const officeDevicePaths = {
      "Phần mềm": "/phu-kien.html?q=Phần%20mềm",
      "Bảng vẽ điện tử": "/bang-ve-dien-tu.html",
      "Máy tính cầm tay": "/may-tinh-cam-tay.html",
      "Decor bàn làm việc": "/phu-kien/decor-setup.html",
    };
    if (officeDevicePaths[label]) return officeDevicePaths[label];
  }

  const effectiveCategory = (
    category === "Âm thanh" && /^mic(?:ro)?\b/i.test(label)
  )
    ? "Micro thu âm"
    : category;

  return buildCategoryPath(effectiveCategory, {
    keyword: label,
    title: label,
    q: label,
    ...options,
  });
};

const getCategoryBrandPath = (category = "", brand = "", title = "", options = {}) => {
  const name = getBrandName(brand);
  const finalTitle = title || name;
  return buildCategoryPath(category, {
    brand: getBrandFilter(name),
    keyword: finalTitle,
    title: finalTitle,
    ...options,
  });
};

const getSidebarCategoryPath = (cat = {}, slug = "") => {
  if (cat.id === 12) return "/tin-tuc/tin-cong-nghe";
  if (slug === "phone") return "/mobile.html";
  if (slug === "laptop") return "/laptop.html";
  if (slug === "audio") return AUDIO_CATEGORY_PATHS.root;
  if (slug === "tradein") return "/thu-cu-doi-moi";
  if (slug === "promo") return "/danh-sach-khuyen-mai";

  const categoryByPanel = {
    phone: "Điện thoại",
    laptop: "Laptop",
    audio: "Âm thanh",
    watch: "Đồng hồ thông minh",
    appliance: "Đồ gia dụng",
    accessory: "Phụ kiện",
    pc: "PC",
    tv: "Tivi",
    tradein: "Hàng cũ",
    promo: "Khuyến mãi",
  };
  const category = categoryByPanel[slug] || cat.name;

  return buildCategoryPath(category, {
    keyword: cat.name,
    title: cat.name,
  });
};

const SIDEBAR_LABEL_CATEGORIES = {
  Tablet: "Máy tính bảng",
  "Đồng hồ": "Đồng hồ thông minh",
};

const getSidebarLabelPath = (cat = {}, slug = "", label = "") => {
  const cleanLabel = String(label || "").trim();
  const canonicalAudioPath = slug === "audio" ? getAudioCategoryPath(cleanLabel) : "";

  if (canonicalAudioPath) return canonicalAudioPath;
  if (!cat.name?.includes(",")) return getSidebarCategoryPath(cat, slug);

  const category = SIDEBAR_LABEL_CATEGORIES[cleanLabel] || cleanLabel;
  if (category === "Máy tính bảng") return "/tablet.html";

  return buildCategoryPath(category, {
    keyword: cleanLabel,
    title: cleanLabel,
  });
};

const getPhoneBrandPath = (brandName = "") => {
  const name = String(brandName || "").trim();
  const isIphone = /iphone|apple/i.test(name);
  return buildCategoryPath("Điện thoại", {
    brand: isIphone ? "apple" : name,
    keyword: isIphone ? "iPhone" : name,
    title: isIphone ? "iPhone" : name,
  });
};

const getTabletBrandPath = (brandName = "") => {
  const name = String(brandName || "").trim();
  const isApple = /iphone|ipad|apple/i.test(name);
  return buildCategoryPath("Máy tính bảng", {
    brand: isApple ? "apple" : name,
    keyword: isApple ? "iPad" : name,
    title: isApple ? "iPad" : name,
  });
};

const getPhoneTopicPath = (label = "", options = {}) => (
  getCategoryTopicPath("Điện thoại", label, options)
);

const getPhonePricePath = (label = "") => {
  const price = String(label || "");
  const title = `Điện thoại ${price}`;
  const options = { q: "", title, keyword: title };

  if (price.includes("Dưới 2")) return getPhoneTopicPath(title, { ...options, priceMax: 2_000_000 });
  if (price.includes("2 - 4")) return getPhoneTopicPath(title, { ...options, priceMin: 2_000_000, priceMax: 4_000_000 });
  if (price.includes("4 - 7")) return getPhoneTopicPath(title, { ...options, priceMin: 4_000_000, priceMax: 7_000_000 });
  if (price.includes("7 - 13")) return getPhoneTopicPath(title, { ...options, priceMin: 7_000_000, priceMax: 13_000_000 });
  if (price.includes("13 - 20")) return getPhoneTopicPath(title, { ...options, priceMin: 13_000_000, priceMax: 20_000_000 });
  if (price.includes("Trên 20")) return getPhoneTopicPath(title, { ...options, priceMin: 20_000_000 });

  return getPhoneTopicPath(title, options);
};

// ==================== BỘ CÁC ICON SVG TIỆN ÍCH BÊN PHẢI ====================
function GiftRedIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#d70018"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}

function GraduationCapIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ef4444"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
    </svg>
  );
}

function TradeInIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#d70018"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h13l-3-3" />
      <path d="m17 7-3 3" />
      <path d="M20 17H7l3 3" />
      <path d="m7 17 3-3" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#78350f"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function ApplianceBrandGrid({ category, brands, viewAllLabel, viewAllSpan = 1 }) {
  return (
    <div className="mega-brand-logos-grid">
      {brands.map((brandName) => {
        const brand = APPLIANCE_LOGOS.find((item) => item.name === brandName);

        return (
          <a
            key={brandName}
            href={getCategoryBrandPath(category, brand || brandName)}
            className="mega-brand-logo-card-item"
            aria-label={`${category} ${brandName}`}
          >
            {brand?.logo ? (
              <SafeBrandImage src={brand.logo} alt={brandName} />
            ) : (
              <span className="fallback-brand-text">{brandName}</span>
            )}
          </a>
        );
      })}
      <a
        href={buildCategoryPath(category)}
        className="mega-brand-logo-card-item appliance-view-all-card"
        style={{ gridColumn: `span ${viewAllSpan}` }}
      >
        <span>{viewAllLabel}</span>
      </a>
    </div>
  );
}

export default function HeroSection({
  currentUser,
  onGoLogin,
  onGoRegister,
  categoryMenuOnly = false,
  onCategoryNavigate,
}) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [hoveredCategory, setHoveredCategory] = useState(
    categoryMenuOnly ? "phone" : null,
  );
  const displayName =
    currentUser?.fullName || currentUser?.username || currentUser?.email;

  useEffect(() => {
    if (categoryMenuOnly) return undefined;

    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [categoryMenuOnly]);

  return (
    <section
      className={`hero-section section-gap ${categoryMenuOnly ? "hero-category-menu-only" : ""}`}
    >
      {!categoryMenuOnly && hoveredCategory !== null && (
        <div className="hero-category-hover-backdrop" />
      )}

      <div className="container">
        <div
          className="hero-inner"
          onMouseLeave={() => setHoveredCategory(categoryMenuOnly ? "phone" : null)}
          onClick={(event) => {
            if (categoryMenuOnly && event.target.closest("a")) {
              onCategoryNavigate?.();
            }
          }}
        >
          {/* ================= THÀNH PHẦN 1: SIDEBAR TRÁI ================= */}
          <div className="hero-sidebar">
            <ul className="category-menu">
              {categories.map((cat) => {
                const currentSlug = getCategorySlug(cat.name, cat.id);
                const isItemHovered = hoveredCategory === currentSlug;
                const categoryLabels = cat.name.split(",").map((label) => label.trim());

                return (
                  <li
                    key={cat.id}
                    className={`category-item ${isItemHovered ? "active-hover-item" : ""}`}
                    onMouseEnter={() => setHoveredCategory(currentSlug)}
                  >
                    <div className="category-item-content">
                      <div className="category-item-left">
                        <img className="category-icon" src={cat.icon} alt="" />
                        <span className="category-labels">
                          {categoryLabels.map((label, index) => (
                            <span key={label}>
                              {index > 0 && <span className="category-separator">, </span>}
                              <a
                                className="category-label-link"
                                href={getSidebarLabelPath(cat, currentSlug, label)}
                              >
                                {label}
                              </a>
                            </span>
                          ))}
                        </span>
                      </div>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ================= THÀNH PHẦN 2: MEGA MENU PANELS ================= */}

          {/* 2.1 - PANEL ĐIỆN THOẠI & TABLET */}
          {hoveredCategory === "phone" && (
            <div
              className="mega-menu-panel"
              onMouseEnter={() => setHoveredCategory("phone")}
            >
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Hãng điện thoại</div>
                  <div className="mega-brand-logos-grid">
                    {PHONE_BRANDS.map((brand, i) => (
                      <a
                        key={i}
                        href={getPhoneBrandPath(brand.name)}
                        className="mega-brand-logo-card-item relative-pill"
                      >
                        <SafeBrandImage src={brand.logo} alt={brand.name} />
                      </a>
                    ))}
                    <a
                      href={getPhoneTopicPath("Điện thoại phổ thông", { q: "Điện thoại phổ thông" })}
                      className="mega-brand-logo-card-item wide-text-pill"
                    >
                      <span>Điện thoại phổ thông</span>
                    </a>
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "18px" }}>
                  <div className="mega-section-title">Mức giá điện thoại</div>
                  <div className="mega-grid-pills-flexible">
                    {[
                      "Dưới 2 triệu",
                      "Từ 2 - 4 triệu",
                      "Từ 4 - 7 triệu",
                      "Từ 7 - 13 triệu",
                      "Từ 13 - 20 triệu",
                      "Trên 20 triệu",
                    ].map((price, i) => (
                      <a
                        key={i}
                        href={getPhonePricePath(price)}
                        className="mega-pill-item"
                        style={{ gridColumn: "span 2" }}
                      >
                        {price}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Điện thoại HOT ⚡</div>
                  <div className="mega-grid-pills-flexible">
                    {hotPhoneModels.map((phone, i) => (
                      <a
                        key={i}
                        href={getPhoneTopicPath(phone.name, { q: phone.name })}
                        className="mega-pill-item relative-pill"
                        style={{ gridColumn: `span ${phone.span}` }}
                      >
                        <span>{phone.name}</span>
                        {phone.badge && (
                          <span
                            className={`pill-badge-tag ${phone.badge === "Mới" ? "bg-blue" : "bg-red"}`}
                          >
                            {phone.badge}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Hãng máy tính bảng</div>
                  <div className="mega-brand-logos-grid">
                    {TABLET_BRANDS.map((brand, i) => (
                      <a
                        key={i}
                        href={getTabletBrandPath(brand.name)}
                        className="mega-brand-logo-card-item relative-pill"
                      >
                        <SafeBrandImage src={brand.logo} alt={brand.name} />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2.2 - PANEL LAPTOP */}
          {hoveredCategory === "laptop" && (
            <div
              className="mega-menu-panel"
              onMouseEnter={() => setHoveredCategory("laptop")}
            >
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Thương hiệu</div>
                  <div className="mega-brand-logos-grid">
                    {LAPTOP_BRANDS.map((brand, i) => (
                      <a
                        key={i}
                        href={getCategoryBrandPath("Laptop", brand)}
                        className="mega-brand-logo-card-item relative-pill"
                      >
                        <SafeBrandImage src={brand.logo} alt={brand.name} />
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "20px" }}>
                  <div className="mega-section-title">Phân khúc giá</div>
                  <div className="mega-grid-pills-flexible">
                    {[
                      "Dưới 10 triệu",
                      "Từ 10 - 15 triệu",
                      "Từ 15 - 20 triệu",
                      "Từ 20 - 25 triệu",
                      "Từ 25 - 30 triệu",
                    ].map((p, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Laptop", `Laptop ${p}`, { q: p })}
                        className="mega-pill-item"
                        style={{ gridColumn: "span 3" }}
                      >
                        {p}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Nhu cầu sử dụng</div>
                  <div className="mega-laptop-needs-grid">
                    {laptopNeedsData.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Laptop", item.name)}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                        {item.badge && (
                          <span className="pill-badge-tag bg-red">
                            {item.badge}
                          </span>
                        )}
                      </a>
                    ))}
                    <a
                      href={getCategoryTopicPath("Laptop", "Mac CTO", { brand: "apple" })}
                      className="mega-laptop-need-card grid-wide-row"
                    >
                      <img
                        src="https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_5__3.png"
                        alt="Mac"
                        referrerPolicy="no-referrer"
                      />
                      <span>Mac CTO - Nâng cấp theo cách của bạn</span>
                    </a>
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Dòng chip</div>
                  <div className="mega-grid-pills-flexible">
                    {laptopChipsData.map((chip, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Laptop", chip.name)}
                        className="mega-pill-item relative-pill"
                        style={{ gridColumn: `span ${chip.span}` }}
                      >
                        <span>{chip.name}</span>
                        {chip.badge && (
                          <span
                            className={`pill-badge-tag ${chip.badge === "Mới" ? "bg-blue" : "bg-red"}`}
                          >
                            {chip.badge}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2.3 - PANEL ÂM THANH & MIC THU ÂM */}
          {hoveredCategory === "audio" && (
            <div
              className="mega-menu-panel"
              onMouseEnter={() => setHoveredCategory("audio")}
            >
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Chọn loại tai nghe</div>
                  <div className="mega-laptop-needs-grid">
                    {audioTypesSquare.map((item, i) => (
                      <a
                        key={i}
                        href={getAudioCategoryPath(item.name) || getCategoryTopicPath("Tai nghe", item.name)}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                    <a
                      href={AUDIO_CATEGORY_PATHS.headphones}
                      className="mega-pill-item full-width-row-pill"
                      style={{ gridColumn: "span 2", marginTop: "4px" }}
                    >
                      Xem tất cả tai nghe
                    </a>
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "20px" }}>
                  <div className="mega-section-title">Mic</div>
                  <div className="mega-laptop-needs-grid">
                    {micTypesSquare.map((item, i) => (
                      <a
                        key={i}
                        href={getAudioCategoryPath(item.name) || getCategoryTopicPath("Âm thanh", item.name, {
                          q: item.query || item.name,
                        })}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Hãng tai nghe</div>
                  <div className="mega-brand-logos-grid">
                    {AUDIO_BRANDS.map((brand, i) => (
                      <a
                        key={i}
                        href={brand.name === "AirPods"
                          ? AUDIO_CATEGORY_PATHS.airPods
                          : getCategoryBrandPath("Tai nghe", brand)}
                        className="mega-brand-logo-card-item relative-pill"
                      >
                        <SafeBrandImage src={brand.logo} alt={brand.name} />
                        {["Sony", "JBL"].includes(brand.name) && (
                          <span className="pill-badge-tag bg-red">Hot</span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "16px" }}>
                  <div className="mega-section-title">Chọn theo giá</div>
                  <div className="mega-grid-pills-flexible">
                    {[
                      { label: "Tai nghe dưới 200K", priceMax: 200000 },
                      { label: "Tai nghe dưới 500K", priceMax: 500000 },
                      { label: "Tai nghe dưới 1 triệu", priceMax: 1000000 },
                      { label: "Tai nghe dưới 2 triệu", priceMax: 2000000 },
                      { label: "Tai nghe dưới 5 triệu", priceMax: 5000000 },
                    ].map((priceRange) => (
                      <a
                        key={priceRange.priceMax}
                        href={buildCategoryPath("Tai nghe", {
                          title: priceRange.label,
                          priceMax: priceRange.priceMax,
                          sort: "price_asc",
                        })}
                        className="mega-pill-item"
                        style={{ gridColumn: "span 3" }}
                      >
                        {priceRange.label}
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "16px" }}>
                  <div className="mega-section-title">Chọn loại loa</div>
                  <div className="mega-laptop-needs-grid">
                    {speakerTypesSquare.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Loa", item.name)}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                    <a
                      href={AUDIO_CATEGORY_PATHS.speakers}
                      className="mega-pill-item full-width-row-pill"
                      style={{ gridColumn: "span 2", marginTop: "4px" }}
                    >
                      Xem tất cả loa
                    </a>
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Hãng loa</div>
                  <div className="mega-brand-logos-grid">
                    {SPEAKER_BRANDS.map((brand, i) => (
                      <a
                        key={i}
                        href={getCategoryBrandPath("Loa", brand)}
                        className="mega-brand-logo-card-item relative-pill"
                      >
                        <SafeBrandImage src={brand.logo} alt={brand.name} />
                        {["JBL", "Marshall"].includes(brand.name) && (
                          <span className="pill-badge-tag bg-red">Hot</span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "16px" }}>
                  <div className="mega-section-title">Sản phẩm nổi bật</div>
                  <div className="mega-grid-pills-flexible">
                    {hotAudioProducts.map((prod, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath(prod.category, prod.name)}
                        className="mega-pill-item relative-pill"
                        style={{ gridColumn: `span ${prod.span}` }}
                      >
                        <span>{prod.name}</span>
                        {prod.badge && (
                          <span
                            className={`pill-badge-tag ${prod.badge === "Mới" ? "bg-blue" : "bg-red"}`}
                          >
                            {prod.badge}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2.4 - PANEL ĐỒNG HỒ & CAMERA */}
          {hoveredCategory === "watch" && (
            <div
              className="mega-menu-panel"
              onMouseEnter={() => setHoveredCategory("watch")}
            >
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Loại đồng hồ</div>
                  <div className="mega-laptop-needs-grid">
                    {watchRowsData.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath(
                          item.category || "Đồng hồ thông minh",
                          item.name,
                          item.searchOptions || {},
                        )}
                        className="mega-laptop-need-card grid-wide-row"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "18px" }}>
                  <div className="mega-section-title">
                    Chọn theo thương hiệu
                  </div>
                  <div className="mega-brand-logos-grid">
                    {WATCH_BRANDS.map((brand, i) => (
                      <a
                        key={i}
                        href={getCategoryBrandPath("Đồng hồ thông minh", brand)}
                        className="mega-brand-logo-card-item relative-pill"
                      >
                        <SafeBrandImage src={brand.logo} alt={brand.name} />
                        {["Huawei"].includes(brand.name) && (
                          <span className="pill-badge-tag bg-red">Hot</span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Sản phẩm nổi bật ⚡</div>
                  <div className="mega-grid-pills-flexible">
                    {hotWatchProducts.map((prod, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Đồng hồ thông minh", prod.name)}
                        className="mega-pill-item relative-pill"
                        style={{ gridColumn: `span ${prod.span}` }}
                      >
                        <span>{prod.name}</span>
                        {prod.badge && (
                          <span
                            className={`pill-badge-tag ${prod.badge === "Mới" ? "bg-blue" : "bg-red"}`}
                          >
                            {prod.badge}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Camera</div>
                  <div className="mega-laptop-needs-grid">
                    {cameraTypesSquare.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Camera", item.name)}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                    <a
                      href={buildCategoryPath("Camera")}
                      className="mega-pill-item full-width-row-pill"
                      style={{ gridColumn: "span 2", marginTop: "4px" }}
                    >
                      Xem tất cả camera
                    </a>
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "18px" }}>
                  <div className="mega-section-title">Camera nổi bật</div>
                  <div className="mega-grid-pills-flexible">
                    {hotCameraProducts.map((prod, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Camera", prod.name)}
                        className="mega-pill-item relative-pill"
                        style={{ gridColumn: `span ${prod.span}` }}
                      >
                        <span>{prod.name}</span>
                        {prod.badge && (
                          <span
                            className={`pill-badge-tag ${prod.badge === "Mới" ? "bg-blue" : "bg-red"}`}
                          >
                            {prod.badge}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2.5 - PANEL ĐỒ GIA DỤNG & LÀM ĐẸP */}
          {hoveredCategory === "appliance" && (
            <div
              className="mega-menu-panel"
              onMouseEnter={() => setHoveredCategory("appliance")}
            >
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Thiết bị gia đình</div>
                  <div className="mega-laptop-needs-grid">
                    {householdDevices.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Đồ gia dụng", item.name)}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                        {item.badge && (
                          <span className="pill-badge-tag bg-red">
                            {item.badge}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "16px" }}>
                  <div className="mega-section-title">Gia dụng nhà bếp</div>
                  <div className="mega-laptop-needs-grid">
                    {kitchenDevices.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Đồ gia dụng", item.name)}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                        {item.badge && (
                          <span className="pill-badge-tag bg-red">
                            {item.badge}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Sức khỏe - Làm đẹp</div>
                  <div className="mega-laptop-needs-grid">
                    {beautyDevices.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Làm đẹp", item.name)}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Sản phẩm nổi bật ✨</div>
                  <div className="mega-grid-pills-flexible">
                    {hotApplianceProducts.map((prod, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Đồ gia dụng", prod.name)}
                        className="mega-pill-item"
                        style={{ gridColumn: `span ${prod.span}` }}
                      >
                        <span>{prod.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "24px" }}>
                  <div className="mega-section-title">Thương hiệu gia dụng</div>
                  <div className="mega-grid-pills-flexible">
                    {HOME_APPLIANCE_BRANDS.map((brand, i) => (
                      <a
                        key={i}
                        href={getCategoryBrandPath("Đồ gia dụng", brand)}
                        className="mega-pill-item"
                        style={{
                          gridColumn: "span 3",
                          justifyContent: "center",
                        }}
                      >
                        <span>{brand.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2.6 - PANEL PHỤ KIỆN */}
          {hoveredCategory === "accessory" && (
            <div
              className="mega-menu-panel"
              onMouseEnter={() => setHoveredCategory("accessory")}
            >
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Phụ kiện di động</div>
                  <div className="mega-laptop-needs-grid">
                    {mobileAccessories.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Phụ kiện", item.name)}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "16px" }}>
                  <div className="mega-section-title">Phụ kiện Laptop</div>
                  <div className="mega-laptop-needs-grid">
                    {pcAccessories.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Phụ kiện", item.name)}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Thiết bị mạng</div>
                  <div className="mega-laptop-needs-grid">
                    {networkDevices.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Thiết bị mạng", item.name)}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                    <a
                      href={buildCategoryPath("Thiết bị mạng")}
                      className="mega-pill-item full-width-row-pill"
                      style={{ gridColumn: "span 2", marginTop: "4px" }}
                    >
                      Xem tất cả thiết bị mạng
                    </a>
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "16px" }}>
                  <div className="mega-section-title">Thiết bị lưu trữ</div>
                  <div className="mega-laptop-needs-grid">
                    {storageDevices.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Phụ kiện", item.name)}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "16px" }}>
                  <div className="mega-section-title">Phụ kiện khác</div>
                  <div className="mega-laptop-needs-grid">
                    {otherAccessories.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Phụ kiện", item.name)}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Phụ kiện hot 🔥</div>
                  <div className="mega-laptop-needs-grid">
                    {hotAccessoryProducts.map((prod, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Phụ kiện", prod.name)}
                        className="mega-laptop-need-card grid-wide-row"
                      >
                        <img
                          src={prod.img}
                          alt={prod.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{prod.name}</span>
                        {prod.badge && (
                          <span
                            className={`pill-badge-tag ${prod.badge === "Mới" ? "bg-blue" : "bg-red"}`}
                          >
                            {prod.badge}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2.7 - PANEL PC, MÀN HÌNH, MÁY IN */}
          {hoveredCategory === "pc" && (
            <div
              className="mega-menu-panel"
              onMouseEnter={() => setHoveredCategory("pc")}
            >
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Loại PC</div>
                  <div className="mega-laptop-needs-grid">
                    {pcTypeRows.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("PC", item.name)}
                        className="mega-laptop-need-card grid-wide-row"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "14px" }}>
                  <div className="mega-section-title">Chọn PC theo nhu cầu</div>
                  <div className="mega-laptop-needs-grid">
                    {pcNeedRows.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("PC", item.name)}
                        className="mega-laptop-need-card grid-wide-row"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "14px" }}>
                  <div className="mega-section-title">Linh kiện máy tính</div>
                  <div className="mega-laptop-needs-grid">
                    {pcHardwareComponents.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Linh kiện máy tính", item.name)}
                        className="mega-laptop-need-card"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                    <a
                      href={buildCategoryPath("Linh kiện máy tính")}
                      className="mega-pill-item full-width-row-pill"
                      style={{ gridColumn: "span 2", marginTop: "4px" }}
                    >
                      Xem tất cả linh kiện
                    </a>
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">
                    Chọn màn hình theo hãng
                  </div>
                  <div className="mega-brand-logos-grid">
                    {MONITOR_PC_BRANDS.map((brand, i) => (
                      <a
                        key={i}
                        href={getCategoryBrandPath("Màn hình", brand, "", { segment: "monitor" })}
                        className="mega-brand-logo-card-item"
                      >
                        <SafeBrandImage src={brand.logo} alt={brand.name} />
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "20px" }}>
                  <div className="mega-section-title">
                    Chọn màn hình theo nhu cầu
                  </div>
                  <div className="mega-laptop-needs-grid">
                    {monitorNeedsRows.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Màn hình", item.name, { segment: "monitor" })}
                        className="mega-laptop-need-card grid-wide-row"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                    <a
                      href={buildCategoryPath("Màn hình", { segment: "monitor" })}
                      className="mega-pill-item full-width-row-pill"
                      style={{ gridColumn: "span 2", marginTop: "4px" }}
                    >
                      Xem tất cả màn hình
                    </a>
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-header-row">
                    <div className="mega-section-title">Gaming Gear</div>
                    <a href={buildCategoryPath("Gaming Gear")} className="mega-inline-text-link">
                      Xem tất cả
                    </a>
                  </div>
                  <div className="mega-laptop-needs-grid">
                    {pcGamingGearRows.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Gaming Gear", item.name)}
                        className="mega-laptop-need-card grid-wide-row"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "18px" }}>
                  <div className="mega-section-title">Thiết bị văn phòng</div>
                  <div className="mega-laptop-needs-grid">
                    {officeDeviceRows.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Thiết bị văn phòng", item.name)}
                        className="mega-laptop-need-card grid-wide-row"
                      >
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                        />
                        <span>{item.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2.8 - PANEL TIVI & ĐIỆN MÁY */}
          {hoveredCategory === "tv" && (
            <div
              className="mega-menu-panel tv-mega-menu-panel"
              onMouseEnter={() => setHoveredCategory("tv")}
            >
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Chọn hãng tivi</div>
                  <ApplianceBrandGrid
                    category="Tivi"
                    brands={["SAMSUNG", "LG", "Xiaomi", "Sony", "TCL", "AQUA", "coocaa", "VSP"]}
                    viewAllLabel="Xem tất cả tivi"
                    viewAllSpan={2}
                  />
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Chọn hãng tủ lạnh</div>
                  <ApplianceBrandGrid
                    category="Tủ lạnh"
                    brands={["LG", "SAMSUNG", "Xiaomi", "Panasonic", "AQUA", "Toshiba"]}
                    viewAllLabel="Xem tất cả tủ lạnh"
                    viewAllSpan={2}
                  />
                </div>
                <div className="mega-section" style={{ marginTop: "12px" }}>
                  <div className="mega-section-title">Chọn hãng tủ đông</div>
                  <ApplianceBrandGrid
                    category="Tủ đông"
                    brands={["Toshiba"]}
                    viewAllLabel="Xem tất cả tủ đông"
                  />
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Chọn hãng máy giặt</div>
                  <ApplianceBrandGrid
                    category="Máy giặt"
                    brands={["LG", "SAMSUNG", "Xiaomi", "Panasonic", "AQUA", "Toshiba"]}
                    viewAllLabel="Xem tất cả máy giặt"
                    viewAllSpan={2}
                  />
                </div>
                <div className="mega-section" style={{ marginTop: "12px" }}>
                  <div className="mega-section-title">Chọn hãng máy sấy</div>
                  <ApplianceBrandGrid
                    category="Máy sấy quần áo"
                    brands={["LG", "SAMSUNG", "Panasonic", "AQUA", "Toshiba"]}
                    viewAllLabel="Xem tất cả máy sấy"
                  />
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Chọn hãng máy lạnh</div>
                  <ApplianceBrandGrid
                    category="Máy lạnh"
                    brands={["Panasonic", "Daikin", "Sharp", "LG", "AQUA", "SAMSUNG", "Casper", "TCL", "Hitachi", "Xiaomi"]}
                    viewAllLabel="Xem tất cả máy lạnh"
                    viewAllSpan={2}
                  />
                </div>
                <div className="mega-section" style={{ marginTop: "12px" }}>
                  <div className="mega-section-title">Máy rửa chén bát</div>
                  <ApplianceBrandGrid
                    category="Máy rửa chén bát"
                    brands={["Bosch"]}
                    viewAllLabel="Xem tất cả"
                  />
                </div>
              </div>
              <div className="mega-tv-featured-strip">
                <div className="mega-section-title">Sản phẩm nổi bật 🔥</div>
                <div className="mega-tv-featured-grid">
                  {hotTvProducts.map((prod, i) => (
                    <a
                      key={i}
                      href={getCategoryTopicPath(
                        prod.category,
                        prod.query || prod.name,
                        { title: prod.name },
                      )}
                      className="mega-tv-featured-card"
                    >
                      <img src={prod.image} alt="" loading="lazy" />
                      <span>{prod.name}</span>
                      {prod.badge && (
                        <small className={prod.badge === "Mới" ? "new" : "hot"}>
                          {prod.badge}
                        </small>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2.9 - PANEL THU CŨ ĐỔI MỚI */}
          {hoveredCategory === "tradein" && (
            <div
              className="mega-menu-panel"
              onMouseEnter={() => setHoveredCategory("tradein")}
            >
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Chương trình nổi bật</div>
                  <div className="mega-grid-pills-flexible">
                    <a
                      href="/thu-cu-doi-moi"
                      className="mega-pill-item relative-pill"
                      style={{ gridColumn: "span 6" }}
                    >
                      <span>S-BuyBack Chương trình cam kết giá thu</span>
                      <span className="pill-badge-tag bg-blue">Mới</span>
                    </a>
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "18px" }}>
                  <div className="mega-section-title">Chọn theo hãng</div>
                  <div className="mega-grid-pills-flexible">
                    {tradeInBrands.map((brand, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Hàng cũ", brand)}
                        className="mega-pill-item"
                        style={{ gridColumn: "span 3" }}
                      >
                        <span>{brand}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Sản phẩm trợ giá cao</div>
                  <div className="mega-grid-pills-flexible">
                    {tradeInSubsidy.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Hàng cũ", item)}
                        className="mega-pill-item"
                        style={{ gridColumn: "span 6" }}
                      >
                        <span>{item}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">
                    Sản phẩm giá thu cao ⚡
                  </div>
                  <div className="mega-grid-pills-flexible">
                    {tradeInHighValue.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Hàng cũ", item)}
                        className="mega-pill-item"
                        style={{ gridColumn: "span 6" }}
                      >
                        <span>{item}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2.10 - PANEL KHUYẾN MÃI (BỔ SUNG CHO KHỚP HOÀN TOÀN VỚI HÌNH 1 - image_2a06fd.png) */}
          {hoveredCategory === "promo" && (
            <div
              className="mega-menu-panel"
              onMouseEnter={() => setHoveredCategory("promo")}
            >
              {/* CỘT 1: KHUYẾN MÃI */}
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Khuyến mãi</div>
                  <div className="mega-grid-pills-flexible">
                    {promoMainItems.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Khuyến mãi", item.name)}
                        className="mega-pill-item relative-pill"
                        style={{ gridColumn: `span ${item.span}` }}
                      >
                        <span>{item.name}</span>
                        {item.badge && (
                          <span
                            className={`pill-badge-tag ${item.badge === "Mới" ? "bg-blue" : "bg-red"}`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              {/* CỘT 2: THU CŨ ĐỔI MỚI GIÁ HỜI & ƯU ĐÃI THÀNH VIÊN */}
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">
                    Thu cũ đổi mới giá hời
                  </div>
                  <div className="mega-grid-pills-flexible">
                    {promoTradeInItems.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Khuyến mãi", item.name)}
                        className="mega-pill-item relative-pill"
                        style={{ gridColumn: "span 6" }}
                      >
                        <span>{item.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mega-section" style={{ marginTop: "18px" }}>
                  <div className="mega-section-title">Ưu đãi thành viên</div>
                  <div className="mega-grid-pills-flexible">
                    {promoMemberItems.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Khuyến mãi", item.name)}
                        className="mega-pill-item relative-pill"
                        style={{ gridColumn: "span 6" }}
                      >
                        <span>{item.name}</span>
                        {item.badge && (
                          <span
                            className={`pill-badge-tag ${item.badge === "Mới" ? "bg-blue" : "bg-red"}`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              {/* CỘT 3: ƯU ĐÃI SINH VIÊN */}
              <div className="mega-column">
                <div className="mega-section">
                  <div className="mega-section-title">Ưu đãi sinh viên</div>
                  <div className="mega-grid-pills-flexible">
                    {promoStudentItems.map((item, i) => (
                      <a
                        key={i}
                        href={getCategoryTopicPath("Khuyến mãi", item.name)}
                        className="mega-pill-item relative-pill"
                        style={{ gridColumn: `span ${item.span}` }}
                      >
                        <span>{item.name}</span>
                        {item.badge && (
                          <span
                            className={`pill-badge-tag ${item.badge === "Mới" ? "bg-blue" : "bg-red"}`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= THÀNH PHẦN 3: BANNER TRƯỢT GIỮA ================= */}
          <div className="hero-slider-wrapper">
            <div className="hero-slider">
              <div
                className="slider-track"
                style={{ transform: `translateX(-${currentSlide * 100}%)` }}
              >
                {heroSlides.map((slide, index) => (
                  <div
                    key={slide.id}
                    className="slide"
                    style={{ backgroundColor: slide.bgColor }}
                  >
                    <a
                      href={slide.href || buildCategoryPath("Khuyến mãi")}
                      className="slide-link"
                      title={slide.title || heroSliderTabs[index]?.line1 || `Slide ${index + 1}`}
                      aria-label={slide.title || heroSliderTabs[index]?.line1 || `Xem banner ${index + 1}`}
                    >
                      <img
                        src={slide.image}
                        alt={heroSliderTabs[index]?.line1 || `Slide ${index + 1}`}
                      />
                    </a>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="slider-nav prev"
                aria-label="Banner trước"
                onClick={() =>
                  setCurrentSlide((prev) =>
                    prev === 0 ? heroSlides.length - 1 : prev - 1,
                  )
                }
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                className="slider-nav next"
                aria-label="Banner tiếp theo"
                onClick={() =>
                  setCurrentSlide((prev) => (prev + 1) % heroSlides.length)
                }
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <div className="slider-tabs" role="tablist">
                {heroSliderTabs.map((tab, idx) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`slider-tab ${currentSlide === idx ? "active" : ""}`}
                    onClick={() => setCurrentSlide(idx)}
                    role="tab"
                    aria-selected={currentSlide === idx}
                    aria-label={`${tab.line1} - ${tab.line2}`}
                  >
                    <span className="tab-line1">{tab.line1}</span>
                    <span className="tab-line2">{tab.line2}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mini-banners">
              {subBanners.map((banner) => (
                <a
                  href={banner.href || getCategoryTopicPath("Khuyến mãi", banner.title || banner.alt || "Khuyến mãi CellphoneS")}
                  key={banner.id}
                  className="mini-banner-item"
                  title={banner.alt || banner.title || "Xem sản phẩm"}
                  aria-label={banner.alt || banner.title || "Xem sản phẩm từ banner"}
                >
                  <img src={banner.image} alt={banner.alt} />
                </a>
              ))}
            </div>
          </div>

          {/* ================= THÀNH PHẦN 4: TIỆN ÍCH SIDEBAR PHẢI ================= */}
          <div className="hero-right">
            <div className="welcome-card">
              <a
                href={currentUser ? "/smember?tab=profile" : "/smember/login"}
                className="welcome-top-info welcome-profile-link"
                aria-label={currentUser ? "Mở thông tin tài khoản" : "Đăng nhập Smember"}
              >
                <div className="mascot-pink-circle">
                  <img
                    src="https://cellphones.com.vn/media/wysiwyg/ant-smile.png"
                    alt="Mascot"
                  />
                </div>
                <div className="welcome-heading-text">
                  {currentUser
                    ? `Xin chào, ${displayName}`
                    : "Chào mừng bạn đến với CellphoneS"}
                </div>
              </a>
              {currentUser ? (
                <>
                  <p className="welcome-desc-text">
                    Tài khoản Smember đã đăng nhập. Bạn có thể dùng ưu đãi và
                    theo dõi đơn hàng.
                  </p>
                  <div className="welcome-user-tags">
                    <span>{currentUser.email || currentUser.username}</span>
                    {currentUser.role && <span>{currentUser.role}</span>}
                  </div>
                </>
              ) : (
                <>
                  <p className="welcome-desc-text">
                    Nhập hội thành viên Smember để không bỏ lỡ các ưu đãi hấp
                    dẫn.
                  </p>
                  <div className="welcome-auth-links-row">
                    <button
                      type="button"
                      className="link-red-bold link-button-reset"
                      onClick={onGoLogin}
                    >
                      Đăng nhập
                    </button>
                    <span className="text-gray-normal">hoặc</span>
                    <button
                      type="button"
                      className="link-red-bold link-button-reset"
                      onClick={onGoRegister}
                    >
                      Đăng ký
                    </button>
                  </div>
                </>
              )}
              <a href="/smember?tab=rank" className="welcome-footer-perks-btn">
                <div className="footer-perks-left">
                  <GiftRedIcon />
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "600",
                      color: "#334155",
                      marginLeft: "6px",
                    }}
                  >
                    Xem ưu đãi Smember
                  </span>
                </div>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#d70018"
                  strokeWidth="3"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </a>
            </div>

            <div className="benefits-scroller-container-card">
              {/* Nhóm 1: Giáo dục */}
              <div className="benefit-scroller-group">
                <div className="benefit-group-gray-header">
                  Ưu đãi cho giáo dục
                </div>
                <ul className="benefit-scroller-list-items">
                  <li>
                    <a href="/smember?tab=education">
                      <GraduationCapIcon />
                      <span>
                        Đăng ký <b>nhận ưu đãi</b>
                      </span>
                    </a>
                  </li>
                  <li>
                    <a href="/smember?tab=education">
                      <GraduationCapIcon />
                      <span>
                        Deal hot <b>học sinh sinh viên</b>
                      </span>
                    </a>
                  </li>
                  <li>
                    <a href="/smember?tab=education">
                      <GraduationCapIcon />
                      <span>
                        Laptop <b>ưu đãi khủng</b>
                      </span>
                    </a>
                  </li>
                </ul>
              </div>

              <div className="benefit-scroller-group">
                <div className="benefit-group-gray-header">
                  Thu cũ lên đời giá hời
                </div>
                <ul className="benefit-scroller-list-items">
                  <li>
                    <a href="/thu-cu-doi-moi/trade-in-iphone">
                      <TradeInIcon />
                      <span>
                        iPhone <b>trợ giá đến 3 triệu</b>
                      </span>
                    </a>
                  </li>
                  <li>
                    <a href="/thu-cu-doi-moi/trade-in-samsung">
                      <TradeInIcon />
                      <span>
                        Samsung <b>trợ giá đến 4 triệu</b>
                      </span>
                    </a>
                  </li>
                </ul>
              </div>

              {/* Nhóm 3: Doanh nghiệp */}
              <div className="benefit-scroller-group">
                <div className="benefit-group-gray-header">
                  Khách hàng doanh nghiệp (B2B)
                </div>
                <ul className="benefit-scroller-list-items">
                  <li>
                    <a href="/smember?tab=business">
                      <BriefcaseIcon />
                      <span>
                        Đăng ký <b>S-Business</b>
                      </span>
                    </a>
                  </li>
                  <li>
                    <a href="/smember?tab=business">
                      <BriefcaseIcon />
                      <span>
                        Chính sách <b>ưu đãi</b>
                      </span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="sidebar-absolute-bottom-banner">
              <a href="/khuyen-mai/hang-moi-ve">
                <img
                  src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/promotion_banner04.png"
                  alt=""
                />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// ==================== TOÀN BỘ MẢNG DATA ĐÃ ĐƯỢC SẮP XẾP =====================
// ============================================================================

/* --- 0. MẢNG DỮ LIỆU BỔ SUNG: DANH MỤC KHUYẾN MÃI (CHUẨN XÁC HÌNH 1) --- */
const promoMainItems = [
  { name: "Hotsale cuối tuần", span: 3 },
  { name: "Ưu đãi thanh toán", span: 3 },
  { name: "Trả góp 3 Không", badge: "Hot", span: 3 },
  { name: "Đặc quyền online ưu đãi đến 50%++", span: 6 },
  { name: "Tặng voucher 10% khi mua điện thoại - laptop", span: 6 },
  { name: "Khách hàng doanh nghiệp B2B", span: 6 },
];

const promoTradeInItems = [
  { name: "iPhone 16 Series trợ giá đến 3 triệu" },
  { name: "S25 Series trợ giá 1 triệu" },
  { name: "Xiaomi 15 trợ giá đến 3 triệu" },
  { name: "Laptop trợ giá đến 4 triệu" },
];

const promoMemberItems = [{ name: "Chính sách Smember 2026", badge: "Mới" }];

const promoStudentItems = [
  { name: "Nhập hội S-Student", span: 3 },
  { name: "Đăng ký S-Student", badge: "Hot", span: 3 },
  { name: "Laptop giảm thêm đến 500K", span: 6 },
  { name: "Điện thoại giảm thêm đến 7%", span: 6 },
  { name: "Loa - tai nghe giảm thêm đến 5%", span: 6 },
  { name: "Hàng cũ giảm thêm 10%", badge: "Hot", span: 6 },
];

/* --- 1. DANH MỤC: ĐIỆN THOẠI, TABLET --- */
const hotPhoneModels = [
  { name: "iPhone 17", badge: "Mới", span: 3 },
  { name: "iPhone 17 Pro", badge: "Hot", span: 3 },
  { name: "iPhone 17 Pro Max", badge: "Hot", span: 2 },
  { name: "iPhone 17e", span: 2 },
  { name: "iPhone Air", span: 2 },
  { name: "iPhone 16 Pro Max", span: 3 },
  { name: "Galaxy S26 Ultra", badge: "Hot", span: 3 },
  { name: "Galaxy S26", span: 3 },
  { name: "Galaxy Z Fold7", span: 3 },
  { name: "Galaxy S25 Edge", span: 3 },
  { name: "OPPO Find X9 Ultra", badge: "Mới", span: 3 },
  { name: "OPPO Find N6", span: 2 },
  { name: "OPPO Reno15", span: 2 },
  { name: "Xiaomi 17T", badge: "Mới", span: 2 },
  { name: "POCO X8 Pro Max", span: 3 },
  { name: "HONOR 600 5G", badge: "Mới", span: 3 },
  { name: "HONOR X9d 5G", badge: "Hot", span: 3 },
  { name: "TECNO Spark 50", badge: "Mới", span: 3 },
  { name: "Nubia Neo 5 5G", span: 3 },
  { name: "Huawei Mate X7", span: 3 },
];

/* --- 2. DANH MỤC: LAPTOP --- */
const laptopNeedsData = [
  {
    name: "Văn phòng",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Group_846.png",
  },
  {
    name: "Gaming",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Group_848_2.png",
  },
  {
    name: "Mỏng nhẹ",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_6__1.png",
  },
  {
    name: "Đồ họa - kỹ thuật",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_1__4.png",
  },
  {
    name: "Sinh viên",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_2__4.png",
  },
  {
    name: "Cảm ứng",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_4__4.png",
  },
  {
    name: "Laptop AI",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_5__3.png",
    badge: "Hot",
  },
];

const laptopChipsData = [
  { name: "Laptop Core i3", span: 3 },
  { name: "Laptop Core i5", span: 3 },
  { name: "Laptop Core i7", span: 3 },
  { name: "Laptop Core i9", span: 3 },
  { name: "Laptop Core U5", span: 3 },
  { name: "Laptop Core U7", span: 3 },
  { name: "Laptop Core U9", span: 3 },
  { name: "Apple M4 Series", span: 3 },
  { name: "Apple M5 Series", badge: "Mới", span: 3 },
  { name: "AMD Ryzen", span: 3 },
  { name: "Intel Core Ultra", badge: "Hot", span: 3 },
  { name: "A18 Pro", badge: "Mới", span: 3 },
];

/* --- 3. DANH MỤC: ÂM THANH, MIC THU ÂM --- */
const audioTypesSquare = [
  {
    name: "Bluetooth",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/tainghebluetooth.png",
  },
  {
    name: "Chụp tai",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/chup-taii.png",
  },
  {
    name: "Nhét tai",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/nhet-tai_2.png",
  },
  {
    name: "Có dây",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/coday.png",
  },
  {
    name: "Thể thao",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/thethao-removebg-preview.png",
  },
  {
    name: "Gaming",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/gaming-removebg-preview.png",
  },
];

const micTypesSquare = [
  {
    name: "Mic cài áo",
    query: "Microphone không dây",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/kep.png",
  },
  {
    name: "Mic phòng thu, podcast",
    query: "Podcast",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/phongthu.png",
  },
  {
    name: "Mic livestream",
    query: "Livestream",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/micthu.png",
  },
  {
    name: "Micro không dây",
    query: "Microphone không dây",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/image_2__4.png",
  },
];

const speakerTypesSquare = [
  {
    name: "Loa Bluetooth",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/loa-bluetooth.png",
  },
  {
    name: "Loa Karaoke",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/loa-karao.png",
  },
  {
    name: "Loa kéo",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/nhet-tai_2.png",
  },
  {
    name: "Loa Soundbar",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/loa-bar.png",
  },
  {
    name: "Loa vi tính",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Am-thanh/Loa/loa-vi-tinh.png",
  },
];

const hotAudioProducts = [
  { name: "AirPods Pro 3", category: "Tai nghe", badge: "Hot", span: 3 },
  { name: "AirPods 4", category: "Tai nghe", span: 3 },
  { name: "AirPods Max 2", category: "Tai nghe", badge: "Mới", span: 6 },
  { name: "Soundcore Liberty 5 Pro", category: "Tai nghe", span: 6 },
  { name: "Soundcore Liberty 5 Pro Max", category: "Tai nghe", span: 6 },
  { name: "Sony WF-1000XM6", category: "Tai nghe", badge: "Mới", span: 3 },
  { name: "Redmi Buds 8 Active", category: "Tai nghe", span: 3 },
  { name: "Huawei Freebuds Pro 5 (ANC)", category: "Tai nghe", badge: "Hot", span: 6 },
  { name: "Loa Bose Soundlink Flex 2", category: "Loa", span: 6 },
  { name: "Loa Samsung MX-T40", category: "Loa", span: 3 },
  { name: "Loa JBL Charge 6", category: "Loa", span: 3 },
  { name: "Loa Marshall Middleton", category: "Loa", badge: "Hot", span: 3 },
  { name: "Loa Sony ULT Field 1", category: "Loa", span: 3 },
];

/* --- 4. DANH MỤC: ĐỒNG HỒ, CAMERA --- */
const watchRowsData = [
  {
    name: "Đồng hồ thông minh",
    searchOptions: { q: "" },
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/nghe-goii.png",
  },
  {
    name: "Vòng đeo tay thông minh",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/thong-minhh.png",
  },
  {
    name: "Đồng hồ định vị trẻ em",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/tre-em.png",
  },
  {
    name: "Dây đồng hồ thông minh",
    category: "Dây đeo đồng hồ",
    searchOptions: { q: "" },
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/d/h/dhnn_11.png",
  },
];

const cameraTypesSquare = [
  {
    name: "Camera an ninh",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/camera-an-ninh.png",
  },
  {
    name: "Camera hành trình",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/camera-action.png",
  },
  {
    name: "Camera AI",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/camera-ai.png",
  },
  {
    name: "Máy ảnh",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/camera-may-anh.png",
  },
  {
    name: "Hành trình",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/camera-hanh-trinh.png",
  },
  {
    name: "Gimbal",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/camera-gimbal.png",
  },
  {
    name: "Tripod",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/camera-tripod.png",
  },
  {
    name: "Flycam",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/camera-flycam.png",
  },
];

const hotWatchProducts = [
  { name: "Apple Watch Series 11", badge: "Hot", span: 3 },
  { name: "Apple Watch SE 3", span: 3 },
  { name: "Apple Watch Ultra 3", span: 6 },
  { name: "Samsung Galaxy Watch 8", span: 6 },
  { name: "Amazfit T-Rex 3 Pro", badge: "Mới", span: 6 },
  { name: "HONMA X Huawei Watch GT6 Pro", badge: "Mới", span: 6 },
  { name: "Huawei Watch GT 6", badge: "Hot", span: 3 },
  { name: "Viettel MyKID 4G Lite", span: 3 },
  { name: "Garmin Forerunner 965", span: 3 },
  { name: "Huawei Band 11", span: 3 },
  { name: "Coros Pace 4", span: 6 },
];

const hotCameraProducts = [
  { name: "Camera an ninh Imou", span: 3 },
  { name: "Camera an ninh Ezviz", span: 3 },
  { name: "Camera an ninh Xiaomi", span: 6 },
  { name: "Camera an ninh TP-Link", span: 3 },
  { name: "Camera Tiandy", badge: "Hot", span: 3 },
  { name: "Camera DJI", span: 3 },
  { name: "Camera Insta360", span: 3 },
  { name: "Máy ảnh Fujifilm", span: 6 },
  { name: "Máy ảnh Canon", badge: "Hot", span: 3 },
  { name: "Máy ảnh Sony", badge: "Hot", span: 3 },
  { name: "Gopro Hero 13", span: 3 },
  { name: "Flycam dji", span: 3 },
  { name: "DJI Action 5 Pro", span: 3 },
  { name: "DJI Action 4", span: 3 },
];

/* --- 5. DANH MỤC: ĐỒ GIA DỤNG, LÀM ĐẸP --- */
const householdDevices = [
  {
    name: "Quạt",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/q/u/quat-dung-toshiba-f-lsa10-h-vn.png",
    badge: "Hot",
  },
  {
    name: "Robot hút bụi",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/r/o/robot-hut-bui-dreame-x60-ultra-3_1.jpg",
    badge: "Hot",
  },
  {
    name: "Máy chiếu",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-chieu-mini-beecube-x2-neo-1_1.jpg",
    badge: "Hot",
  },
  {
    name: "Máy lọc không khí",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-loc-khong-khi-lg-puricare-aero-hit-s35ggw10-abae_1.png",
  },
  {
    name: "Máy hút ẩm",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-hut-am-loc-khong-khi-sharp-dw-t30fv-h-30l_1_1.jpg",
  },
  {
    name: "Máy hút bụi cầm tay",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Web/icon/hut-bui-lau-nha-300x300.png",
  },
  {
    name: "TV Box",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/x/i/xiaomi-mi-box-s-4k-gen-3_2__1.png",
  },
  {
    name: "Máy sưởi - Quạt sưởi",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/menu-may-suoi-gom.png",
  },
  {
    name: "Bàn ủi",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/menu-ui-kho.png",
  },
];

const kitchenDevices = [
  {
    name: "Nồi chiên không dầu",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/menu-noi-chien-duoi-5-lit.png",
    badge: "Hot",
  },
  {
    name: "Nồi cơm điện",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/menu-com-nap-roi.png",
    badge: "Hot",
  },
  {
    name: "Máy xay sinh tố",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/menu-xay-da-nang.png",
  },
  {
    name: "Máy ép trái cây",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-ep-cham-nguyen-qua-fujihome-sj50c_2__1.png",
  },
  {
    name: "Máy làm sữa hạt",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-lam-sua-hat-bluestone-1-75-lit-blb-6033-2_1.png",
  },
  {
    name: "Bếp điện",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/b/e/bep-tu-don-fujihome-ic-h02_2_.png",
  },
  {
    name: "Ấm siêu tốc",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/h/_/h_2_3.png",
  },
  {
    name: "Nồi áp suất",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/n/o/noi-ap-suat-philips-hd2136-66_4.jpg",
  },
  {
    name: "Nồi nấu chậm",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_15_114.png",
  },
  {
    name: "Nồi lẩu điện",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/n/o/noi-lau-hai-ngan-bear-dhg-d65a1-6-5l_1.png",
  },
];

const beautyDevices = [
  {
    name: "Máy sấy tóc",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-say-toc-dreame-gleam.jpg",
  },
  {
    name: "Máy massage",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/menu-massage.png",
  },
  {
    name: "Máy cạo râu",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-cao-rau-philips-pq206-18-2_1.png",
  },
  {
    name: "Cân sức khỏe",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/c/a/can-dien-tu-thong-minh-eufy-c20_1.jpg",
  },
  {
    name: "Bàn chải điện",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/menu-ban-chai.png",
  },
  {
    name: "Máy tăm nước",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-tam-nuoc-xiaomi-water-flosser-2_2__1.png",
  },
  {
    name: "Tông đơ cắt tóc",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:50/plain/https://media-asset.cellphones.com.vn/page_configs/01KRJVMDJ12CKYC7GHY4HYCKHK.png",
  },
  {
    name: "Máy tỉa lông mũi",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-tia-long-mui-tai-may-philips-nt3650-16-2_1.png",
  },
  {
    name: "Máy rửa mặt",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-rua-mat-halio-sensitive-facial-cleansing-massaging-device_2.png",
  },
  {
    name: "Máy tạo kiểu tóc",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/i/m/image_1467.png",
  },
  {
    name: "Máy triệt lông",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-triet-long-halio-ipl-cooling-hair-removal-device-nang-cap_1__1.png",
  },
  {
    name: "Máy đo huyết áp",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-do-huyet-ap-bap-tay-microlife-b6-advanced-connect_3_.png",
  },
];

const hotApplianceProducts = [
  { name: "Robot hút bụi Ecovacs T80S Omni", span: 6 },
  { name: "Robot hút bụi Ecovacs Deebot T90 Pro Omni", span: 6 },
  { name: "Máy lau sàn hút bụi Tineco", span: 6 },
  { name: "Máy lọc không khí Dyson", span: 6 },
  { name: "Hút bụi cầm tay Dyson", span: 6 },
  { name: "Máy lọc không khí Xiaomi Air Purifier Max", span: 6 },
  { name: "Robot hút bụi Roborock Q Revo 5AE", span: 6 },
  { name: "Robot hút bụi Dreame X50 Ultra", span: 6 },
  { name: "Máy chiếu hiệu Wanbo X5 Pro", span: 6 },
  { name: "Quạt thông minh Xiaomi", span: 6 },
];

/* --- 6. DANH MỤC: PHỤ KIỆN --- */
const mobileAccessories = [
  {
    name: "Phụ kiện Apple",
    img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRbqtaDokkgUBA_A_oRmdF_rn8t4NqgNRoeVPeMz_Q-Eg&s=10",
  },
  {
    name: "Dán màn hình",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_-_2025-11-13t102809.632.png",
  },
  {
    name: "Ốp lưng - Bao da",
    img: "https://cdn2.cellphones.com.vn/358x/media/catalog/product/o/p/op-lung-iphone-16-plus-mipow-premium-slim-with-magsafe_3__1.png",
  },
  {
    name: "Thẻ nhớ",
    img: "https://cdn2.cellphones.com.vn/x/media/catalog/product/e/x/extreme-a2-128-01-65a02900-589b-4ad1-a371-257847c79a24.jpg",
  },
  {
    name: "Apple Care+",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/d/i/dich-vu-apple-care-plus-mac-mini.png",
  },
  {
    name: "Samsung Care+",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/d/i/dich-vu-samsung-care-plus-galaxy-s25-series-2-nam_1_1.png",
  },
  { name: "Sim 4G - 5G", img: "https://bna.1cdn.vn/2026/06/26/anh-1.jpg" },
  {
    name: "Cáp, sạc",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/cap-sac-co-cap-sac.png",
  },
  {
    name: "Pin dự phòng",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/g/r/group_563_-_2025-07-28t095905.381_1.png",
  },
  {
    name: "Trạm sạc dự phòng",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/r/tram-sac-du-phong-ecoflow-trail-300-dc-288wh-300w_2__1.png",
  },
  {
    name: "Dây đeo chéo điện thoại",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/d/a/day-deo-xd_1.png",
  },
  {
    name: "Phụ kiện điện thoại",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/o/p/op-lung-iphone-16-pro-make-hello_-_2026-04-14t150634.152_1.png",
  },
];

const pcAccessories = [
  {
    name: "Chuột, bàn phím",
    img: "https://thienanjsc.com.vn/media/product/10340_km600_1.jpg",
  },
  {
    name: "Balo Laptop | Túi chống sốc",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/phu-kien-balo.png",
  },
  {
    name: "Phần mềm",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/p/h/phan-mem-microsoft-office-home-business-2024-ep2-06604-key-dien-tu_1_.png",
  },
  {
    name: "Webcam",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/w/e/webcam-rapoo-c260-fullhd-1080p-2_.jpg",
  },
  {
    name: "Giá đỡ",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/g/i/gia-do-laptop-macbook-havit-st7304_4_.png",
  },
  {
    name: "Thảm, lót chuột",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/a/tam-lot-chuot-logitech-studio-series-20-23-cm-1_1.png",
  },
  {
    name: "Sạc laptop",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/s/a/sac-laptop-hp-type-c-19-5v-3-34a-65w_1_.png",
  },
  {
    name: "Camera phòng họp",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/c/a/camera-phong-hop-maxhub-uc-p15-full-hd-1080p.png",
  },
  {
    name: "Hub chuyển đổi",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/h/u/hub-chuyen-doi-hyperdrive-bar-type-c-6-in-1-hd22e_2_.png",
  },
];

const networkDevices = [
  {
    name: "Thiết bị phát sóng WiFi",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/thiet-bi-phat-song-wifi-router-wifi.png",
  },
  {
    name: "Bộ phát wifi di động",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/7/m7350_un_4.0_01_normal_1510907176979a.jpg",
  },
  {
    name: "Bộ kích sóng WiFi",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/l/tl-wa850re3.jpg",
  },
  {
    name: "Hub-Switch",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/s/w/switch-mercusys-ms106lp-6-cong-10-100mbps-4-cong-poe_2__1.png",
  },
  {
    name: "USB wifi",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/l/tl-wn725n_eu_3.0_01_large_1506586609631p.jpg",
  },
  {
    name: "Card mạng",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/c/a/card-mang-tp-link-ax3000-archer-tx55e-wi-fi-6-bluetooth-5-2_2__1.png",
  },
];

const storageDevices = [
  {
    name: "Thẻ nhớ",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/h/the-nho-sdhc-sandisk-extreme-pro-u3-64gb-v30-200mbs_3_.png",
  },
  {
    name: "USB",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_19__1_6.png",
  },
  {
    name: "Ổ cứng di động",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/e/x/extreme-usb-3-2-ssd-front.png.wd_1.png",
  },
];

const otherAccessories = [
  {
    name: "PlayStation",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-choi-game-sony-playstation-5-slim-asia-00497-2-tay-cam-1.jpg",
  },
  {
    name: "ROG Ally",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/a/s/asus_rog_ally_-11_1.png",
  },
  {
    name: "Dây đeo đồng hồ",
    img: "https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/watch-bands-og-image-202509?wid=1200&hei=630&fmt=jpeg&qlt=90&.v=1772492269963",
  },
  {
    name: "Bút cảm ứng",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_-_2025-06-30t230903.199_1.png",
  },
  {
    name: "Giá đỡ điện thoại",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/g/i/gia-do-dien-thoai-may-tinh-bang-ugreen-lp406_3_.png",
  },
  {
    name: "Túi chống nước",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_-_2025-07-02t172035.867_1.png",
  },
  {
    name: "Phụ kiện ô tô",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/b/o/bom-lop-dien-tu-thong-minh-vietmap-mf139-13-000ma_3__1.png",
  },
  {
    name: "Thiết bị định vị",
    img: "https://cdn2.cellphones.com.vn/358x/media/catalog/product/t/h/thiet-bi-dinh-vi-momax-pinpop-lite-find-my-br10_1_1.png",
  },
];

const hotAccessoryProducts = [
  {
    name: "Ốp lưng iPhone 17",
    badge: "Mới",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/o/p/op-lung-iphone-12-14-15-se-4-zagg-crystal-palace-lite-clear_4__1.png",
  },
  {
    name: "Dán màn hình iPhone 17",
    badge: "Mới",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_-_2025-11-13t102809.632.png",
  },
  {
    name: "Ốp lưng S26 Series",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/o/p/op-lung-samsung-galaxy-s26-ultra-slimcase-unique-with-magsafe-clear_2_.png",
  },
  {
    name: "Dán màn hình S26 Series",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/k/i/kinh-cuong-luc-samsung-galaxy-s26-ultra-zagg-invisibleshield-glass-xtr5-co-khay-dan_5_.png",
  },
  {
    name: "Quạt cầm tay | Quạt mini",
    badge: "Hot",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/quat-cam-tay-new.png",
  },
  {
    name: "Dán MacBook Neo",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/o/p/op-lung-iphone-16-pro-hong_16_.png",
  },
  {
    name: "Gậy chụp ảnh",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_39__14.png",
  },
  {
    name: "Kính thông minh",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_-_2025-12-03t140858.504.png",
  },
  {
    name: "Tay cầm chụp ảnh",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/a/tay-cam-telesin-fun-shot-magnetic-grip-2_2_.png",
  },
  {
    name: "Ống kính camera điện thoại",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/s/s/ssss_1_112.png",
  },
];

/* --- 7. DANH MỤC: PC, MÀN HÌNH, MÁY IN --- */
const pcTypeRows = [
  {
    name: "Build PC",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_2__10.png",
  },
  {
    name: "Cấu hình sẵn",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_7__2_165_6.png",
  },
  {
    name: "All In One",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-tinh-aio-asus-p440vak-wpc043w_2__1.png",
  },
  {
    name: "PC bộ",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/p/c/pc-rosa-office-amd-r5-5500gt_3_.png",
  },
];

const pcNeedRows = [
  {
    name: "Gaming",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_7__2_165_12.png",
  },
  {
    name: "Đồ họa",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_15__7_240_1.png",
  },
  {
    name: "Văn phòng",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/s/s/ssss_1_82_1.png",
  },
];

const pcHardwareComponents = [
  {
    name: "CPU",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_1680.png",
  },
  {
    name: "Main",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/mainboard-msi-pro-b760m-a-wifi-ddr4_6_.png",
  },
  {
    name: "RAM",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_12_.png",
  },
  {
    name: "Ổ cứng",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_13_.png",
  },
  {
    name: "Nguồn",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/n/g/nguon-may-tinh-jetek-elite-v6-e350-350w_2_.png",
  },
  {
    name: "VGA",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_3__3.png",
  },
  {
    name: "Tản nhiệt",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/a/tan-nhiet-nuoc-xigmatek-fenix-ii-240_2_.png",
  },
  {
    name: "Case",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_44__2_17.png",
  },
];

const monitorNeedsRows = [
  {
    name: "Gaming",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_2__9_234.png",
  },
  {
    name: "Văn phòng",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_19__4_3.png",
  },
  {
    name: "Đồ họa",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/s/s/ssss_1_2.png",
  },
  {
    name: "Lập trình",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/man-hinh-lap-trinh-benq-rd280ua-28-inch_3_.png",
  },
  {
    name: "Màn hình di động",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_2__7_43.png",
  },
  {
    name: "Arm màn hình",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/g/i/gia-djo-man-hinh-djoi-human-moti_1__1.png",
  },
];

const pcGamingGearRows = [
  {
    name: "PlayStation",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-choi-game-sony-playstation-5-slim-3.png",
  },
  {
    name: "ROG Ally",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/a/s/asus_rog_ally_-11.png",
  },
  {
    name: "Bàn phím Gaming",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/b/a/ban-phim-co-rapoo-aesco-a67-esport-rapid-trigger-hotswap-den.jpg",
  },
  {
    name: "Chuột chơi game",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/3/c/3c42e4219bbaa920c07c54784edd6269.jpg",
  },
  {
    name: "Tai nghe Gaming",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/a/tai-nghe-chup-tai-asus-tuf-h1-gen-2_1_.png",
  },
  {
    name: "Tay cầm chơi game",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/a/tay-cam-choi-game-msi-gc300_2_.png",
  },
];

const officeDeviceRows = [
  {
    name: "Máy in",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_13__6_15.png",
  },
  {
    name: "Phần mềm",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/h/thi_t_k_ch_a_c_t_n_19__1.png",
  },
  {
    name: "Bảng vẽ điện tử",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/b/a/bang-ve-dien-tu-xp-pen-deco-mini7-v2_2_.png",
  },
  {
    name: "Máy tính cầm tay",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_50__2_3.png",
  },
  {
    name: "Decor bàn làm việc",
    img: "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/b/a/bang-treo-do-xoay-hyperwork-omni-board-hpw-pg03_3_.png",
  },
];

/* --- 8. DANH MỤC: TIVI, ĐIỆN MÁY --- */
const hotTvProducts = [
  {
    name: "Máy lạnh Daikin 1.5HP 2025",
    query: "Máy lạnh Daikin 1.5HP",
    category: "Máy lạnh",
    image: "https://cdn2.cellphones.com.vn/x/media/catalog/product/m/_/m_y_l_nh_2__1_1.png",
    badge: "Hot",
  },
  {
    name: "Tủ lạnh Toshiba ngăn đá dưới 325L",
    query: "Tủ lạnh Toshiba ngăn đá dưới",
    category: "Tủ lạnh",
    image: "https://cdn2.cellphones.com.vn/x/media/catalog/product/t/u/tu-lanh-toshiba-inverter-325-lit-gr-rb410we-pmv-37-sg_1_.png",
    badge: "Mới",
  },
  {
    name: "Máy giặt Panasonic cửa ngang",
    query: "Máy giặt Panasonic cửa ngang",
    category: "Máy giặt",
    image: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/may-giat-cua-truoc.png",
  },
  {
    name: "Smart Tivi NanoCell LG 4K 55 inch",
    query: "Tivi LG 55 inch",
    category: "Tivi",
    image: "https://cdn2.cellphones.com.vn/x/media/catalog/product/6/5/65578dfv.png",
  },
];

/* --- 9. DANH MỤC: THU CŨ ĐỔI MỚI --- */
const tradeInBrands = [
  "Thu cũ iPhone",
  "Thu cũ Samsung",
  "Thu cũ Xiaomi",
  "Thu cũ Laptop",
  "Thu cũ Mac",
  "Thu cũ iPad",
  "Thu cũ đồng hồ",
  "Thu cũ Apple Watch",
];

const tradeInSubsidy = [
  "iPhone 17 Pro Max » 3 triệu",
  "Xiaomi 17 Ultra » 6 triệu",
  "OPPO Find X9 » 6 triệu",
  "HONOR 400 Pro » 3 triệu",
  "Galaxy Z7 Series » 3 triệu",
  "Galaxy S25 Series series » 3 triệu",
  "Macbook » 3 triệu",
  "Laptop » 4 triệu",
];

const tradeInHighValue = [
  "iPhone 17 Pro Max",
  "iPhone 15 Pro Max",
  "iPhone 14 Pro Max",
  "Samsung Galaxy Z Fold 7",
  "Samsung Galaxy Z Flip 7",
  "Samsung Galaxy S24 Ultra",
  "Xiaomi 17 Ultra",
  "Xiaomi 15",
  "Macbook Pro M5",
  "Macbook Air M5",
];
