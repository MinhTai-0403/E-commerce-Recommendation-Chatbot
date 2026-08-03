import { useMemo, useState } from 'react';
import './InstallmentPage.css';
import ProductCard from '../ProductCard/ProductCard';
import {
  laptopProducts,
  phoneProducts,
  tvProducts,
} from '../../data/mockData';

const INSTALLMENT_METHODS = [
  {
    id: 'credit-card',
    title: 'Thẻ tín dụng',
    image: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/i_ksp-ico01.png',
    description: 'Miễn phí chuyển đổi trả góp qua thẻ của hơn 25 ngân hàng. Không cần hồ sơ, không chờ xét duyệt.',
    bullets: ['Kỳ hạn linh hoạt theo ngân hàng', 'Thanh toán online hoặc tại cửa hàng', 'Không cần hồ sơ tài chính'],
    href: '/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones',
  },
  {
    id: 'finance-company',
    title: 'Công ty tài chính',
    image: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/i_ksp-ico02.png',
    description: 'Lãi suất 0% kỳ hạn đến 12 tháng cùng các đối tác tài chính theo chương trình hiện hành.',
    bullets: ['Chỉ cần CCCD', 'Trả trước từ 0đ', 'Duyệt nhanh tại cửa hàng'],
    href: '#installment-products',
  },
  {
    id: 'buy-now-pay-later',
    title: 'Mua trước trả sau',
    image: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/i_ksp-ico03.png',
    description: 'Sở hữu sản phẩm ngay và thanh toán dần với Kredivo, MoMo hoặc Fundiin.',
    bullets: ['Đăng ký trực tuyến', 'Không cần đến ngân hàng', 'Theo dõi kỳ hạn trên ứng dụng'],
    href: '#installment-products',
  },
];

const PROCESS_STEPS = [
  {
    number: '01',
    title: 'Bước 1: Chọn sản phẩm',
    description: 'Lựa chọn sản phẩm muốn mua và kiểm tra chương trình trả góp đang áp dụng.',
    image: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/i_process-ico01.png',
  },
  {
    number: '02',
    title: 'Bước 2: Chọn hình thức',
    description: 'Chọn thẻ tín dụng, công ty tài chính hoặc mua trước trả sau phù hợp.',
    image: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/i_process-ico02.png',
  },
  {
    number: '03',
    title: 'Bước 3: Làm hồ sơ',
    description: 'Điền thông tin trực tuyến hoặc đến cửa hàng để hoàn tất hồ sơ theo hướng dẫn.',
    image: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/i_process-ico03.png',
  },
  {
    number: '04',
    title: 'Bước 4: Nhận máy',
    description: 'Sau khi hồ sơ được duyệt, nhận sản phẩm tại cửa hàng hoặc theo phương án giao nhận.',
    image: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/i_process-ico04.png',
  },
];

const PRODUCT_TABS = [
  ['phone', 'Điện thoại'],
  ['laptop', 'Laptop'],
  ['tablet', 'Máy tính bảng'],
  ['tv', 'Tivi'],
  ['used', 'Hàng cũ'],
];

const BRAND_LOGOS = [
  ['all', 'Tất cả', null],
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
  ['realme', 'realme', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/realme.png'],
  ['itel', 'itel', 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/Logo/itel.png'],
];

const FAQ_ITEMS = [
  {
    question: 'Nên trả góp trong bao lâu?',
    answer: 'Kỳ hạn phổ biến là 4–12 tháng. Kỳ hạn ngắn giúp giảm tổng chi phí nhưng số tiền mỗi tháng cao hơn; kỳ hạn dài giúp chia nhỏ ngân sách nhưng cần kiểm tra kỹ phí chuyển đổi.',
  },
  {
    question: 'Có thể mua trả góp hai sản phẩm cùng lúc không?',
    answer: 'Có thể, nếu hạn mức thẻ hoặc hồ sơ tài chính đáp ứng điều kiện của ngân hàng và đối tác xét duyệt.',
  },
  {
    question: 'Tại sao hồ sơ trả góp không được duyệt?',
    answer: 'Nguyên nhân thường gặp gồm lịch sử tín dụng chưa phù hợp, hạn mức không đủ, thông tin hồ sơ không trùng khớp hoặc thu nhập chưa đáp ứng yêu cầu.',
  },
  {
    question: 'Nợ xấu có mua trả góp được không?',
    answer: 'Khả năng được duyệt sẽ thấp hoặc không được chấp thuận, tùy mức độ nợ và chính sách của tổ chức tài chính.',
  },
  {
    question: 'S-Student có dùng đồng thời S-Finance và ưu đãi sinh viên không?',
    answer: 'Theo thông tin hiện hành trên trang gốc, khách hàng chỉ sử dụng một trong hai chương trình S-Finance hoặc ưu đãi sinh viên.',
  },
];

const normalizeText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

function ProductSection({ products }) {
  return (
    <div className="installment-product-grid">
      {products.map((product) => <ProductCard product={product} key={product.id || product.slug || product.name} />)}
    </div>
  );
}

export default function InstallmentPage() {
  const [activeTab, setActiveTab] = useState('phone');
  const [activeBrand, setActiveBrand] = useState('all');
  const [sort, setSort] = useState('popular');
  const [showMoreArticle, setShowMoreArticle] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  const baseProducts = useMemo(() => {
    if (activeTab === 'laptop') return laptopProducts;
    if (activeTab === 'tv') return tvProducts;
    if (activeTab === 'tablet') {
      const tablets = phoneProducts.filter((product) => /ipad|tablet/i.test(product.name));
      return tablets.length ? tablets : phoneProducts.slice(0, 6);
    }
    if (activeTab === 'used') return [...phoneProducts.slice(0, 4), ...laptopProducts.slice(0, 3)].map((product) => ({
      ...product,
      id: `used-${product.id}`,
      name: `${product.name} - Hàng cũ đẹp`,
      currentPrice: Math.round(Number(product.currentPrice || 0) * 0.72 / 10000) * 10000,
      originalPrice: product.currentPrice,
      discount: 28,
    }));
    return phoneProducts;
  }, [activeTab]);

  const visibleProducts = useMemo(() => {
    let products = baseProducts.filter((product) => {
      if (activeBrand === 'all') return true;
      return normalizeText(`${product.brand || ''} ${product.name}`).includes(normalizeText(activeBrand));
    });

    products = [...products].sort((a, b) => {
      if (sort === 'price-asc') return Number(a.currentPrice || 0) - Number(b.currentPrice || 0);
      if (sort === 'price-desc') return Number(b.currentPrice || 0) - Number(a.currentPrice || 0);
      return Number(b.ratingCount || 0) - Number(a.ratingCount || 0);
    });

    return products.slice(0, 10);
  }, [activeBrand, baseProducts, sort]);

  return (
    <section className="installment-page">
      <div className="container installment-container">
        <nav className="installment-breadcrumb" aria-label="Breadcrumb">
          <a href="/">Trang chủ</a><span>/</span><strong>Mua hàng trả góp</strong>
        </nav>

        <h1>Mua điện thoại trả góp 0% - 0 trả trước - 0 phí tại CellphoneS</h1>

        <section className="installment-hero">
          <img
            src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/i-headbanner01-mb.jpg"
            alt="Trả góp 3 không tại CellphoneS"
          />
        </section>

        <section className="installment-section installment-methods-section">
          <h2>Các hình thức trả góp đa dạng</h2>
          <div className="installment-method-grid">
            {INSTALLMENT_METHODS.map((method) => (
              <article key={method.id}>
                <img src={method.image} alt="" loading="lazy" />
                <h3>{method.title}</h3>
                <p>{method.description}</p>
                <ul>{method.bullets.map((item) => <li key={item}>{item}</li>)}</ul>
                <a href={method.href}>Xem chi tiết</a>
              </article>
            ))}
          </div>
        </section>

        <section className="installment-section installment-process-section">
          <h2>Quy trình mua trả góp tại CellphoneS</h2>
          <div className="installment-process-grid">
            {PROCESS_STEPS.map((step, index) => (
              <article key={step.number}>
                <span>{step.number}</span>
                <img src={step.image} alt="" loading="lazy" />
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                {index < PROCESS_STEPS.length - 1 && <b aria-hidden="true">›</b>}
              </article>
            ))}
          </div>
        </section>

        <section className="installment-student-section">
          <div className="installment-student-copy">
            <span>S-FINANCE</span>
            <h2>Chương trình trả góp dành cho sinh viên</h2>
            <p>Hỗ trợ học sinh, sinh viên sở hữu thiết bị phục vụ học tập với phương án trả góp linh hoạt.</p>
            <div>
              <a href="/uu-dai-smember">Đăng ký S-Student</a>
              <a href="#installment-products">Mua sắm ngay</a>
            </div>
          </div>
          <img
            src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/s-finacing-30-m.jpg"
            alt="Chương trình trả góp sinh viên"
            loading="lazy"
          />
        </section>

        <section className="installment-section installment-products-section" id="installment-products">
          <div className="installment-product-title-image">
            <img
              src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/i-block-product-title03.png"
              alt="Sản phẩm ưu đãi trả góp"
              loading="lazy"
            />
          </div>

          <div className="installment-category-tabs">
            {PRODUCT_TABS.map(([id, label]) => (
              <button type="button" className={activeTab === id ? 'active' : ''} onClick={() => { setActiveTab(id); setActiveBrand('all'); }} key={id}>{label}</button>
            ))}
          </div>

          <div className="installment-brand-strip">
            {BRAND_LOGOS.map(([id, label, image]) => (
              <button type="button" className={activeBrand === id ? 'active' : ''} onClick={() => setActiveBrand(id)} key={id} aria-label={label}>
                {image ? <img src={image} alt={label} loading="lazy" /> : <span>{label}</span>}
              </button>
            ))}
          </div>

          <div className="installment-sort-row">
            <strong>Sắp xếp theo:</strong>
            <button type="button" className={sort === 'popular' ? 'active' : ''} onClick={() => setSort('popular')}>Phổ biến</button>
            <button type="button" className={sort === 'price-asc' ? 'active' : ''} onClick={() => setSort('price-asc')}>Giá thấp - cao</button>
            <button type="button" className={sort === 'price-desc' ? 'active' : ''} onClick={() => setSort('price-desc')}>Giá cao - thấp</button>
            <a href="/mobile.html">Xem tất cả</a>
          </div>

          {visibleProducts.length ? <ProductSection products={visibleProducts} /> : (
            <div className="installment-empty-products">Chưa có sản phẩm phù hợp với bộ lọc này.</div>
          )}
        </section>

        <article className={`installment-article ${showMoreArticle ? 'expanded' : ''}`}>
          <p className="installment-article-lead">
            Trả góp là phương thức mua sắm cho phép thanh toán dần giá trị sản phẩm theo từng kỳ thay vì trả toàn bộ một lần, giúp giảm áp lực tài chính.
          </p>
          <img
            src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/i-headbanner01-mb.jpg"
            alt="Trả góp 3 không tại CellphoneS"
            loading="lazy"
          />
          <h2>Các hình thức trả góp phổ biến</h2>
          <ul>
            <li><strong>Trả góp 0% qua thẻ tín dụng:</strong> thủ tục nhanh, thường có phí chuyển đổi tùy ngân hàng.</li>
            <li><strong>Trả góp qua công ty tài chính:</strong> sử dụng CCCD, xét duyệt theo hồ sơ tín dụng.</li>
            <li><strong>Mua trước trả sau:</strong> hoàn tất trực tuyến qua ứng dụng của đối tác.</li>
          </ul>
          <h2>Lợi ích và rủi ro khi mua trả góp</h2>
          <p>Sở hữu sản phẩm ngay và chia nhỏ chi phí theo tháng, nhưng cần kiểm tra lãi suất, phí chuyển đổi, phạt chậm trả và khả năng cân đối ngân sách.</p>
          <h2>Điều kiện để được trả góp</h2>
          <p>Điều kiện thay đổi theo ngân hàng hoặc công ty tài chính. Khách hàng thường cần giấy tờ hợp lệ, lịch sử tín dụng phù hợp và đủ khả năng thanh toán.</p>
          <div className="installment-article-extra">
            <h2>Quy trình mua điện thoại trả góp</h2>
            <p>Chọn sản phẩm → chọn hình thức trả góp → trả trước một phần nếu có → xác thực hồ sơ → ký hợp đồng → nhận máy và thanh toán theo kỳ.</p>
            <p>Trước khi xác nhận, nên so sánh tổng số tiền phải trả, kỳ hạn, phí chuyển đổi và quyền lợi khuyến mãi giữa các phương án.</p>
          </div>
          <button type="button" onClick={() => setShowMoreArticle((value) => !value)}>{showMoreArticle ? 'Thu gọn' : 'Xem thêm'}</button>
        </article>

        <section className="installment-faq-section">
          <h2>Câu hỏi thường gặp</h2>
          <div>
            {FAQ_ITEMS.map((item, index) => (
              <article className={openFaq === index ? 'open' : ''} key={item.question}>
                <button type="button" onClick={() => setOpenFaq(openFaq === index ? -1 : index)}>
                  <span>{item.question}</span><b>{openFaq === index ? '−' : '+'}</b>
                </button>
                <div><p>{item.answer}</p></div>
              </article>
            ))}
          </div>
          <a href="/support">Hãy đặt câu hỏi cho chúng tôi</a>
        </section>
      </div>
    </section>
  );
}
