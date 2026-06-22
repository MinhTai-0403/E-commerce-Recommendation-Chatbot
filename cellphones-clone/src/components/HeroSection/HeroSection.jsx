import { useState, useEffect } from 'react';
import './HeroSection.css';
import { categories, heroSlides, heroSliderTabs, subBanners, promoStripBanners } from '../../data/mockData';

function GiftIcon() {
  return (
    <svg viewBox="0 0 19 18" fill="none" aria-hidden="true">
      <path fill="currentColor" d="M2 11.25h6.75V18h-3A3.75 3.75 0 0 1 2 14.25v-3Zm16.5-3a1.5 1.5 0 0 1-1.5 1.5h-6.75V6.718c-.252.02-.503.032-.75.032s-.498-.013-.75-.032V9.75H2a1.5 1.5 0 0 1-1.5-1.5 3 3 0 0 1 3-3h1.303a3.853 3.853 0 0 1-1.303-3 .75.75 0 0 1 1.5 0c0 1.966 1.778 2.647 3.13 2.88-.499-.884-.8-1.867-.88-2.88a2.25 2.25 0 1 1 4.5 0 6.999 6.999 0 0 1-.88 2.88C12.222 4.899 14 4.218 14 2.25a.75.75 0 1 1 1.5 0 3.853 3.853 0 0 1-1.303 3H15.5a3 3 0 0 1 3 3Zm-9.75-6c.09.797.346 1.567.75 2.26.404-.693.66-1.463.75-2.26a.75.75 0 1 0-1.5 0ZM10.25 18h3A3.75 3.75 0 0 0 17 14.25v-3h-6.75V18Z" />
    </svg>
  );
}

export default function HeroSection() {
  const [currentSlide, setCurrentSlide] = useState(0);

  // Auto slide
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
        {/* Left: Category Sidebar */}
        <div className="hero-sidebar">
          <ul className="category-menu">
            {categories.map(cat => (
              <li key={cat.id} className="category-item">
                <a href="#">
                  <div className="category-item-left">
                    <img className="category-icon" src={cat.icon} alt="" />
                    <span>{cat.name}</span>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Center: Slider */}
        <div className="hero-slider-wrapper">
          <div className="hero-slider">
            <div
              className="slider-track"
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {heroSlides.map((slide, index) => (
                <div key={slide.id} className="slide" style={{ backgroundColor: slide.bgColor }}>
                  <img src={slide.image} alt={heroSliderTabs[index]?.line1 || `Slide ${index + 1}`} />
                </div>
              ))}
            </div>
            
            {/* Slider Navigation Buttons */}
            <button 
              className="slider-nav prev"
              onClick={() => setCurrentSlide(prev => prev === 0 ? heroSlides.length - 1 : prev - 1)}
              aria-label="Banner trước"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <button 
              className="slider-nav next"
              onClick={() => setCurrentSlide(prev => (prev + 1) % heroSlides.length)}
              aria-label="Banner tiếp theo"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
            
            {/* Slider Tabs */}
            <div className="slider-tabs" role="tablist" aria-label="Khuyến mãi nổi bật">
              {heroSliderTabs.map((tab, idx) => (
                <button
                  key={tab.id} 
                  className={`slider-tab ${currentSlide === idx ? 'active' : ''}`}
                  onClick={() => setCurrentSlide(idx)}
                  role="tab"
                  aria-selected={currentSlide === idx}
                >
                  <span className="tab-line1">{tab.line1}</span>
                  <span className="tab-line2">{tab.line2}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div className="mini-banners">
            {subBanners.map(banner => (
              <a href="#promotions" key={banner.id} className="mini-banner-item">
                <img src={banner.image} alt={banner.alt} />
              </a>
            ))}
          </div>
        </div>

        <div className="hero-right">
          <div className="welcome-card">
            <div className="welcome-title">
              <img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:0:0/q:50/plain/https://cellphones.com.vn/media/wysiwyg/ant-smile.png" alt="" />
              Chào mừng bạn đến với CellphoneS
            </div>
            <p>Nhập hội thành viên Smember để không bỏ lỡ các ưu đãi hấp dẫn.</p>
            <a href="#login">Đăng nhập <span>hoặc</span> Đăng ký</a>
            <a className="welcome-offer" href="#smember"><GiftIcon /> Xem ưu đãi Smember <b>›</b></a>
          </div>
          <div className="benefit-group education-benefit">
            <h3>Ưu đãi cho giáo dục</h3>
            <a href="#student"><img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:18:18/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon_student_home_190825.png" alt="" /> Đăng ký nhận ưu đãi</a>
            <a href="#student"><img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:18:18/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon_student_home_190825.png" alt="" /> Deal hot học sinh sinh viên</a>
            <a href="#student"><img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:18:18/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon_student_home_190825.png" alt="" /> Laptop ưu đãi khủng</a>
          </div>
          <div className="benefit-group trade-benefit">
            <h3>Thu cũ lên đời giá hời</h3>
            <a href="#trade-in"><img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:18:18/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon_repeat_home_190825.png" alt="" /> iPhone trợ giá đến <b>3 triệu</b></a>
            <a href="#trade-in"><img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:18:18/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon_repeat_home_190825.png" alt="" /> Samsung trợ giá đến <b>4 triệu</b></a>
          </div>
          <div className="benefit-group business-benefit">
            <h3>Khách hàng doanh nghiệp (B2B)</h3>
            <a href="#business"><img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:18:18/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Icon_wrapper.png" alt="" /> Đăng ký S-Business</a>
            <a href="#business"><img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:18:18/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Icon_wrapper.png" alt="" /> Chính sách ưu đãi</a>
            <img className="business-promo" src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/promotion_banner04.png" alt="Hàng mới đổ bộ giảm đến 50%" />
          </div>
        </div>
        </div>

        <a href="#promotions" className="special-banner">
          <picture>
            <source media="(max-width: 640px)" srcSet={promoStripBanners[1].image} />
            <img src={promoStripBanners[0].image} alt="Khuyến mãi học sinh sinh viên" />
          </picture>
        </a>
      </div>
    </section>
  );
}
