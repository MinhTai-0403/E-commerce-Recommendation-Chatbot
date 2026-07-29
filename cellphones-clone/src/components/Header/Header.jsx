import { useEffect, useMemo, useState } from 'react';
import "./Header.css";
import { fetchSearchSuggestions } from '../../services/apiContent';
import { buildSearchPath } from '../../utils/linkRoutes';
import { PUBLIC_EXTERNAL_LINKS } from '../../utils/routeRegistry';

function StoreIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 25 25"
      fill="none"
      aria-hidden="true"
    >
      <path
        stroke="white"
        strokeLinecap="round"
        strokeWidth="1.5"
        d="M8.32 22.66h8.36c2.31 0 4.18-1.786 4.18-3.99v-4.877c0-.708.296-1.387.82-1.888 1.216-1.16 1.058-3.083-.332-4.048l-6.39-4.434a4.343 4.343 0 0 0-4.917 0L3.653 7.857c-1.391.965-1.55 2.888-.333 4.048.524.5.82 1.18.82 1.888v4.878c0 2.203 1.87 3.989 4.18 3.989Z"
      />
      <path
        fill="white"
        d="M8.9 12.916V9.66h7v2.816l-.987-1.222h-4.419V12l2.004 2.175-.128.183-3.47-1.441ZM8.9 18.778v-2.922l1.097 1.327h4.309V15.83l-1.95-2.236.135-.179 3.409 1.61v3.754h-7Z"
      />
    </svg>
  );
}

function OrderIcon() {
  return (
    <svg
      width="17"
      height="16"
      viewBox="0 0 17 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M9.833 2v2.667a.667.667 0 0 0 .667.666h2.667"
      />
      <path
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M13.167 8v4.667a1.187 1.187 0 0 1-2.067.933 1.1 1.1 0 0 0-1.733 0 1.1 1.1 0 0 1-1.734 0 1.1 1.1 0 0 0-1.733 0 1.187 1.187 0 0 1-2.067-.933V3.333A1.333 1.333 0 0 1 5.167 2h4.666l3.334 3.333v2.834"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M144.27,45.93a8,8,0,0,1,9.8-5.66,86.22,86.22,0,0,1,61.66,61.66,8,8,0,0,1-5.66,9.8A8.23,8.23,0,0,1,208,112a8,8,0,0,1-7.73-5.94,70.35,70.35,0,0,0-50.33-50.33A8,8,0,0,1,144.27,45.93Zm-2.33,41.8c13.79,3.68,22.65,12.54,26.33,26.33A8,8,0,0,0,176,120a8.23,8.23,0,0,0,2.07-.27,8,8,0,0,0,5.66-9.8c-5.12-19.16-18.5-32.54-37.66-37.66a8,8,0,1,0-4.13,15.46Zm81.94,95.35A56.26,56.26,0,0,1,168,232C88.6,232,24,167.4,24,88A56.26,56.26,0,0,1,72.92,32.12a16,16,0,0,1,16.62,9.52l21.12,47.15A16,16,0,0,1,109.39,104c-.18.27-.37.52-.57.77L88,129.45c7.49,15.22,23.41,31,38.83,38.51l24.34-20.71a8.12,8.12,0,0,1,.75-.56,16,16,0,0,1,15.17-1.4l47.24,21.17A16,16,0,0,1,223.88,183.08ZM208,181.07l-47.11-21.1-24.35,20.71a8.44,8.44,0,0,1-.74.56,16,16,0,0,1-15.75,1.14c-18.73-9.05-37.4-27.58-46.46-46.11a16,16,0,0,1,1-15.7,6.13,6.13,0,0,1,.57-.77L96,95.15l-21-47A40.2,40.2,0,0,0,40,88,128.14,128.14,0,0,0,168,216,40.21,40.21,0,0,0,208,181.07Z" />
    </svg>
  );
}

export function TopBar() {
  return (
    <div className="topbar">
      <div className="container topbar-inner">
        <div className="topbar-marquee">
          <div className="topbar-marquee-track">
            {[0, 1].map((groupIndex) => (
              <div
                className="topbar-benefit-group"
                key={groupIndex}
                aria-hidden={groupIndex === 1 ? "true" : undefined}
              >
                <div className="topbar-benefit-pair">
                  <span className="topbar-item">
                    Sản phẩm <strong>Chính hãng - Xuất VAT</strong> đầy đủ
                  </span>
                  <span className="topbar-separator" />
                  <span className="topbar-item">
                    <strong>Giao nhanh - Miễn phí</strong> cho đơn 300k
                  </span>
                  <span className="topbar-separator" />
                  <span className="topbar-item">
                    <strong>Thu cũ</strong> giá ngon - <strong>Lên đời</strong>{" "}
                    tiết kiệm
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <nav className="topbar-links" aria-label="Liên kết hỗ trợ">
          <a href="/dia-chi-cua-hang">
            <StoreIcon /> Cửa hàng gần bạn
          </a>
          <a href={PUBLIC_EXTERNAL_LINKS.smemberOrder}>
            <OrderIcon /> Tra cứu đơn hàng
          </a>
          <a href="tel:18002097">
            <PhoneIcon /> 1800 2097
          </a>
        </nav>
      </div>
    </div>
  );
}

export function MainHeader({
  activePopup,
  setActivePopup,
  selectedLocation,
  currentUser,
  cartCount = 0,
  onGoCart,
}) {
  const initialSearch = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('key') || params.get('keyword') || '';
  }, []);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [suggestions, setSuggestions] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const payload = await fetchSearchSuggestions(query, {
          limit: 5,
          location: selectedLocation,
          signal: controller.signal,
        });
        setSuggestions(payload.data || null);
        setSearchOpen(true);
      } catch (error) {
        if (error.name !== 'AbortError') setSuggestions(null);
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, selectedLocation]);

  const suggestionGroups = [
    ['Gợi ý tìm kiếm', suggestions?.intents || []],
    ['Danh mục liên quan', suggestions?.categories || []],
    ['Sản phẩm gợi ý', suggestions?.products || []],
    ['Bài viết liên quan', suggestions?.articles || []],
  ].filter(([, items]) => items.length > 0);

  const accountLabel = currentUser?.fullName
    ? currentUser.fullName.split(" ").slice(-2).join(" ")
    : currentUser?.email || "Đăng nhập";

  return (
    <header className="main-header">
      <div className="container header-inner">
        {/* Logo */}
        <a href="/" className="header-logo">
          <img
            className="header-logo-image header-logo-image-desktop"
            src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/Logo/Logo_CPS.png"
            alt="CellphoneS"
          />
          <img
            className="header-logo-image header-logo-image-mobile"
            src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/Logo/Logo-CPS-m.png"
            alt=""
            aria-hidden="true"
          />
        </a>

        {/* Nút Danh mục */}
        <div className="header-category-wrapper">
          <button
            type="button"
            className={`header-outlined-btn ${activePopup === "category" ? "active-popup-btn" : ""}`}
            id="category-menu-btn"
            aria-label="Mở danh mục sản phẩm"
            aria-expanded={activePopup === "category"}
            aria-controls="header-category-popup"
            onClick={(e) => {
              e.stopPropagation();
              setActivePopup(activePopup === "category" ? null : "category");
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>Danh mục</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* Nút vị trí chọn Tỉnh thành */}
        <button
          type="button"
          className={`header-outlined-btn header-location-btn ${activePopup === "location" ? "active-popup-btn" : ""}`}
          aria-label={`Chọn khu vực, hiện tại ${selectedLocation}`}
          aria-expanded={activePopup === "location"}
          onClick={(e) => {
            e.stopPropagation();
            setActivePopup(activePopup === "location" ? null : "location");
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{selectedLocation}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Search */}
        <form
          className="header-search"
          id="header-search"
          action="/catalogsearch/result"
          method="get"
          role="search"
          onSubmit={(event) => {
            const query = searchQuery.trim();
            event.preventDefault();
            if (query) window.location.assign(buildSearchPath(query));
          }}
        >
          <svg
            className="search-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#999"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            name="q"
            placeholder="Bạn muốn mua gì hôm nay?"
            className="search-input"
            value={searchQuery}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={searchOpen}
            aria-controls="header-search-suggestions"
            onChange={(event) => setSearchQuery(event.target.value)}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearchOpen(false);
            }}
          />
          {searchOpen && searchQuery.trim().length >= 2 && (
            <div
              className="header-search-suggestions"
              id="header-search-suggestions"
              role="listbox"
            >
              {searchLoading && <div className="header-search-status">Đang tìm gợi ý...</div>}
              {!searchLoading && suggestionGroups.length === 0 && (
                <a className="header-search-status" href={buildSearchPath(searchQuery)}>
                  Xem tất cả kết quả cho “{searchQuery.trim()}”
                </a>
              )}
              {!searchLoading && suggestionGroups.map(([label, items]) => (
                <section className="header-suggestion-group" key={label}>
                  <strong>{label}</strong>
                  {items.map((item) => (
                    <a
                      href={item.path || buildSearchPath(item.label || item.name)}
                      key={`${label}-${item.id || item.path || item.label || item.name}`}
                      role="option"
                      onClick={() => setSearchOpen(false)}
                    >
                      {item.image && <img src={item.image} alt="" loading="lazy" />}
                      <span>
                        <b>{item.label || item.name}</b>
                        {item.priceLabel && <small>{item.priceLabel}</small>}
                      </span>
                    </a>
                  ))}
                </section>
              ))}
              <a className="header-search-all" href={buildSearchPath(searchQuery)}>
                Xem tất cả kết quả
              </a>
            </div>
          )}
        </form>

        {/* Right Actions */}
        <div className="header-actions">
          <a
            href="/cart"
            className="header-cart-btn"
            id="header-cart-btn"
            onClick={(event) => {
              if (!onGoCart) return;
              event.preventDefault();
              onGoCart();
            }}
          >
            <span className="header-action-label">Giỏ hàng</span>
            {cartCount > 0 && (
              <span className="header-cart-count" aria-label={`${cartCount} sản phẩm trong giỏ`}>
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </a>

          <button
            type="button"
            className={`header-outlined-btn header-login-btn ${activePopup === "auth" ? "active-popup-btn" : ""}`}
            id="header-login-btn"
            aria-label={currentUser ? `Tài khoản ${accountLabel}` : 'Đăng nhập hoặc đăng ký'}
            aria-expanded={activePopup === "auth"}
            onClick={(e) => {
              e.stopPropagation();
              setActivePopup(activePopup === "auth" ? null : "auth");
            }}
          >
            <span className="header-action-label">{accountLabel}</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
