import PhoneWeekendSale from '../PhoneWeekendSale/PhoneWeekendSale';
import { LAPTOP_BRANDS } from '../HeroSection/brandData';
import { SafeBrandImage } from '../HeroSection/BrandLogos';
import {
  getLaptopBrandFromText,
  laptopBrandOrder,
  laptopHubItems,
  laptopNeedItems,
} from './laptopLandingData';

const normalizeLabel = (value = '') => (
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
);

export function LaptopHubNavigation({ activeKey = 'laptop' }) {
  return (
    <nav className="laptop-hub-nav" aria-label="Danh mục máy tính">
      {laptopHubItems.map((item) => (
        <a
          className={`laptop-hub-item ${item.key === activeKey ? 'active' : ''}`}
          href={item.href}
          aria-current={item.key === activeKey ? 'page' : undefined}
          key={item.label}
        >
          <span aria-hidden="true">{item.icon}</span>
          <strong>{item.label}</strong>
        </a>
      ))}
    </nav>
  );
}

function LaptopBrandGrid({ page, names = laptopBrandOrder, buildBrandHref }) {
  const brands = names
    .map((name) => LAPTOP_BRANDS.find((brand) => (
      normalizeLabel(brand.name) === normalizeLabel(name)
    )))
    .filter(Boolean);

  return (
    <div
      className="phone-category-brand-grid laptop-category-brand-grid"
      aria-label="Chọn thương hiệu laptop"
    >
      {brands.map((brand) => {
        const brandKey = getLaptopBrandFromText(brand.name) || normalizeLabel(brand.name);
        const isActive = normalizeLabel(page.brand) === normalizeLabel(brandKey);

        return (
          <a
            className={`phone-category-brand-card laptop-category-brand-card ${isActive ? 'active' : ''}`}
            href={buildBrandHref(brandKey)}
            aria-label={`Xem laptop ${brand.name}`}
            aria-current={isActive ? 'page' : undefined}
            key={brand.name}
          >
            <SafeBrandImage src={brand.logo} alt={brand.name} />
          </a>
        );
      })}
    </div>
  );
}

function LaptopVoucher() {
  return (
    <section className="laptop-voucher-section" aria-labelledby="laptop-voucher-title">
      <div className="laptop-voucher-head">
        <h2 id="laptop-voucher-title">Ưu đãi &amp; voucher</h2>
        <a href="/khuyen-mai">
          Xem tất cả <span aria-hidden="true">›</span>
        </a>
      </div>

      <div className="laptop-voucher-list">
        {[1, 2].map((item) => (
          <article className="laptop-voucher-ticket" key={item}>
            <strong>Giảm<br />4%</strong>
            <div>
              <b>Voucher laptop 4%</b>
              <p>Tối đa 2 triệu, áp dụng cho tất cả laptop mới chính hãng.</p>
            </div>
            <button type="button">Thu thập</button>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function LaptopCategoryIntro({
  page,
  profile = null,
  bannerTracks,
  BannerCarousel,
  buildBrandHref,
  buildSeriesHref,
}) {
  const isMainPage = !profile;
  const isBrandPage = Boolean(profile?.brand);
  const title = profile?.title || 'Máy tính laptop';

  return (
    <section
      className={`phone-category-intro laptop-category-intro ${profile ? 'laptop-need-category-intro' : 'laptop-main-category-intro'} ${isBrandPage ? 'laptop-brand-category-intro phone-brand-intro' : ''} ${bannerTracks.length >= 2 ? 'has-banners' : 'no-banners'}`}
      aria-labelledby="laptop-category-title"
    >
      {isMainPage && <LaptopHubNavigation activeKey="laptop" />}

      {bannerTracks.length >= 2 && (
        <BannerCarousel
          page={page}
          tracks={bannerTracks}
          label={`Khuyến mãi ${title}`}
          category="Laptop"
        />
      )}

      <h1 id="laptop-category-title">{title}</h1>
      {isBrandPage ? (
        <div className="category-series-pills phone-brand-series-pills laptop-brand-series-pills" aria-label={`Dòng ${title}`}>
          {(profile.series || []).map(([label, query]) => {
            const isActive = normalizeLabel(page.q) === normalizeLabel(query);
            return (
              <a
                href={buildSeriesHref(query, label)}
                className={`category-series-pill ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                key={label}
              >
                {label}
              </a>
            );
          })}
        </div>
      ) : (
        <LaptopBrandGrid
          page={page}
          names={profile?.brands || laptopBrandOrder}
          buildBrandHref={buildBrandHref}
        />
      )}
      {(!isBrandPage || profile.showVoucher) && <LaptopVoucher />}

      {isMainPage && (
        <>
          <h2>Chọn theo nhu cầu</h2>
          <div className="phone-category-needs-grid laptop-category-needs-grid">
            {laptopNeedItems.map((item) => (
              <a
                className="phone-category-need-card laptop-category-need-card"
                href={item.href}
                key={item.label}
              >
                <img src={item.image} alt="" loading="lazy" />
                <span>{item.label}</span>
              </a>
            ))}
          </div>
        </>
      )}

      {(!isBrandPage || profile.showWeekendSale) && (
        <PhoneWeekendSale
          category="Laptop"
          brand={profile?.brand || ''}
          title="SẢN PHẨM NỔI BẬT"
          showCountdown={false}
          usage={profile?.usage || ''}
          special={profile?.special || ''}
          filter=""
          sort="latest"
        />
      )}
    </section>
  );
}
