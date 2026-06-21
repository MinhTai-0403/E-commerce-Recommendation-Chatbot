import { useState } from 'react';
import './Header.css';
import { categories } from '../../data/mockData';

export function TopBar() {
  return (
    <div className="topbar">
      <div className="container topbar-inner">
        <div className="topbar-left">
          <div className="topbar-marquee-track">
            <div className="topbar-marquee-content">
              <span className="topbar-item">
                <span className="topbar-icon">📋</span>
                Cuất VAT <strong>đầy đủ</strong>
              </span>
              <span className="topbar-dot">•</span>
              <span className="topbar-item">
                <span className="topbar-icon">🚚</span>
                Giao nhanh - Miễn phí <strong>cho đơn 300k</strong>
              </span>
              <span className="topbar-dot">•</span>
              <span className="topbar-item">
                <span className="topbar-icon">♻️</span>
                Thu cũ <strong>giá ngon</strong> - Lên đời <strong>tiết kiệm</strong>
              </span>
              <span className="topbar-dot">•</span>
              <span className="topbar-item">
                <span className="topbar-icon">✅</span>
                Sản phẩm <strong>Chính hãng - X</strong>
              </span>
              <span className="topbar-dot">•</span>
              <span className="topbar-item">
                <span className="topbar-icon">📍</span>
                Cửa hàng gần bạn
              </span>
              <span className="topbar-dot">•</span>
              <span className="topbar-item">
                <span className="topbar-icon">📝</span>
                Tra cứu đơn hàng
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MainHeader() {
  const [showCategories, setShowCategories] = useState(false);

  return (
    <header className="main-header">
      <div className="container header-inner">
        {/* Logo */}
        <a href="/" className="header-logo">
          <span className="logo-cellphone">cellphone</span>
          <span className="logo-s">S</span>
        </a>

        {/* Category Button */}
        <div className="header-category-wrapper"
          onMouseEnter={() => setShowCategories(true)}
          onMouseLeave={() => setShowCategories(false)}
        >
          <button className="header-outlined-btn" id="category-menu-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <span>Danh mục</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {showCategories && (
            <div className="header-category-dropdown">
              {categories.map(cat => (
                <a key={cat.id} href="#" className="category-dropdown-item">
                  <img src={cat.icon} alt="" className="category-dropdown-icon" onError={(e) => { e.target.style.display = 'none'; }} />
                  <span className="category-name">{cat.name}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Location */}
        <button className="header-outlined-btn header-location-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span>Hồ Chí Minh</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {/* Search */}
        <div className="header-search" id="header-search">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Bạn muốn mua gì hôm nay?"
            className="search-input"
          />
        </div>

        {/* Right Actions */}
        <div className="header-actions">
          <a href="#" className="header-cart-btn" id="header-cart-btn">
            <span>Giỏ hàng</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1"/>
              <circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
          </a>

          <a href="#" className="header-login-btn" id="header-login-btn">
            <span>Đăng nhập</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
