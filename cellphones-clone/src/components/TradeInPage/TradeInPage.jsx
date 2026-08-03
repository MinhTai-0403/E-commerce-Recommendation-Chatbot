import { useEffect, useMemo, useState } from 'react';
import './TradeInPage.css';
import { laptopProducts, phoneProducts, watchProducts } from '../../data/mockData';

const heroBanners = [
  {
    id: 'trade-in-kv',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:1920:377/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Web/landing-page/trade-in/trade_in_banner_kv-m.jpg',
    alt: 'Thu cũ đổi mới - giá ngon lên đời tiết kiệm',
  },
  {
    id: 'trade-in-program',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:1920:377/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Web/landing-page/trade-in/tradein-m-1.jpg',
    alt: 'Chương trình thu cũ đổi mới CellphoneS',
  },
  {
    id: 's-buyback',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:1920:377/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Web/landing-page/buy-back/780x320_BUYBACK_06.png',
    alt: 'S-BuyBack cam kết giá thu',
  },
];

const tradeInCategories = [
  {
    id: 'all',
    label: 'Tất cả',
    image: 'https://dashboard.cellphones.com.vn/storage/icon-homepage-trade-in.svg',
  },
  {
    id: 'apple',
    label: 'iPhone',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:30/plain/https://cellphones.com.vn/media/wysiwyg/Web/Brand/iPhone-240x50.png',
  },
  {
    id: 'samsung',
    label: 'Samsung',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:30/plain/https://cellphones.com.vn/media/wysiwyg/Web/Brand/Samsung-240x50.png',
  },
  {
    id: 'macbook',
    label: 'MacBook',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:30/plain/https://cellphones.com.vn/media/wysiwyg/Icon/brand_logo/macbook.png',
  },
  {
    id: 'xiaomi',
    label: 'Xiaomi',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:30/plain/https://cellphones.com.vn/media/wysiwyg/Web/Brand/XIAOMI-new-240x50.png',
  },
  {
    id: 'laptop',
    label: 'Laptop',
    image: 'https://dashboard.cellphones.com.vn/storage/icon-homepage-laptop.svg',
  },
  {
    id: 'ipad',
    label: 'iPad',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:30/plain/https://cellphones.com.vn/media/wysiwyg/Web/Brand/iPad-240x50.png',
  },
  {
    id: 'watch',
    label: 'Đồng hồ',
    image: 'https://dashboard.cellphones.com.vn/storage/icon-homepage-watch.svg',
  },
];

const faqItems = [
  {
    question: 'Làm sao tôi biết trước giá thu máy trước khi mang đến cửa hàng?',
    answer: 'Bạn chọn đúng model và tình trạng máy trong công cụ định giá nhanh. Giá hiển thị là mức tham khảo; kỹ thuật viên sẽ xác nhận lại sau khi kiểm tra trực tiếp thiết bị.',
  },
  {
    question: 'Thiết bị bị trầy xước nhẹ hoặc chai pin có được thu không?',
    answer: 'Có. CellphoneS vẫn tiếp nhận nhiều tình trạng máy khác nhau. Giá thu cuối cùng phụ thuộc ngoại hình, chức năng, pin, màn hình và khả năng đăng xuất tài khoản bảo mật.',
  },
  {
    question: 'CellphoneS có hỗ trợ thu cũ đổi mới từ xa không?',
    answer: 'Có thể đăng ký tư vấn trước. Nhân viên sẽ liên hệ để hướng dẫn điểm tiếp nhận, thời gian kiểm tra và phương án gửi máy phù hợp.',
  },
  {
    question: 'Tôi có thể thu nhiều máy cũ để đổi một máy mới không?',
    answer: 'Có thể cộng dồn giá trị nhiều thiết bị nếu các máy đều đủ điều kiện tiếp nhận tại thời điểm kiểm tra.',
  },
  {
    question: 'Tôi có thể chỉ bán máy cũ mà không mua máy mới không?',
    answer: 'Có. Bạn có thể chọn chỉ thu cũ hoặc thu cũ lên đời trong bước xác nhận nhu cầu.',
  },
];

const formatPrice = (value = 0) => `${Math.max(0, Number(value || 0)).toLocaleString('vi-VN')}đ`;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function ArrowIcon({ direction = 'right' }) {
  const points = direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6';
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}

function ProductTile({ product, mode = 'trade-in', selected, onSelect }) {
  const referencePrice = mode === 'trade-in'
    ? Math.round(Number(product.currentPrice || 0) * 0.56 / 10000) * 10000
    : Number(product.currentPrice || 0);

  return (
    <button
      type="button"
      className={`tradein-product-tile ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(product)}
    >
      <span className="tradein-product-check">✓</span>
      <span className="tradein-product-image-wrap">
        <img src={product.image} alt={product.name} loading="lazy" />
      </span>
      <strong>{product.name}</strong>
      {mode === 'trade-in' ? (
        <span className="tradein-reference-price">
          Giá thu dự kiến đến <b>{formatPrice(referencePrice)}</b>
        </span>
      ) : (
        <>
          <span className="tradein-new-price">{formatPrice(referencePrice)}</span>
          <span className="tradein-subsidy">Trợ giá thêm đến 1.000.000đ</span>
        </>
      )}
    </button>
  );
}

function ConsultationModal({ onClose }) {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="tradein-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="tradein-consult-modal" role="dialog" aria-modal="true" aria-label="Đăng ký tư vấn" onMouseDown={(event) => event.stopPropagation()}>
        <button className="tradein-modal-close" type="button" onClick={onClose} aria-label="Đóng">×</button>
        <div className="tradein-modal-logo">S</div>
        <h2>Đăng ký tư vấn thu cũ đổi mới</h2>
        <p>Để lại thông tin, nhân viên CellphoneS sẽ liên hệ hỗ trợ định giá và chọn máy lên đời.</p>
        {submitted ? (
          <div className="tradein-success-message">
            <strong>Đăng ký thành công!</strong>
            <span>Chúng tôi sẽ liên hệ với bạn trong thời gian sớm nhất.</span>
          </div>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
            <label>
              Họ và tên
              <input required placeholder="Nhập họ và tên" />
            </label>
            <label>
              Số điện thoại
              <input required inputMode="tel" pattern="0[0-9]{9}" maxLength={10} placeholder="Nhập số điện thoại" />
            </label>
            <label>
              Sản phẩm cần tư vấn
              <input placeholder="Ví dụ: iPhone 15 Pro Max" />
            </label>
            <button type="submit">Gửi thông tin</button>
          </form>
        )}
      </section>
    </div>
  );
}

export default function TradeInPage() {
  const [activeBanner, setActiveBanner] = useState(0);
  const [oldQuery, setOldQuery] = useState('');
  const [newQuery, setNewQuery] = useState('');
  const [imei, setImei] = useState('');
  const [imeiMessage, setImeiMessage] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedOld, setSelectedOld] = useState(null);
  const [selectedNew, setSelectedNew] = useState(null);
  const [openFaq, setOpenFaq] = useState(0);
  const [showConsultation, setShowConsultation] = useState(false);
  const [showMoreArticle, setShowMoreArticle] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveBanner((current) => (current + 1) % heroBanners.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, []);

  const tradeInProducts = useMemo(() => [
    ...phoneProducts,
    ...laptopProducts.slice(3, 7),
    ...watchProducts.slice(0, 4),
  ], []);

  const upgradeProducts = useMemo(() => [
    ...phoneProducts.slice(0, 8),
    ...laptopProducts.slice(3, 6),
  ], []);

  const visibleOldProducts = useMemo(() => {
    const query = oldQuery.trim().toLowerCase();
    return tradeInProducts
      .filter((product) => activeCategory === 'all' || (
        activeCategory === 'laptop'
          ? /laptop|macbook/i.test(product.name)
          : activeCategory === 'watch'
            ? /watch|đồng hồ|band/i.test(product.name)
            : activeCategory === 'ipad'
              ? /ipad/i.test(product.name)
              : String(product.brand || '').toLowerCase() === activeCategory || product.name.toLowerCase().includes(activeCategory)
      ))
      .filter((product) => !query || product.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [activeCategory, oldQuery, tradeInProducts]);

  const visibleNewProducts = useMemo(() => {
    const query = newQuery.trim().toLowerCase();
    return upgradeProducts
      .filter((product) => !query || product.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [newQuery, upgradeProducts]);

  const checkImei = () => {
    const normalized = imei.replace(/\D/g, '');
    if (normalized.length < 10) {
      setImeiMessage('Vui lòng nhập số IMEI hợp lệ để kiểm tra.');
      return;
    }
    setImeiMessage('Thiết bị chưa có dữ liệu S-BuyBack trong bản demo. Bạn có thể tiếp tục chọn model bên dưới.');
  };

  return (
    <div className="tradein-page">
      <nav className="tradein-breadcrumb container" aria-label="Breadcrumb">
        <a href="/">Trang chủ</a>
        <span>/</span>
        <strong>Thu cũ đổi mới</strong>
      </nav>

      <section className="tradein-hero" aria-label="Ưu đãi thu cũ đổi mới">
        <div className="tradein-hero-track" style={{ transform: `translateX(-${activeBanner * 100}%)` }}>
          {heroBanners.map((banner) => (
            <article className="tradein-hero-slide" key={banner.id}>
              <img src={banner.image} alt={banner.alt} />
            </article>
          ))}
        </div>
        <button className="tradein-hero-arrow previous" type="button" onClick={() => setActiveBanner((activeBanner - 1 + heroBanners.length) % heroBanners.length)} aria-label="Banner trước">
          <ArrowIcon direction="left" />
        </button>
        <button className="tradein-hero-arrow next" type="button" onClick={() => setActiveBanner((activeBanner + 1) % heroBanners.length)} aria-label="Banner sau">
          <ArrowIcon />
        </button>
        <div className="tradein-hero-dots">
          {heroBanners.map((banner, index) => (
            <button key={banner.id} type="button" className={index === activeBanner ? 'active' : ''} onClick={() => setActiveBanner(index)} aria-label={`Xem banner ${index + 1}`} />
          ))}
        </div>
      </section>

      <div className="tradein-main container">
        <section className="tradein-card tradein-old-device-section">
          <div className="tradein-section-heading">
            <span className="tradein-step-number">1</span>
            <div>
              <h1>Chọn sản phẩm bạn muốn thu cũ</h1>
              <p>Định giá nhanh thiết bị cũ của bạn theo model và tình trạng thực tế.</p>
            </div>
          </div>

          <div className="tradein-buyback-box">
            <div className="tradein-buyback-copy">
              <span className="tradein-buyback-badge">S-BuyBack</span>
              <div>
                <strong>Định giá thiết bị đã mua gói S-BuyBack</strong>
                <p>Nhập IMEI để kiểm tra giá thu cam kết của thiết bị.</p>
              </div>
            </div>
            <div className="tradein-imei-row">
              <label className="tradein-input-with-icon">
                <SearchIcon />
                <input value={imei} onChange={(event) => { setImei(event.target.value); setImeiMessage(''); }} placeholder="Nhập số IMEI của thiết bị để kiểm tra (Ví dụ: 031452154)" />
              </label>
              <button type="button" onClick={checkImei}>Kiểm tra ngay</button>
            </div>
            {imeiMessage && <p className="tradein-imei-message">{imeiMessage}</p>}
            <button className="tradein-imei-guide" type="button" onClick={() => setImeiMessage('Mở ứng dụng Điện thoại, nhập *#06# hoặc vào Cài đặt → Giới thiệu để xem IMEI/Serial.')}>Xem hướng dẫn kiểm tra IMEI</button>
          </div>

          <div className="tradein-category-tabs" aria-label="Nhóm sản phẩm thu cũ">
            {tradeInCategories.map((category) => (
              <button key={category.id} type="button" className={activeCategory === category.id ? 'active' : ''} onClick={() => setActiveCategory(category.id)}>
                <span className="tradein-category-logo-wrap">
                  <img src={category.image} alt="" loading="lazy" />
                </span>
                {category.label}
              </button>
            ))}
          </div>

          <label className="tradein-search-field">
            <SearchIcon />
            <input value={oldQuery} onChange={(event) => setOldQuery(event.target.value)} placeholder="Tìm sản phẩm muốn thu cũ" />
          </label>

          <div className="tradein-product-grid">
            {visibleOldProducts.length ? visibleOldProducts.map((product) => (
              <ProductTile key={`old-${product.id}`} product={product} selected={selectedOld?.id === product.id} onSelect={setSelectedOld} />
            )) : (
              <div className="tradein-empty-result">
                <strong>Rất tiếc chưa có kết quả phù hợp</strong>
                <span>Hãy thử từ khóa ngắn hơn hoặc đăng ký để nhân viên tư vấn.</span>
              </div>
            )}
          </div>

          <div className="tradein-consult-strip">
            <img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:157:110/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Web/icon/ant-warranty-new.png" alt="Đăng ký tư vấn" />
            <div>
              <strong>Bạn chưa tìm thấy sản phẩm cần định giá?</strong>
              <span>Đừng lo, để lại thông tin nhận tư vấn ngay nhé!</span>
            </div>
            <button type="button" onClick={() => setShowConsultation(true)}>Đăng ký tư vấn</button>
          </div>
        </section>

        <section className="tradein-card tradein-upgrade-section">
          <div className="tradein-section-heading">
            <span className="tradein-step-number">2</span>
            <div>
              <h2>Chọn sản phẩm bạn muốn lên đời</h2>
              <p>Nhận trợ giá thêm đến <strong>1 Triệu</strong> khi đổi sang sản phẩm mới.</p>
            </div>
          </div>

          <label className="tradein-search-field">
            <SearchIcon />
            <input value={newQuery} onChange={(event) => setNewQuery(event.target.value)} placeholder="Tìm sản phẩm muốn lên đời" />
          </label>

          <div className="tradein-product-grid upgrade-grid">
            {visibleNewProducts.map((product) => (
              <ProductTile key={`new-${product.id}`} product={product} mode="upgrade" selected={selectedNew?.id === product.id} onSelect={setSelectedNew} />
            ))}
          </div>

          {(selectedOld || selectedNew) && (
            <div className="tradein-selection-summary">
              <div>
                <span>Máy thu cũ</span>
                <strong>{selectedOld?.name || 'Chưa chọn sản phẩm'}</strong>
              </div>
              <span className="tradein-summary-arrow">→</span>
              <div>
                <span>Máy lên đời</span>
                <strong>{selectedNew?.name || 'Chưa chọn sản phẩm'}</strong>
              </div>
              <button type="button" onClick={() => setShowConsultation(true)}>Tiếp tục định giá</button>
            </div>
          )}
        </section>

        <a className="tradein-member-banner" href="/smember">
          <img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:640:0/q:100/plain/https://cellphones.com.vn/media/wysiwyg/NormalThuCu-Smember-2024-M.png" alt="Ưu đãi thu cũ cho thành viên Smember" loading="lazy" />
        </a>

        <section className="tradein-highlight-section">
          <h2>Thu cũ nổi bật</h2>
          <div className="tradein-highlight-grid">
            {tradeInCategories.slice(1).map((category) => (
              <button type="button" key={category.id} onClick={() => { setActiveCategory(category.id); document.querySelector('.tradein-old-device-section')?.scrollIntoView({ behavior: 'smooth' }); }}>
                <span className="tradein-highlight-logo-wrap">
                  <img src={category.image} alt={`Logo ${category.label}`} loading="lazy" />
                </span>
                <strong>{category.label}</strong>
                <small>Xem giá thu</small>
              </button>
            ))}
          </div>
        </section>

        <article className={`tradein-article ${showMoreArticle ? 'expanded' : ''}`}>
          <h2>Thu cũ đổi mới - Lên đời thiết bị tiết kiệm tại CellphoneS</h2>
          <p>Chương trình Trade in thu cũ đổi mới giúp người dùng nâng cấp sản phẩm công nghệ với chi phí tiết kiệm hơn. Thiết bị được định giá minh bạch theo model, ngoại hình và chức năng, đồng thời có thể nhận thêm ưu đãi khi lên đời sản phẩm mới.</p>
          <img className="tradein-article-cover" src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/su-kien/Thu-cu-doi-moi/thu-cu-doi-moi-3_2.jpg" alt="Thu cũ đổi mới tại CellphoneS" loading="lazy" />

          <h3>Thu cũ đổi mới là gì?</h3>
          <p>Thu cũ đổi mới hay trade-in là hình thức mang thiết bị công nghệ cũ tới định giá, sau đó nhận tiền hoặc bù chênh lệch để mua sản phẩm mới. Quy trình phù hợp với điện thoại, máy tính bảng, laptop, MacBook và đồng hồ thông minh.</p>

          <h3>Tại sao nên chọn thu cũ đổi mới tại CellphoneS?</h3>
          <ul>
            <li>Thu mua trực tiếp, quy trình rõ ràng và không qua trung gian.</li>
            <li>Định giá theo tình trạng máy, báo giá trước khi khách xác nhận.</li>
            <li>Có thêm trợ giá lên đời và ưu đãi dành cho thành viên Smember.</li>
            <li>Hỗ trợ nhiều thương hiệu và nhiều tình trạng thiết bị.</li>
          </ul>

          <section className="tradein-process">
            <h3>Quy trình thu cũ lên đời</h3>
            <div className="tradein-process-grid">
              {[
                ['01', 'Chọn thiết bị cũ', 'Tìm đúng model và phiên bản sản phẩm cần định giá.'],
                ['02', 'Đánh giá tình trạng', 'Chọn ngoại hình, màn hình, pin và chức năng máy.'],
                ['03', 'Chọn máy lên đời', 'Xem sản phẩm mới và mức trợ giá đang áp dụng.'],
                ['04', 'Xác nhận thông tin', 'Để lại số điện thoại và cửa hàng muốn giao dịch.'],
                ['05', 'Kiểm tra tại cửa hàng', 'Kỹ thuật viên kiểm tra và xác nhận giá thu cuối cùng.'],
              ].map(([number, title, text]) => (
                <div key={number}>
                  <span>{number}</span>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="tradein-article-extra">
            <h3>Những nhóm sản phẩm được hỗ trợ</h3>
            <p>CellphoneS hỗ trợ thu cũ nhiều dòng iPhone, Samsung Galaxy, Xiaomi, OPPO, MacBook, laptop Windows, iPad và đồng hồ thông minh. Mức thu thay đổi theo phiên bản, dung lượng, ngoại hình và tình trạng chức năng.</p>
            <h3>Lưu ý trước khi mang máy đi định giá</h3>
            <ul>
              <li>Sao lưu dữ liệu cá nhân và chuẩn bị thông tin đăng nhập để đăng xuất tài khoản.</li>
              <li>Không cần khôi phục cài đặt gốc trước khi kỹ thuật viên kiểm tra, trừ khi được hướng dẫn.</li>
              <li>Mang theo hộp và phụ kiện nếu còn để có mức định giá tốt hơn.</li>
            </ul>
          </div>

          <button className="tradein-read-more" type="button" onClick={() => setShowMoreArticle((value) => !value)}>
            {showMoreArticle ? 'Thu gọn' : 'Xem thêm'}
            <span>{showMoreArticle ? '⌃' : '⌄'}</span>
          </button>
        </article>

        <section className="tradein-faq-section">
          <h2>Câu hỏi thường gặp</h2>
          <div className="tradein-faq-list">
            {faqItems.map((item, index) => (
              <article className={openFaq === index ? 'open' : ''} key={item.question}>
                <button type="button" onClick={() => setOpenFaq(openFaq === index ? -1 : index)}>
                  <span>{item.question}</span>
                  <b>{openFaq === index ? '−' : '+'}</b>
                </button>
                <div><p>{item.answer}</p></div>
              </article>
            ))}
          </div>
        </section>
      </div>

      {showConsultation && <ConsultationModal onClose={() => setShowConsultation(false)} />}
    </div>
  );
}
