import { useState, useEffect } from 'react';
import './HeroSection.css';
import { categories, heroSlides, heroSliderTabs, subBanners, promoStripBanners } from '../../data/mockData';

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
      <div className="container hero-inner">
        {/* Left: Category Sidebar */}
        <div className="hero-sidebar">
          <ul className="category-menu">
            {categories.map(cat => (
              <li key={cat.id} className="category-item">
                <a href="#">
                  <div className="category-item-left">
                    <img src={cat.icon} alt="" className="category-icon" onError={(e) => { e.target.style.display = 'none'; }} />
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
                  <img src={slide.image} alt={`Slide ${index + 1}`} />
                </div>
              ))}
            </div>
            
            {/* Slider Navigation Buttons */}
            <button 
              className="slider-nav prev"
              onClick={() => setCurrentSlide(prev => prev === 0 ? heroSlides.length - 1 : prev - 1)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <button 
              className="slider-nav next"
              onClick={() => setCurrentSlide(prev => (prev + 1) % heroSlides.length)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
            
            {/* Slider Tabs */}
            <div className="slider-tabs">
              {heroSliderTabs.map((tab, idx) => (
                <div 
                  key={tab.id} 
                  className={`slider-tab ${currentSlide === idx ? 'active' : ''}`}
                  onClick={() => setCurrentSlide(idx)}
                >
                  <span className="tab-line1">{tab.line1}</span>
                  <span className="tab-line2">{tab.line2}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Promo Strip below slider */}
          <div className="promo-strip">
            {promoStripBanners.map(banner => (
              <img key={banner.id} src={banner.image} alt="Promo" className="promo-strip-img" />
            ))}
          </div>
        </div>

        {/* Right: Sub Banners & Widgets */}
        <div className="hero-right">
          <div className="sub-banners">
            {subBanners.map(banner => (
              <a href="#" key={banner.id} className="sub-banner-item">
                <img src={banner.image} alt="Promotion banner" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
