import { useMemo, useState } from 'react';
import './PromotionsPage.css';
import ProductCard from '../ProductCard/ProductCard';
import {
  applianceProducts,
  audioProducts,
  flashSaleProducts,
  hotTrendProducts,
  laptopProducts,
  phoneProducts,
  tvProducts,
  watchProducts,
} from '../../data/mockData';

const CATEGORY_TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'phone', label: 'Điện thoại' },
  { id: 'tablet', label: 'Máy tính bảng' },
  { id: 'laptop', label: 'Laptop' },
  { id: 'pc', label: 'Màn hình, PC' },
  { id: 'audio', label: 'Đồng hồ, âm thanh' },
  { id: 'tv', label: 'Tivi, Điện máy' },
  { id: 'accessory', label: 'Phụ kiện' },
];

const BRAND_LOGOS = [
  ['apple', 'Apple', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/Logo/apple.png'],
  ['samsung', 'Samsung', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/Logo/samsung.png'],
  ['xiaomi', 'Xiaomi', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/Logo/xiaomi.png'],
  ['oppo', 'OPPO', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/Logo/oppo.png'],
  ['tecno', 'TECNO', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/TECNO.png'],
  ['honor', 'HONOR', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/honor.png'],
  ['nubia', 'Nubia', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/nubia.png'],
  ['sony', 'Sony', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/sony.png'],
  ['nokia', 'Nokia', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/nokia.png'],
  ['infinix', 'Infinix', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/Infinix.png'],
  ['nothing', 'Nothing', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/nothing.png'],
  ['masstel', 'Masstel', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/masstel_1.png'],
  ['realme', 'realme', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/realme.png'],
  ['itel', 'itel', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/Logo/itel.png'],
  ['meizu', 'Meizu', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/Meizu.png'],
];

const PAYMENT_PROMOS = [
  {
    title: 'Ưu đãi thẻ ngân hàng',
    text: 'Giảm trực tiếp, hoàn tiền hoặc trả góp 0% theo từng ngân hàng.',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:68:68/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Web/landing-page/hang-moi-ve/promo01.png',
  },
  {
    title: 'Mở thẻ nhận quà',
    text: 'Đăng ký thẻ mới và nhận quà tặng công nghệ hấp dẫn.',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:68:68/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Web/landing-page/hang-moi-ve/promo02.png',
  },
  {
    title: 'Mua trước trả sau',
    text: 'Chia nhỏ thanh toán với Kredivo, Fundiin và đối tác tài chính.',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:68:68/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Web/landing-page/hang-moi-ve/promo03.png',
  },
  {
    title: 'Ưu đãi ví điện tử',
    text: 'Voucher và hoàn tiền khi thanh toán qua ví điện tử hoặc QR.',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:68:68/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Web/landing-page/hang-moi-ve/promo04.png',
  },
];

const TREND_CARDS = [
  {
    title: 'HÈ MÁT LẠNH',
    image: 'https://cellphones.com.vn/media/wysiwyg/may-lanh-dien-lanh-new.png',
    href: '/may-lanh.html',
  },
  {
    title: 'CHỤP ẢNH',
    image: 'https://cellphones.com.vn/media/wysiwyg/camera-may-anh.png',
    href: '/phu-kien/camera.html',
  },
  {
    title: 'DU LỊCH',
    image: 'https://cellphones.com.vn/media/wysiwyg/pin-du-phong-20000-mah.png',
    href: '/phu-kien.html',
  },
];

const FAQS = [
  ['Khuyến mãi có áp dụng đồng thời với Smember không?', 'Tùy chương trình. Một số ưu đãi được cộng thêm với Smember, trong khi một số mã chỉ áp dụng riêng.'],
  ['Làm sao biết sản phẩm đang có ưu đãi nào?', 'Mở trang chi tiết sản phẩm hoặc chọn sản phẩm trong các danh sách bên dưới để xem ưu đãi hiện hành.'],
  ['Ưu đãi thanh toán có thay đổi không?', 'Có. Mức giảm, ngân hàng và thời gian áp dụng có thể thay đổi theo từng chiến dịch.'],
];

const normalizeText = (value = '') => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function SectionTitle({ image, alt }) {
  return (
    <div className="promotions-title-image-wrap">
      <img src={image} alt={alt} loading="lazy" />
    </div>
  );
}

function ProductRail({ products }) {
  return (
    <div className="promotions-product-grid">
      {products.slice(0, 10).map((product) => (
        <ProductCard product={product} key={product.id || product.slug || product.name} />
      ))}
    </div>
  );
}

export default function PromotionsPage() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeBrand, setActiveBrand] = useState('all');
  const [newArrivalTab, setNewArrivalTab] = useState('phone');
  const [sort, setSort] = useState('popular');

  const allProducts = useMemo(() => [
    ...phoneProducts,
    ...laptopProducts,
    ...watchProducts,
    ...audioProducts,
    ...tvProducts,
    ...applianceProducts,
    ...hotTrendProducts,
  ], []);

  const hotDealProducts = useMemo(() => {
    const categoryNeedles = {
      phone: ['iphone', 'samsung', 'oppo', 'xiaomi', 'honor'],
      tablet: ['ipad', 'tablet'],
      laptop: ['laptop', 'macbook'],
      pc: ['màn hình', 'pc'],
      audio: ['watch', 'đồng hồ', 'tai nghe', 'loa'],
      tv: ['tivi', 'tủ lạnh', 'máy lạnh'],
      accessory: ['camera', 'cáp', 'sạc', 'bàn phím'],
    };

    const needles = categoryNeedles[activeCategory] || [];
    let result = allProducts.filter((product) => {
      const text = normalizeText(`${product.name} ${product.brand || ''}`);
      const categoryMatch = activeCategory === 'all' || needles.some((needle) => text.includes(normalizeText(needle)));
      const brandMatch = activeBrand === 'all' || text.includes(normalizeText(activeBrand));
      return categoryMatch && brandMatch;
    });

    result = [...result].sort((a, b) => {
      if (sort === 'discount') return Number(b.discount || 0) - Number(a.discount || 0);
      if (sort === 'price-asc') return Number(a.currentPrice || 0) - Number(b.currentPrice || 0);
      if (sort === 'price-desc') return Number(b.currentPrice || 0) - Number(a.currentPrice || 0);
      return Number(b.ratingCount || 0) - Number(a.ratingCount || 0);
    });

    return result.length ? result : allProducts;
  }, [activeBrand, activeCategory, allProducts, sort]);

  const newArrivalProducts = useMemo(() => {
    if (newArrivalTab === 'phone') return phoneProducts;
    if (newArrivalTab === 'computer') return laptopProducts;
    if (newArrivalTab === 'audio') return [...watchProducts, ...audioProducts];
    if (newArrivalTab === 'appliance') return applianceProducts;
    if (newArrivalTab === 'tv') return tvProducts;
    return hotTrendProducts;
  }, [newArrivalTab]);

  return (
    <section className="promotions-page">
      <div className="container promotions-container">
        <nav className="promotions-breadcrumb" aria-label="Breadcrumb">
          <a href="/">Trang chủ</a><span>/</span><strong>Danh sách khuyến mãi</strong>
        </nav>
        <h1>Danh Sách Khuyến Mãi</h1>

        <section className="promotions-panel promotions-new-products">
          <SectionTitle
            image="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/heading-m-1.png"
            alt="Hàng mới đổ bộ"
          />
          <SectionTitle
            image="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/title-dealsoc-d.png"
            alt="Deal sốc mỗi ngày"
          />

          <div className="promotions-category-tabs">
            {CATEGORY_TABS.map((item) => (
              <button type="button" className={activeCategory === item.id ? 'active' : ''} onClick={() => setActiveCategory(item.id)} key={item.id}>
                {item.label}
              </button>
            ))}
          </div>

          <div className="promotions-brand-strip">
            <button type="button" className={activeBrand === 'all' ? 'active' : ''} onClick={() => setActiveBrand('all')}>Tất cả</button>
            {BRAND_LOGOS.map(([id, label, image]) => (
              <button type="button" className={activeBrand === id ? 'active' : ''} onClick={() => setActiveBrand(id)} key={id} aria-label={label}>
                <img src={image} alt={label} loading="lazy" />
              </button>
            ))}
          </div>

          <div className="promotions-sort-row">
            <strong>Sắp xếp theo:</strong>
            {[
              ['popular', 'Phổ biến'],
              ['discount', 'Khuyến mãi HOT'],
              ['price-asc', 'Giá thấp - cao'],
              ['price-desc', 'Giá cao - thấp'],
            ].map(([id, label]) => (
              <button type="button" className={sort === id ? 'active' : ''} onClick={() => setSort(id)} key={id}>{label}</button>
            ))}
          </div>

          <ProductRail products={hotDealProducts} />
        </section>

        <section className="promotions-panel promotions-trend-section">
          <SectionTitle
            image="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/title-hot-trend-d.png"
            alt="Sản phẩm hot trend"
          />
          <div className="promotions-trend-grid">
            {TREND_CARDS.map((item) => (
              <a href={item.href} key={item.title}>
                <span>SẢN PHẨM HOT TREND</span>
                <img src={item.image} alt={item.title} loading="lazy" />
                <strong>{item.title}</strong>
              </a>
            ))}
          </div>
          <ProductRail products={[...hotTrendProducts, ...flashSaleProducts]} />
        </section>

        <section className="promotions-panel promotions-arrivals-section">
          <SectionTitle
            image="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/title-hangmoi-m02.png"
            alt="Hàng mới lên kệ ưu đãi ê hề"
          />
          <div className="promotions-arrival-tabs">
            {[
              ['phone', 'ĐIỆN THOẠI - MÁY TÍNH BẢNG'],
              ['computer', 'MÁY TÍNH - THIẾT BỊ VĂN PHÒNG'],
              ['audio', 'ĐỒNG HỒ - ÂM THANH'],
              ['appliance', 'GIA DỤNG - THIẾT BỊ LÀM ĐẸP'],
              ['tv', 'ĐIỆN MÁY'],
              ['accessory', 'PHỤ KIỆN'],
            ].map(([id, label]) => (
              <button type="button" className={newArrivalTab === id ? 'active' : ''} onClick={() => setNewArrivalTab(id)} key={id}>{label}</button>
            ))}
          </div>
          <ProductRail products={newArrivalProducts} />
        </section>

        <section className="promotions-panel promotions-education-section">
          <SectionTitle
            image="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/promo_ttl03.png"
            alt="Ưu đãi giáo dục"
          />
          <div className="promotions-education-grid">
            <a href="/uu-dai-smember"><strong>S-STUDENT</strong><span>Giảm thêm cho học sinh, sinh viên</span></a>
            <a href="/uu-dai-smember"><strong>S-TEACHER</strong><span>Ưu đãi thiết bị phục vụ giảng dạy</span></a>
            <a href="/tra-gop"><strong>S-FINANCE</strong><span>Trả góp linh hoạt, thủ tục nhanh</span></a>
          </div>
        </section>

        <section className="promotions-panel promotions-payment-section">
          <SectionTitle
            image="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/promo_ttl.png"
            alt="Ưu đãi thanh toán"
          />
          <div className="promotions-payment-grid">
            {PAYMENT_PROMOS.map((item) => (
              <a href="/khuyen-mai/uu-dai-thanh-toan" key={item.title}>
                <img src={item.image} alt="" loading="lazy" />
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </a>
            ))}
          </div>
        </section>

        <a className="promotions-business-banner" href="/dich-vu-khach-hang-doanh-nghiep">
          <img src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/b2b/MB-S-Business.png" alt="Trở thành khách hàng doanh nghiệp cùng CellphoneS" loading="lazy" />
          <span>Đăng ký S-Business</span>
        </a>

        <section className="promotions-panel promotions-super-deal-section">
          <SectionTitle
            image="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/promo_ttl02.png"
            alt="Deal siêu hot"
          />
          <ProductRail products={[...phoneProducts, ...laptopProducts, ...tvProducts]} />
        </section>

        <section className="promotions-panel promotions-faq-section">
          <h2>Hỏi và đáp</h2>
          <div>
            {FAQS.map(([question, answer], index) => (
              <details open={index === 0} key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
          <a href="/support">Hãy đặt câu hỏi cho chúng tôi</a>
        </section>
      </div>
    </section>
  );
}
