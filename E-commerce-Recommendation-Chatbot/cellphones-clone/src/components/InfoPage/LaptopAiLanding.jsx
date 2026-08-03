import { useState } from 'react';
import PhoneWeekendSale from '../PhoneWeekendSale/PhoneWeekendSale';
import { buildCategoryPath } from '../../utils/linkRoutes';
import { laptopAiAssets } from './laptopLandingData';

function ResponsiveCampaignImage({
  desktop,
  mobile = '',
  alt,
  href = '',
  eager = false,
  className = '',
}) {
  const picture = (
    <picture className={href ? '' : className}>
      {mobile && <source media="(max-width: 680px)" srcSet={mobile} />}
      <img
        src={desktop}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
      />
    </picture>
  );

  if (!href) return picture;

  return (
    <a className={`${className} laptop-ai-campaign-link`.trim()} href={href} aria-label={alt}>
      {picture}
    </a>
  );
}

function LaptopAiPromoCarousel() {
  const promos = laptopAiAssets.copilotPromos || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const activePromo = promos[activeIndex];

  if (!activePromo) return null;

  const changeSlide = (direction) => {
    setActiveIndex((current) => (current + direction + promos.length) % promos.length);
  };

  return (
    <div className="laptop-ai-promo-carousel" aria-label="Ưu đãi Laptop Copilot+ PC" aria-roledescription="carousel">
      <a href={activePromo.href} className="laptop-ai-promo-slide" aria-label={`Xem ${activePromo.name}`}>
        <picture>
          <source media="(max-width: 680px)" srcSet={activePromo.mobile} />
          <img src={activePromo.desktop} alt={activePromo.name} loading="lazy" />
        </picture>
      </a>

      <button
        type="button"
        className="laptop-ai-promo-arrow laptop-ai-promo-prev"
        aria-label="Xem banner Laptop AI trước"
        onClick={() => changeSlide(-1)}
      >
        ‹
      </button>
      <button
        type="button"
        className="laptop-ai-promo-arrow laptop-ai-promo-next"
        aria-label="Xem banner Laptop AI tiếp theo"
        onClick={() => changeSlide(1)}
      >
        ›
      </button>

      <div className="laptop-ai-promo-dots" aria-label="Chọn banner Laptop AI">
        {promos.map((promo, index) => (
          <button
            type="button"
            className={index === activeIndex ? 'active' : ''}
            aria-label={`Xem ${promo.name}`}
            aria-current={index === activeIndex ? 'true' : undefined}
            onClick={() => setActiveIndex(index)}
            key={promo.name}
          />
        ))}
      </div>
    </div>
  );
}

function LaptopAiFeatureShowcase() {
  const featureImages = [
    ['Phụ đề trực tiếp Live Captions', laptopAiAssets.liveCaptions],
    ['Tìm lại nội dung với Recall', laptopAiAssets.recall],
    ['Windows Studio Effects', laptopAiAssets.studioEffects],
    ['Creator Effect', laptopAiAssets.creator],
    ['Auto Super Resolution', laptopAiAssets.autoSr],
  ];

  return (
    <section className="laptop-ai-campaign-section" id="laptop-ai-features">
      <ResponsiveCampaignImage
        className="laptop-ai-section-heading-art"
        desktop={laptopAiAssets.featureHeading}
        alt="Khám phá sức mạnh Copilot Plus PC"
      />
      <div className="laptop-ai-feature-grid">
        {featureImages.map(([label, image]) => (
          <article className="laptop-ai-feature-card" key={label}>
            <img src={image} alt={label} loading="lazy" />
          </article>
        ))}
      </div>
      <ResponsiveCampaignImage
        className="laptop-ai-wide-art laptop-ai-mac-art"
        desktop={laptopAiAssets.macIntelligence}
        mobile={laptopAiAssets.macIntelligenceMobile}
        alt="Xem MacBook với Apple Intelligence"
        href={buildCategoryPath('Laptop', {
          brand: 'apple',
          q: 'MacBook',
          special: 'AI tích hợp',
          keyword: 'MacBook Apple Intelligence',
          title: 'MacBook Apple Intelligence',
        })}
      />
    </section>
  );
}

export function LaptopAiLandingIntro() {
  return (
    <section className="laptop-ai-landing-intro" aria-labelledby="laptop-ai-title">
      <h1 className="sr-only" id="laptop-ai-title">Laptop AI</h1>
      <ResponsiveCampaignImage
        className="laptop-ai-hero"
        desktop={laptopAiAssets.heroDesktop}
        mobile={laptopAiAssets.heroMobile}
        alt="Laptop AI - khai phá sức mạnh trí tuệ nhân tạo"
        href="#laptop-ai-products"
        eager
      />

      <nav className="laptop-ai-anchor-nav" aria-label="Điều hướng trang Laptop AI">
        {[
          ['ƯU ĐÃI', '#laptop-ai-offers'],
          ['SẢN PHẨM', '#laptop-ai-products'],
          ['TÍNH NĂNG', '#laptop-ai-features'],
          ['THU CŨ', '#laptop-ai-trade-in'],
          ['TRẢI NGHIỆM', '#laptop-ai-experience'],
        ].map(([label, href]) => (
          <a href={href} key={label}>{label}</a>
        ))}
      </nav>

      <section className="laptop-ai-campaign-section" id="laptop-ai-offers">
        <h2>Ưu đãi đặc quyền</h2>
        <ResponsiveCampaignImage
          className="laptop-ai-wide-art"
          desktop={laptopAiAssets.exclusiveOffer}
          mobile={laptopAiAssets.exclusiveOfferMobile}
          alt="Xem ưu đãi đặc quyền khi mua Laptop AI"
          href="#laptop-ai-products"
        />
      </section>

      <section className="laptop-ai-campaign-section laptop-ai-products-section" id="laptop-ai-products">
        <ResponsiveCampaignImage
          className="laptop-ai-section-heading-art"
          desktop={laptopAiAssets.copilotHeading}
          mobile={laptopAiAssets.copilotHeadingMobile}
          alt="Xem Laptop AI chuẩn Copilot Plus PC"
          href="#laptop-ai-copilot-list"
        />

        <LaptopAiPromoCarousel />

        <div className="laptop-ai-copilot-products" id="laptop-ai-copilot-list">
          <PhoneWeekendSale
            category="Laptop Copilot+ PC"
            title="LAPTOP COPILOT+ PC"
            showCountdown={false}
            showSort
            filter=""
            sort="latest"
          />
        </div>
      </section>

      <LaptopAiFeatureShowcase />

      <ResponsiveCampaignImage
        className="laptop-ai-other-heading"
        desktop={laptopAiAssets.otherAiHeading}
        mobile={laptopAiAssets.otherAiHeadingMobile}
        alt="Xem các mẫu Laptop AI khác"
        href="#laptop-ai-other-products"
      />
    </section>
  );
}

function LaptopAiExperienceGallery() {
  const photos = laptopAiAssets.experiencePhotos || [laptopAiAssets.experiencePhoto];

  return (
    <div className="laptop-ai-experience-gallery" aria-label="Hình ảnh trải nghiệm Laptop AI tại cửa hàng">
      {photos.map((photo, index) => (
        <a href="/he-thong-cua-hang" key={photo} aria-label={`Xem cửa hàng trải nghiệm Laptop AI ${index + 1}`}>
          <img src={photo} alt={`Không gian trải nghiệm Laptop AI ${index + 1}`} loading="lazy" />
        </a>
      ))}
    </div>
  );
}

function LaptopAiEditorial() {
  return (
    <section className="laptop-ai-editorial" aria-labelledby="laptop-ai-news-title">
      <h2 id="laptop-ai-news-title">Tin tức sản phẩm</h2>
      <div className="laptop-ai-news-grid">
        <a href="/tin-tuc/laptop-ai-la-gi" className="laptop-ai-news-card">
          <img src={laptopAiAssets.liveCaptions} alt="Tìm hiểu Laptop AI" loading="lazy" />
          <span>
            <strong>Laptop AI là gì?</strong>
            <small>Hiểu về NPU, Copilot+ PC và khả năng tăng tốc tác vụ trí tuệ nhân tạo.</small>
          </span>
        </a>
        <a href="/tin-tuc/tinh-nang-copilot-plus-pc" className="laptop-ai-news-card">
          <img src={laptopAiAssets.studioEffects} alt="Tính năng Copilot Plus PC" loading="lazy" />
          <span>
            <strong>Những tính năng nổi bật trên Copilot+ PC</strong>
            <small>Live Captions, Recall, Studio Effects và các công cụ sáng tạo mới.</small>
          </span>
        </a>
      </div>

      <article className="laptop-ai-guide-card">
        <h2>Laptop AI hiện đại có gì khác biệt?</h2>
        <p>
          Laptop AI được trang bị bộ xử lý có NPU chuyên dụng để xử lý tác vụ trí tuệ nhân tạo ngay trên máy.
          Nhờ đó, thiết bị có thể hỗ trợ họp trực tuyến, tạo nội dung, tìm kiếm thông minh và tối ưu pin hiệu quả hơn.
        </p>
        <div>
          <section>
            <h3>Hiệu năng thông minh</h3>
            <p>CPU, GPU và NPU phối hợp theo từng tác vụ, giúp duy trì hiệu suất mà vẫn kiểm soát điện năng.</p>
          </section>
          <section>
            <h3>Trải nghiệm cá nhân hóa</h3>
            <p>Copilot và các công cụ AI hỗ trợ tóm tắt, dịch, chỉnh ảnh và tổ chức công việc ngay trên Windows.</p>
          </section>
          <section>
            <h3>Bảo mật và riêng tư</h3>
            <p>Nhiều tác vụ có thể chạy trực tiếp trên thiết bị, giảm việc gửi dữ liệu lên dịch vụ đám mây.</p>
          </section>
        </div>
      </article>
    </section>
  );
}

export function LaptopAiFeatureSections() {
  return (
    <section className="laptop-ai-after-products">
      <section className="laptop-ai-campaign-section" id="laptop-ai-trade-in">
        <h2>Ưu đãi thu cũ lên đời</h2>
        <ResponsiveCampaignImage
          className="laptop-ai-wide-art"
          desktop={laptopAiAssets.tradeIn}
          mobile={laptopAiAssets.tradeInMobile}
          alt="Xem chương trình thu cũ lên đời Laptop AI"
          href="/khuyen-mai/thu-cu-len-doi-laptop-ai"
        />
        <p className="laptop-ai-trade-note">Đã bao gồm khuyến mãi và trợ giá lên đời theo từng sản phẩm.</p>
      </section>

      <section className="laptop-ai-campaign-section laptop-ai-experience" id="laptop-ai-experience">
        <h2>Trải nghiệm Laptop AI tại cửa hàng</h2>
        <ResponsiveCampaignImage
          className="laptop-ai-wide-art"
          desktop={laptopAiAssets.experience}
          alt="Xem hệ thống cửa hàng trải nghiệm Laptop AI"
          href="/he-thong-cua-hang"
        />

        <div className="laptop-ai-store-addresses">
          <strong>Đến trải nghiệm trực tiếp</strong>
          <a href="https://g.page/r/CZcTd_IfEBt9EBA" target="_blank" rel="noreferrer">
            133 Thái Hà, Đống Đa, Hà Nội <span aria-hidden="true">›</span>
          </a>
          <a href="https://g.page/r/CYu9GMcLPoXQEAE" target="_blank" rel="noreferrer">
            571 Huỳnh Tấn Phát, Quận 7, TP.HCM <span aria-hidden="true">›</span>
          </a>
          <p>Nhân viên CellphoneS hỗ trợ dùng thử Copilot, sáng tạo nội dung và chọn cấu hình phù hợp.</p>
        </div>

        <LaptopAiExperienceGallery />
      </section>

      <LaptopAiEditorial />
    </section>
  );
}
