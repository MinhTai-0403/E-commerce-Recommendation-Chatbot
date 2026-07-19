import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { categories } from '../../data/mockData';
import { buildCategoryPath } from '../../utils/linkRoutes';
import { SafeBrandImage } from '../HeroSection/BrandLogos';
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
} from '../HeroSection/brandData';
import '../HeroSection/HeroSection.css';

const USE_HOME_CATEGORY_MENU = true;
const HomeCategoryMenu = lazy(() => import('../HeroSection/HeroSection'));

const phoneBrandItems = [
  ...PHONE_BRANDS.map((brand) => ({
    label: brand.name,
    brand: brand.name,
    logo: brand.logo,
  })),
  { label: 'Điện thoại phổ thông', brand: 'dien-thoai-pho-thong', logo: '' },
];

const hotPhoneItems = [
  ['iPhone 17', 'iphone 17', 'Mới'],
  ['iPhone 17 Pro', 'iphone 17 pro', 'Hot'],
  ['iPhone 17 Pro Max', 'iphone 17 pro max', 'Hot'],
  ['iPhone 17e', 'iphone 17e', ''],
  ['iPhone Air', 'iphone air', ''],
  ['iPhone 16 Pro Max', 'iphone 16 pro max', ''],
  ['Galaxy S26 Ultra', 'galaxy s26 ultra', 'Hot'],
  ['Galaxy S26', 'galaxy s26', ''],
  ['Galaxy Z Fold7', 'galaxy z fold7', ''],
  ['Galaxy S25 Edge', 'galaxy s25 edge', ''],
  ['OPPO Find X9 Ultra', 'oppo find x9 ultra', 'Mới'],
  ['OPPO Find N6', 'oppo find n6', ''],
  ['OPPO Reno15', 'oppo reno15', ''],
  ['Xiaomi 17T', 'xiaomi 17t', 'Mới'],
  ['POCO X8 Pro Max', 'poco x8 pro max', ''],
  ['HONOR 600 5G', 'honor 600 5g', ''],
  ['HONOR X9d 5G', 'honor x9d 5g', 'Hot'],
  ['TECNO Spark 50', 'tecno spark 50', 'Mới'],
  ['Nubia Neo 5G', 'nubia neo 5g', ''],
  ['Huawei Mate X7', 'huawei mate x7', ''],
];

const phonePriceItems = [
  ['Dưới 2 triệu', { priceMax: '2000000' }],
  ['Từ 2 - 4 triệu', { priceMin: '2000000', priceMax: '4000000' }],
  ['Từ 4 - 7 triệu', { priceMin: '4000000', priceMax: '7000000' }],
  ['Từ 7 - 13 triệu', { priceMin: '7000000', priceMax: '13000000' }],
  ['Từ 13 - 20 triệu', { priceMin: '13000000', priceMax: '20000000' }],
  ['Trên 20 triệu', { priceMin: '20000000' }],
];

const tabletBrandItems = TABLET_BRANDS.map((brand) => ({
  label: brand.name,
  brand: brand.name,
  logo: brand.logo,
}));

const asLogoItems = (brands = []) => brands.map((brand) => ({
  label: brand.name,
  brand: brand.name,
  logo: brand.logo,
}));

const asPillItems = (items = []) => items.map((item) => (
  typeof item === 'string' ? { label: item } : item
));

const logoGroup = (title, brands, category) => ({
  title,
  kind: 'logo',
  category,
  items: asLogoItems(brands),
});

const pillGroup = (title, items, category) => ({
  title,
  kind: 'pill',
  category,
  items: asPillItems(items),
});

const genericMegaGroups = {
  laptop: [
    logoGroup('HÃNG LAPTOP', LAPTOP_BRANDS, 'Laptop'),
    pillGroup('LAPTOP HOT', [
      { label: 'MacBook Air', brand: 'apple' },
      { label: 'MacBook Pro', brand: 'apple' },
      'ASUS Vivobook',
      'Lenovo LOQ',
      'HP OmniBook',
      { label: 'Laptop AI', badge: 'Hot', tone: 'red' },
      'Laptop Gaming',
      'Laptop văn phòng',
      'Laptop mỏng nhẹ',
    ], 'Laptop'),
    pillGroup('MỨC GIÁ LAPTOP', [
      { label: 'Dưới 10 triệu', priceMax: '10000000' },
      { label: '10 - 15 triệu', priceMin: '10000000', priceMax: '15000000' },
      { label: '15 - 20 triệu', priceMin: '15000000', priceMax: '20000000' },
      { label: '20 - 30 triệu', priceMin: '20000000', priceMax: '30000000' },
      { label: 'Trên 30 triệu', priceMin: '30000000' },
    ], 'Laptop'),
  ],
  audio: [
    logoGroup('HÃNG TAI NGHE', AUDIO_BRANDS, 'Tai nghe'),
    logoGroup('HÃNG LOA', SPEAKER_BRANDS, 'Loa'),
    pillGroup('ÂM THANH, MIC THU ÂM', [
      'Tai nghe Bluetooth',
      'Tai nghe chụp tai',
      'Tai nghe nhét tai',
      'Tai nghe có dây',
      'Tai nghe Gaming',
      'Loa Bluetooth',
      'Loa Karaoke',
      'Loa Soundbar',
      'Mic cài áo',
      'Mic livestream',
      'Micro thu âm',
      'Phụ kiện âm thanh',
    ], 'Âm thanh'),
  ],
  watch: [
    logoGroup('HÃNG ĐỒNG HỒ', WATCH_BRANDS, 'Đồng hồ thông minh'),
    pillGroup('ĐỒNG HỒ', [
      'Đồng hồ thông minh',
      'Vòng đeo tay thông minh',
      'Đồng hồ định vị trẻ em',
      { label: 'Dây đồng hồ thông minh', category: 'Dây đeo đồng hồ', q: '' },
      { label: 'Apple Watch Series 11', badge: 'Hot', tone: 'red' },
      'Samsung Galaxy Watch',
      'Huawei Watch GT',
      'Garmin Forerunner',
    ], 'Đồng hồ thông minh'),
    pillGroup('CAMERA', [
      'Camera an ninh',
      'Camera hành trình',
      'Camera AI',
      'Máy ảnh',
      'Gimbal',
      'Tripod',
      'Flycam',
      'Camera DJI',
    ], 'Camera'),
  ],
  appliance: [
    logoGroup('THƯƠNG HIỆU GIA DỤNG', HOME_APPLIANCE_BRANDS, 'Đồ gia dụng'),
    pillGroup('ĐỒ GIA DỤNG', [
      { label: 'Robot hút bụi', badge: 'Hot', tone: 'red' },
      'Máy hút bụi',
      'Máy lọc không khí',
      'Máy hút ẩm',
      'Máy chiếu',
      'Quạt',
      'TV Box',
      'Nồi chiên không dầu',
      'Nồi cơm điện',
      'Máy xay sinh tố',
      'Máy ép trái cây',
      'Bếp điện',
    ], 'Đồ gia dụng'),
    pillGroup('SỨC KHỎE - LÀM ĐẸP', [
      'Máy sấy tóc',
      'Máy massage',
      'Máy cạo râu',
      'Cân sức khỏe',
      'Bàn chải điện',
      'Máy tăm nước',
      'Máy rửa mặt',
      'Máy đo huyết áp',
    ], 'Làm đẹp'),
  ],
  accessory: [
    pillGroup('PHỤ KIỆN DI ĐỘNG', [
      'Phụ kiện Apple',
      'Dán màn hình',
      'Ốp lưng - Bao da',
      'Thẻ nhớ',
      'Apple Care+',
      'Samsung Care+',
      'Sim 4G - 5G',
      'Cáp, sạc',
      'Pin dự phòng',
      'Trạm sạc dự phòng',
      'Dây đeo chéo điện thoại',
      'Phụ kiện điện thoại',
    ], 'Phụ kiện'),
    pillGroup('PHỤ KIỆN LAPTOP', [
      'Chuột, bàn phím',
      'Balo Laptop',
      'Túi chống sốc',
      'Phần mềm',
      'Webcam',
      'Giá đỡ',
      'Thảm, lót chuột',
      'Sạc laptop',
      'Camera phòng họp',
      'Hub chuyển đổi',
    ], 'Phụ kiện'),
    pillGroup('THIẾT BỊ MẠNG - LƯU TRỮ', [
      'Thiết bị phát sóng WiFi',
      'Bộ phát wifi di động',
      'Bộ kích sóng WiFi',
      'Hub-Switch',
      'USB wifi',
      'Card mạng',
      'USB',
      'Ổ cứng di động',
    ], 'Phụ kiện'),
  ],
  pc: [
    logoGroup('HÃNG MÀN HÌNH', MONITOR_PC_BRANDS, 'Màn hình'),
    pillGroup('PC, MÀN HÌNH, MÁY IN', [
      'Build PC',
      'PC cấu hình sẵn',
      'PC Gaming',
      'PC văn phòng',
      'All In One',
      'Màn hình máy tính',
      'Màn hình Gaming',
      'Màn hình đồ họa',
      'Máy in',
      'Máy tính cầm tay',
    ], 'PC'),
    pillGroup('LINH KIỆN - GAMING GEAR', [
      'CPU',
      'Mainboard',
      'RAM',
      'Ổ cứng SSD',
      'Nguồn',
      'VGA',
      'Tản nhiệt',
      'Case',
      'PlayStation',
      'ROG Ally',
      'Bàn phím Gaming',
      'Chuột chơi game',
    ], 'Linh kiện máy tính'),
  ],
  tv: [
    logoGroup('HÃNG TIVI', APPLIANCE_LOGOS.filter((item) => ['SAMSUNG', 'LG', 'Xiaomi', 'Sony', 'TCL', 'AQUA', 'coocaa'].includes(item.name)), 'Tivi'),
    logoGroup('HÃNG ĐIỆN MÁY', APPLIANCE_LOGOS.filter((item) => ['LG', 'SAMSUNG', 'Xiaomi', 'Panasonic', 'AQUA', 'Toshiba', 'Sharp'].includes(item.name)), 'Điện máy'),
    pillGroup('TIVI, ĐIỆN MÁY', [
      'Tivi 4K',
      'Tivi QLED',
      'Tivi OLED',
      'Tủ lạnh',
      'Tủ đông',
      'Máy giặt',
      'Máy sấy quần áo',
      'Điều hòa - Máy lạnh',
      'Máy nước nóng',
      'Giá treo tivi',
    ], 'Tivi'),
  ],
  tradein: [
    pillGroup('THU CŨ ĐỔI MỚI', [
      { label: 'S-BuyBack Chương trình cam kết giá thu', badge: 'Mới', tone: 'blue' },
      'Thu cũ iPhone',
      'Thu cũ Samsung',
      'Thu cũ Xiaomi',
      'Thu cũ Laptop',
      'Thu cũ MacBook',
      'Thu cũ iPad',
      'Thu cũ đồng hồ',
      'Trợ giá lên đời',
    ], 'Hàng cũ'),
    pillGroup('SẢN PHẨM TRỢ GIÁ CAO', [
      'iPhone 17 Pro Max',
      'Galaxy S25 Series',
      'Galaxy Z Series',
      'Xiaomi 17 Ultra',
      'OPPO Find X9',
      'Laptop trợ giá',
      'MacBook trợ giá',
    ], 'Hàng cũ'),
  ],
  used: [
    pillGroup('HÀNG CŨ', [
      'Điện thoại cũ',
      'Máy tính bảng cũ',
      'MacBook cũ',
      'Laptop cũ',
      'Tai nghe cũ',
      'Loa cũ',
      'Đồng hồ thông minh cũ',
      'Đồ gia dụng cũ',
      'Màn hình cũ',
      'Tivi cũ',
      'Cáp sạc cũ',
      'Phụ kiện cũ',
    ], 'Hàng cũ'),
  ],
  promo: [
    pillGroup('KHUYẾN MÃI', [
      'Hotsale cuối tuần',
      'Deal sốc mỗi ngày',
      'Ưu đãi thanh toán',
      { label: 'Trả góp 0%', badge: 'Hot', tone: 'red' },
      'Ưu đãi Smember',
      'Ưu đãi S-Student',
      'Khuyến mãi Apple',
      'Khuyến mãi Samsung',
      'Khách hàng doanh nghiệp B2B',
      'Back to School',
    ], 'Khuyến mãi'),
    pillGroup('THU CŨ - THÀNH VIÊN', [
      'Thu cũ đổi mới giá hời',
      'Chính sách Smember',
      'Nhập hội S-Student',
      'Đăng ký S-Business',
      'Voucher cuối tuần',
    ], 'Khuyến mãi'),
  ],
  news: [
    pillGroup('TIN CÔNG NGHỆ', [
      'Tin mới',
      'Đánh giá sản phẩm',
      'Tư vấn chọn mua',
      'Thủ thuật',
      'So sánh sản phẩm',
      'Sforum',
      'Tin Apple',
      'Tin Samsung',
      'Tin AI',
    ], 'Tin công nghệ'),
  ],
};

const megaMenuSections = [
  { id: 'phone-tablet', label: 'Điện thoại, Tablet', icon: categories[0]?.icon, category: 'Điện thoại' },
  { id: 'laptop', label: 'Laptop', icon: categories[1]?.icon, category: 'Laptop', groups: genericMegaGroups.laptop },
  { id: 'audio', label: 'Âm thanh, Mic thu âm', icon: categories[2]?.icon, category: 'Âm thanh', groups: genericMegaGroups.audio },
  { id: 'watch', label: 'Đồng hồ, Camera', icon: categories[3]?.icon, category: 'Đồng hồ thông minh', groups: genericMegaGroups.watch },
  { id: 'appliance', label: 'Đồ gia dụng, Làm đẹp', icon: categories[4]?.icon, category: 'Đồ gia dụng', groups: genericMegaGroups.appliance },
  { id: 'accessory', label: 'Phụ kiện', icon: categories[5]?.icon, category: 'Phụ kiện', groups: genericMegaGroups.accessory },
  { id: 'pc', label: 'PC, Màn hình, Máy in', icon: categories[6]?.icon, category: 'PC', groups: genericMegaGroups.pc },
  { id: 'tv', label: 'Tivi, Điện máy', icon: categories[7]?.icon, category: 'Tivi', groups: genericMegaGroups.tv },
  { id: 'tradein', label: 'Thu cũ đổi mới', icon: categories[8]?.icon, href: '/thu-cu-doi-moi', groups: genericMegaGroups.tradein },
  { id: 'used', label: 'Hàng cũ', icon: categories[9]?.icon, category: 'Hàng cũ', groups: genericMegaGroups.used },
  { id: 'promo', label: 'Khuyến mãi', icon: categories[10]?.icon, href: '/danh-sach-khuyen-mai', groups: genericMegaGroups.promo },
  { id: 'news', label: 'Tin công nghệ', icon: categories[11]?.icon, href: '/tin-tuc/tin-cong-nghe', groups: genericMegaGroups.news },
];

function CategoryIcon({ item }) {
  if (item.icon) return <img src={item.icon} alt="" />;
  return <span className="header-mega-fallback-icon">▣</span>;
}

function buildMegaHref(label, category = 'Điện thoại', extra = {}) {
  return buildCategoryPath(category || label, {
    keyword: label,
    title: label,
    q: extra.q,
    brand: extra.brand,
    segment: extra.segment,
    priceMin: extra.priceMin,
    priceMax: extra.priceMax,
    category,
  });
}

function BrandTile({ label, brand, logo, category = 'Điện thoại' }) {
  return (
    <a className="header-mega-brand-tile mega-brand-logo-card-item" href={buildMegaHref(label, category, { brand })}>
      {logo ? <SafeBrandImage src={logo} alt={label} /> : <span>{label}</span>}
    </a>
  );
}

function PillLink({ label, href, badge, tone = 'blue' }) {
  return (
    <a className="header-mega-pill" href={href}>
      <span>{label}</span>
      {badge && <em className={`header-mega-badge ${tone}`}>{badge}</em>}
    </a>
  );
}

function PhoneTabletMegaContent() {
  return (
    <>
      <section className="header-mega-column brand-column">
        <h3>HÃNG ĐIỆN THOẠI</h3>
        <div className="header-mega-brand-grid">
          {phoneBrandItems.map((item) => (
            <BrandTile key={item.label} label={item.label} brand={item.brand} logo={item.logo} />
          ))}
        </div>
        <h3 className="header-mega-subtitle">MỨC GIÁ ĐIỆN THOẠI</h3>
        <div className="header-mega-price-grid">
          {phonePriceItems.map(([label, extra]) => (
            <PillLink key={label} label={label} href={buildMegaHref(label, 'Điện thoại', extra)} />
          ))}
        </div>
      </section>

      <section className="header-mega-column hot-column">
        <h3>ĐIỆN THOẠI HOT <span>⚡</span></h3>
        <div className="header-mega-hot-grid">
          {hotPhoneItems.map(([label, q, badge]) => (
            <PillLink
              key={label}
              label={label}
              href={buildMegaHref(label, 'Điện thoại', { q })}
              badge={badge}
              tone={badge === 'Hot' ? 'red' : 'blue'}
            />
          ))}
        </div>
      </section>

      <section className="header-mega-column tablet-column">
        <h3>HÃNG MÁY TÍNH BẢNG</h3>
        <div className="header-mega-brand-grid tablet">
          {tabletBrandItems.map((item) => (
            <BrandTile key={item.label} label={item.label} brand={item.brand} logo={item.logo} category="Máy tính bảng" />
          ))}
        </div>
      </section>
    </>
  );
}

function GenericMegaContent({ section }) {
  const groups = section.groups || [];

  return groups.map((group) => {
    const category = group.category || section.category;

    return (
      <section className="header-mega-column generic-column" key={group.title}>
        <h3>{group.title}</h3>
        <div className={group.kind === 'logo' ? 'header-mega-brand-grid' : 'header-mega-generic-grid'}>
          {group.items.map((item) => {
            const label = item.label || item.name || item;
            const itemCategory = item.category || category || label;
            const href = section.href || buildMegaHref(label, itemCategory, {
              q: Object.prototype.hasOwnProperty.call(item, 'q') ? item.q : label,
              brand: item.brand,
              priceMin: item.priceMin,
              priceMax: item.priceMax,
              segment: item.segment,
            });

            if (group.kind === 'logo' || item.logo) {
              return (
                <BrandTile
                  key={`${group.title}-${label}`}
                  label={label}
                  brand={item.brand || label}
                  logo={item.logo}
                  category={itemCategory}
                />
              );
            }

            return (
              <PillLink
                key={`${group.title}-${label}`}
                label={label}
                href={href}
                badge={item.badge}
                tone={item.tone || (item.badge === 'Hot' ? 'red' : 'blue')}
              />
            );
          })}
        </div>
      </section>
    );
  });
}

export function FloatingActions() {
  const [visible, setVisible] = useState(false);
  const [showApp, setShowApp] = useState(true);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <aside className="floating-actions" aria-label="Liên kết hỗ trợ nhanh">
      {showApp && (
        <div className="floating-app">
          <button type="button" onClick={() => setShowApp(false)} aria-label="Đóng quảng cáo tải ứng dụng">×</button>
          <a href="/download-app" aria-label="Tải ứng dụng CellphoneS">
            <img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:100:100/q:100/plain/https://cellphones.com.vn/media/wysiwyg/icon_downloadapp.png" alt="Tải ứng dụng CellphoneS" width="100" height="100" />
          </a>
        </div>
      )}
      <button
        className={`floating-action-button back-to-top ${visible ? 'visible' : ''}`}
        onClick={scrollToTop}
        type="button"
      >
        <span>Lên đầu</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <polyline points="18 15 12 9 6 15" />
          <polyline points="18 20 12 14 6 20" />
        </svg>
      </button>
      <a className="floating-action-button floating-contact" href="/lien-he">
        <span>Liên hệ</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
          <path d="M18 19h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-1zM6 19H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h1z" />
          <path d="M18 19c0 1.1-.9 2-2 2h-3" />
        </svg>
      </a>
    </aside>
  );
}

export function HeaderPopups({
  activePopup,
  currentUser,
  filteredProvinces,
  goAccount,
  goLogin,
  goRegister,
  handleCloseAllPopups,
  handleLogout,
  locationSearch,
  selectedLocation,
  setLocationSearch,
  setSelectedLocation,
}) {
  const [activeMegaId, setActiveMegaId] = useState('phone-tablet');
  const activeMegaSection = useMemo(() => (
    megaMenuSections.find((item) => item.id === activeMegaId) || megaMenuSections[0]
  ), [activeMegaId]);

  if (!activePopup) return null;

  return (
    <>
      {activePopup === 'category' && (
        <>
          <div className="global-backdrop-overlay" onClick={handleCloseAllPopups} role="presentation" />
          {USE_HOME_CATEGORY_MENU ? (
            <nav className="header-home-category-reuse" aria-label="Danh mục sản phẩm">
              <Suspense fallback={<div className="header-category-loading">Đang tải danh mục...</div>}>
                <HomeCategoryMenu
                  categoryMenuOnly
                  currentUser={currentUser}
                  onGoLogin={goLogin}
                  onGoRegister={goRegister}
                  onCategoryNavigate={handleCloseAllPopups}
                />
              </Suspense>
            </nav>
          ) : (
          <nav className="header-home-category-reuse" aria-label="Danh mục sản phẩm">
            <div className="hero-inner header-home-category-inner">
              <div className="hero-sidebar header-home-sidebar-reuse">
                <ul className="category-menu">
                  {megaMenuSections.map((item) => (
                    <li
                      key={item.id}
                      className={`category-item ${activeMegaSection.id === item.id ? 'active-hover-item' : ''}`}
                      onMouseEnter={() => setActiveMegaId(item.id)}
                    >
                      <a
                        href={item.href || buildCategoryPath(item.category || item.label, { keyword: item.label, title: item.label })}
                        onFocus={() => setActiveMegaId(item.id)}
                        onClick={handleCloseAllPopups}
                      >
                        <div className="category-item-left">
                          <span className="header-mega-side-icon"><CategoryIcon item={item} /></span>
                          <span>{item.label}</span>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mega-menu-panel header-home-mega-panel-reuse">
                {activeMegaSection.id === 'phone-tablet' ? (
                  <PhoneTabletMegaContent />
                ) : (
                  <GenericMegaContent section={activeMegaSection} />
                )}
              </div>
            </div>
          </nav>
          )}
        </>
      )}

      {(activePopup === 'location' || activePopup === 'auth') && (
        <div className="location-global-overlay" onClick={handleCloseAllPopups} role="presentation" />
      )}

      {activePopup === 'location' && (
        <div className="location-modal-box">
          <div className="location-modal-header-bar">
            <div className="location-modal-search-wrapper">
              <svg className="modal-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.5" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Nhập tên tỉnh thành"
                value={locationSearch}
                onChange={(event) => setLocationSearch(event.target.value)}
                autoFocus
              />
            </div>
            <button className="location-modal-close-btn" onClick={handleCloseAllPopups} type="button">
              Đóng ×
            </button>
          </div>

          <div className="location-modal-hint">
            Vui lòng chọn tỉnh, thành phố để biết chính xác giá, khuyến mãi và tồn kho
          </div>

          <div className="location-modal-body">
            {filteredProvinces.length > 0 ? (
              <div className="location-grid-layout">
                {filteredProvinces.map((province) => (
                  <button
                    key={province}
                    className={`location-grid-item ${selectedLocation === province ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedLocation(province);
                      handleCloseAllPopups();
                    }}
                    type="button"
                  >
                    <span>{province}</span>
                    {selectedLocation === province && <span className="check-mark">✓</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="location-no-data">Không tìm thấy tỉnh thành phù hợp</div>
            )}
          </div>
        </div>
      )}

      {activePopup === 'auth' && (
        <div className="auth-modal-box">
          <button className="auth-modal-close-x" onClick={handleCloseAllPopups} type="button">×</button>
          <h2 className="auth-modal-title">Smember</h2>
          <div className="auth-modal-mascot">
            <img src="https://cellphones.com.vn/media/wysiwyg/ant-smile.png" alt="Smember Mascot" />
          </div>
          {currentUser ? (
            <>
              <p className="auth-modal-desc">
                Xin chào <strong>{currentUser.fullName || currentUser.email}</strong>.
                Tài khoản của bạn đã đăng nhập và sẵn sàng dùng ưu đãi Smember.
              </p>
              <div className="auth-modal-user-meta">
                <span>{currentUser.email}</span>
                <span>{currentUser.phone}</span>
                <span>Role: {currentUser.role || 'customer'}</span>
              </div>
              <div className="auth-modal-actions stacked">
                <button className="auth-btn btn-login" onClick={goAccount} type="button">Thông tin cá nhân</button>
                <button className="auth-btn btn-register" onClick={handleLogout} type="button">Đăng xuất</button>
              </div>
            </>
          ) : (
            <>
              <p className="auth-modal-desc">
                Vui lòng đăng nhập tài khoản Smember để xem ưu đãi và thanh toán dễ dàng hơn.
              </p>
              <div className="auth-modal-actions">
                <button
                  className="auth-btn btn-register"
                  onClick={() => {
                    handleCloseAllPopups();
                    goRegister();
                  }}
                  type="button"
                >
                  Đăng ký
                </button>
                <button
                  className="auth-btn btn-login"
                  onClick={() => {
                    handleCloseAllPopups();
                    goLogin();
                  }}
                  type="button"
                >
                  Đăng nhập
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
