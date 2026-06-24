import { useState, useEffect } from "react";
import "./HeroSection.css"; // ĐỂ ĐÂY: Fix triệt để lỗi gõ nhầm Header.css cũ gây crash Vite
import {
  categories,
  heroSlides,
  heroSliderTabs,
  subBanners,
} from "../../data/mockData";

export default function HeroSection() {
  const [currentSlide, setCurrentSlide] = useState(0);

  // Tự động chạy Slider Banner chính
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="hero-section section-gap">
      <div className="container">
        <div className="hero-inner">
          {/* THANH SIDEBAR DANH MỤC DỌC CỐ ĐỊNH DUY NHẤT BÊN TRÁI */}
          <div className="hero-sidebar">
            <ul className="category-menu">
              {categories.map((cat) => (
                <li key={cat.id} className="category-item">
                  <a href="#">
                    <div className="category-item-left">
                      <img className="category-icon" src={cat.icon} alt="" />
                      <span>{cat.name}</span>
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
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Khối Slider ảnh ở giữa */}
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
                    <img
                      src={slide.image}
                      alt={heroSliderTabs[index]?.line1 || `Slide ${index + 1}`}
                    />
                  </div>
                ))}
              </div>

              <button
                className="slider-nav prev"
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
                className="slider-nav next"
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
                    className={`slider-tab ${currentSlide === idx ? "active" : ""}`}
                    onClick={() => setCurrentSlide(idx)}
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
                  href="#promotions"
                  key={banner.id}
                  className="mini-banner-item"
                >
                  <img src={banner.image} alt={banner.alt} />
                </a>
              ))}
            </div>
          </div>

          {/* Khối thông tin nhỏ bên phải */}
          <div className="hero-right">
            <div className="welcome-card">
              <div className="welcome-title">
                <img
                  src="https://cdn2.cellphones.com.vn/insecure/rs:fill:0:0/q:50/plain/https://cellphones.com.vn/media/wysiwyg/ant-smile.png"
                  alt=""
                />
                Chào mừng bạn đến với CellphoneS
              </div>
              <p>
                Nhập hội thành viên Smember để không bỏ lỡ các ưu đãi hấp dẫn.
              </p>
              <a href="#login">
                Đăng nhập <span>hoặc</span> Đăng ký
              </a>
            </div>
            <div className="benefit-group education-benefit">
              <h3>Ưu đãi cho giáo dục</h3>
              <a href="#student">Đăng ký nhận ưu đãi</a>
              <a href="#student">Deal hot học sinh sinh viên</a>
            </div>
            <div className="benefit-group trade-benefit">
              <h3>Thu cũ lên đời giá hời</h3>
              <a href="#trade-in">iPhone trợ giá đến 3 triệu</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
