import { useMemo, useState } from 'react';
import './FooterPages.css';
import {
  footerPolicyLinks,
  footerServiceLinks,
  resolveFooterPageProfile,
} from './footerPageProfiles';

const supportCards = [
  ['Mua hàng - bảo hành', '1800.2097', '7h30 - 22h00'],
  ['Khiếu nại', '1800.2063', '8h00 - 21h30'],
];

function PageHero({ profile }) {
  return (
    <header className={`footer-page-hero tone-${profile.tone || 'red'}`}>
      <div className="footer-page-hero-copy">
        <span>{profile.eyebrow}</span>
        <h1>{profile.title}</h1>
        <p>{profile.lead}</p>
        <div className="footer-page-hero-actions">
          <a href="tel:18002097">Gọi 1800.2097</a>
          <a href="/support">Gửi yêu cầu hỗ trợ</a>
        </div>
      </div>
      <div className="footer-page-hero-brand" aria-hidden="true">
        <strong>cellphone</strong><b>S</b>
      </div>
      {profile.heroImage && <img className="footer-page-hero-image" src={profile.heroImage} alt="" loading="lazy" />}
    </header>
  );
}

function Stats({ stats = [] }) {
  if (!stats.length) return null;
  return (
    <div className="footer-page-stats">
      {stats.map(([value, label]) => (
        <div key={`${value}-${label}`}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function FooterPageNavigation({ pathname, search }) {
  const current = `${pathname}${search || ''}`;
  const isActive = (href) => href === current || (!href.includes('?') && href === pathname);

  return (
    <aside className="footer-page-navigation">
      <section>
        <h2>Thông tin về chính sách</h2>
        {footerPolicyLinks.map(([label, href]) => (
          <a className={isActive(href) ? 'active' : ''} href={href} key={href}>{label}</a>
        ))}
      </section>
      <section>
        <h2>Dịch vụ và thông tin khác</h2>
        {footerServiceLinks.map(([label, href]) => (
          <a className={isActive(href) ? 'active' : ''} href={href} key={href}>{label}</a>
        ))}
      </section>
    </aside>
  );
}

function HelpAside() {
  return (
    <aside className="footer-page-help-aside">
      <section>
        <h2>Cần hỗ trợ?</h2>
        {supportCards.map(([label, phone, time]) => (
          <a href={`tel:${phone.replace(/\D/g, '')}`} key={phone}>
            <span>{label}</span>
            <strong>{phone}</strong>
            <small>{time}</small>
          </a>
        ))}
      </section>
      <section className="footer-page-help-actions">
        <a href="/tra-cuu-don-hang">Tra cứu đơn hàng</a>
        <a href="/dia-chi-cua-hang">Cửa hàng gần bạn</a>
        <a href="/support">Góp ý - Phản hồi</a>
      </section>
    </aside>
  );
}

function ArticleSections({ profile }) {
  return (
    <>
      {profile.sections?.map((section, index) => (
        <section className="footer-page-content-card" id={`footer-content-${index + 1}`} key={section.title}>
          <h2>{section.title}</h2>
          {section.body && <p>{section.body}</p>}
          {section.bullets?.length > 0 && (
            <ul>
              {section.bullets.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
        </section>
      ))}
      {profile.faq?.length > 0 && (
        <section className="footer-page-content-card footer-page-faq">
          <h2>Hỏi và đáp</h2>
          {profile.faq.map(([question, answer], index) => (
            <details open={index === 0} key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
          <a className="footer-page-primary-button" href="/support">Hãy đặt câu hỏi cho chúng tôi</a>
        </section>
      )}
    </>
  );
}

function ArticlePage({ profile }) {
  return (
    <>
      <PageHero profile={profile} />
      <Stats stats={profile.stats} />
      <ArticleSections profile={profile} />
    </>
  );
}

function LookupPage({ profile }) {
  const initialForm = useMemo(() => Object.fromEntries((profile.fields || []).map((field) => [field.name, ''])), [profile.fields]);
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState(null);

  const submit = (event) => {
    event.preventDefault();
    const firstValue = String(Object.values(form)[0] || '').trim();
    if (!firstValue) return;
    const resultByType = {
      points: {
        badge: 'S-NEW',
        title: 'Tài khoản Smember đã được ghi nhận',
        rows: [['Hạng thành viên', 'S-NEW'], ['Điểm khả dụng', '0 điểm'], ['Tổng chi tiêu', 'Đăng nhập để đồng bộ dữ liệu']],
      },
      warranty: {
        badge: 'Đang tra cứu',
        title: 'Chưa tìm thấy sản phẩm trong dữ liệu mô phỏng',
        rows: [['Thông tin đã nhập', firstValue], ['Trạng thái', 'Cần kết nối API bảo hành'], ['Hỗ trợ', '1800.2097']],
      },
      invoice: {
        badge: 'Hóa đơn điện tử',
        title: 'Yêu cầu tra cứu đã được tiếp nhận',
        rows: [['Mã tham chiếu', firstValue], ['Trạng thái', 'Cần kết nối hệ thống hóa đơn'], ['Hỗ trợ', '1800.2063']],
      },
    };
    setResult(resultByType[profile.lookupType]);
  };

  return (
    <>
      <PageHero profile={profile} />
      <Stats stats={profile.stats} />
      <section className="footer-page-lookup-card">
        <div className="footer-page-lookup-copy">
          <span>{profile.eyebrow}</span>
          <h2>{profile.title}</h2>
          <p>{profile.lead}</p>
        </div>
        <form onSubmit={submit}>
          {profile.fields.map((field) => (
            <label key={field.name}>
              <span>{field.label}{field.optional ? ' (không bắt buộc)' : ''}</span>
              <input
                type={field.type || 'text'}
                placeholder={field.placeholder}
                value={form[field.name]}
                onChange={(event) => setForm((previous) => ({ ...previous, [field.name]: event.target.value }))}
                required={!field.optional}
              />
            </label>
          ))}
          <button type="submit">Tra cứu</button>
        </form>
      </section>
      {result && (
        <section className="footer-page-lookup-result">
          <div>
            <span>{result.badge}</span>
            <h2>{result.title}</h2>
          </div>
          <dl>
            {result.rows.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </section>
      )}
    </>
  );
}

function BenefitsGrid({ benefits = [] }) {
  return (
    <div className="footer-page-benefit-grid">
      {benefits.map(([title, text], index) => (
        <article key={title}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <h3>{title}</h3>
          <p>{text}</p>
        </article>
      ))}
    </div>
  );
}

function MemberPage({ profile }) {
  return (
    <>
      <PageHero profile={profile} />
      <Stats stats={profile.stats} />
      <section className="footer-page-content-card">
        <div className="footer-page-section-heading">
          <span>Đặc quyền Smember</span>
          <h2>Một tài khoản, nhiều quyền lợi</h2>
        </div>
        <BenefitsGrid benefits={profile.benefits} />
      </section>
      <section className="footer-page-member-cta">
        <div><span>SMEMBER</span><h2>Đăng nhập để xem ưu đãi dành riêng cho bạn</h2></div>
        <a href="/smember">Mở tài khoản Smember</a>
      </section>
    </>
  );
}

function ServiceSteps({ steps = [] }) {
  return (
    <div className="footer-page-process-grid">
      {steps.map(([number, title, text]) => (
        <article key={number}>
          <span>{number}</span>
          <h3>{title}</h3>
          <p>{text}</p>
        </article>
      ))}
    </div>
  );
}

function AppleServicePage({ profile }) {
  return (
    <>
      <PageHero profile={profile} />
      <Stats stats={profile.stats} />
      <section className="footer-page-content-card">
        <div className="footer-page-section-heading"><span>Quy trình</span><h2>Tiếp nhận bảo hành Apple</h2></div>
        <ServiceSteps steps={profile.serviceSteps} />
      </section>
      <section className="footer-page-content-card">
        <h2>Địa điểm tiếp nhận</h2>
        <div className="footer-page-location-grid">
          {profile.locations.map(([title, address]) => <article key={title}><strong>{title}</strong><p>{address}</p><a href="/dia-chi-cua-hang">Xem cửa hàng</a></article>)}
        </div>
      </section>
    </>
  );
}

function VatPage({ profile }) {
  return (
    <>
      <PageHero profile={profile} />
      <Stats stats={profile.stats} />
      <section className="footer-page-content-card">
        <div className="footer-page-section-heading"><span>Tax refund procedure</span><h2>Quy trình hoàn thuế</h2></div>
        <ServiceSteps steps={profile.serviceSteps} />
      </section>
      <ArticleSections profile={profile} />
      <section className="footer-page-vat-stores">
        <div><span>LIST OF TAX REFUND STORES</span><h2>Cửa hàng hỗ trợ hoàn thuế</h2></div>
        <div><button type="button" className="active">Southern Region</button><button type="button">Central Region</button><button type="button">Northern Region</button></div>
        <a href="/dia-chi-cua-hang">Xem danh sách cửa hàng</a>
      </section>
    </>
  );
}

function BusinessPage({ profile }) {
  return (
    <>
      <PageHero profile={profile} />
      <Stats stats={profile.stats} />
      <section className="footer-page-content-card">
        <div className="footer-page-section-heading"><span>S-Business</span><h2>Quyền lợi dành cho doanh nghiệp</h2></div>
        <BenefitsGrid benefits={profile.benefits} />
      </section>
      <section className="footer-page-content-card">
        <h2>Chi tiết phần trăm ưu đãi</h2>
        <div className="footer-page-table-wrap">
          <table><thead><tr><th>Giá trị đơn hàng</th><th>Apple mới</th><th>Android</th><th>Phụ kiện</th><th>Tivi & Điện máy</th></tr></thead><tbody>{profile.discountTable.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={`${cell}-${index}`}>{cell}</td>)}</tr>)}</tbody></table>
        </div>
        <a className="footer-page-primary-button" href="/smember">Đăng ký S-Business</a>
      </section>
    </>
  );
}

function WarrantyBrandsPage({ profile }) {
  const [query, setQuery] = useState('');
  const brands = profile.brands.filter((brand) => brand.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <PageHero profile={profile} />
      <Stats stats={profile.stats} />
      <section className="footer-page-content-card footer-page-brand-search">
        <h2>Chọn hãng cần tìm điểm bảo hành</h2>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mời nhập tên hãng cần tìm" />
        <div className="footer-page-brand-grid">
          {brands.map((brand) => <a href={`/catalogsearch/result?q=${encodeURIComponent(brand)}`} key={brand}>{brand}</a>)}
        </div>
      </section>
    </>
  );
}

function ContactPage({ profile }) {
  return (
    <>
      <PageHero profile={profile} />
      <section className="footer-page-contact-grid">
        {profile.contacts.map(([title, contact, email]) => (
          <article key={title}>
            <span>CELLPHONES</span><h2>{title}</h2><strong>{contact}</strong><a href={`mailto:${email}`}>{email}</a>
          </article>
        ))}
      </section>
      <section className="footer-page-content-card footer-page-contact-note">
        <h2>CellphoneS và Điện Thoại Vui trân trọng cảm ơn</h2>
        <p>Thông tin hợp tác sẽ được chuyển đến bộ phận phù hợp để phản hồi trong thời gian sớm nhất.</p>
      </section>
    </>
  );
}

function JobsPage({ profile }) {
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('Tất cả');
  const jobs = profile.jobs.filter((job) => {
    const text = job.join(' ').toLowerCase();
    return text.includes(keyword.toLowerCase()) && (location === 'Tất cả' || text.includes(location.toLowerCase()));
  });
  return (
    <>
      <PageHero profile={profile} />
      <Stats stats={profile.stats} />
      <section className="footer-page-job-search">
        <label><span>Bạn đang tìm kiếm</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Việc làm, vị trí ứng tuyển..." /></label>
        <label><span>Nơi bạn muốn làm việc</span><select value={location} onChange={(event) => setLocation(event.target.value)}><option>Tất cả</option><option>TP. Hồ Chí Minh</option><option>Hà Nội</option></select></label>
        <button type="button">Tìm kiếm</button>
      </section>
      <section className="footer-page-content-card">
        <div className="footer-page-section-heading"><span>Vị trí nổi bật</span><h2>Cơ hội đang tuyển</h2></div>
        <div className="footer-page-job-grid">
          {jobs.map(([title, group, place, salary]) => <article key={title}><span>{group}</span><h3>{title}</h3><p>{place}</p><strong>{salary}</strong><button type="button">Ứng tuyển ngay</button></article>)}
        </div>
      </section>
      <section className="footer-page-office-grid">
        {profile.offices.map(([title, address, phone, email]) => <article key={title}><h2>{title}</h2><p>{address}</p><a href={`tel:${phone.replace(/\D/g, '')}`}>{phone}</a><a href={`mailto:${email}`}>{email}</a></article>)}
      </section>
    </>
  );
}

function ExtendedWarrantyPage({ profile }) {
  const [activePlan, setActivePlan] = useState(0);
  return (
    <>
      <PageHero profile={profile} />
      <Stats stats={profile.stats} />
      <section className="footer-page-content-card">
        <div className="footer-page-section-heading"><span>Gói dịch vụ</span><h2>Chi tiết bảo hành mở rộng</h2></div>
        <div className="footer-page-plan-tabs">
          {profile.plans.map(([name], index) => <button type="button" className={activePlan === index ? 'active' : ''} onClick={() => setActivePlan(index)} key={name}>{name}</button>)}
        </div>
        <article className="footer-page-plan-detail">
          <span>{profile.plans[activePlan][2]}</span><h2>{profile.plans[activePlan][0]}</h2><p><strong>Sản phẩm áp dụng:</strong> {profile.plans[activePlan][1]}</p><p>{profile.plans[activePlan][3]}</p>
        </article>
      </section>
      <section className="footer-page-content-card">
        <h2>Biểu phí tham khảo điện thoại và máy tính bảng</h2>
        <div className="footer-page-table-wrap"><table><thead><tr><th>Khoảng giá máy</th><th>VIP 6 tháng</th><th>VIP 12 tháng</th><th>Rơi vỡ - Rơi nước</th></tr></thead><tbody>{profile.priceTable.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={`${cell}-${index}`}>{cell}</td>)}</tr>)}</tbody></table></div>
      </section>
    </>
  );
}

function MainContent({ profile }) {
  if (profile.kind === 'lookup') return <LookupPage profile={profile} />;
  if (profile.kind === 'member') return <MemberPage profile={profile} />;
  if (profile.kind === 'apple-service') return <AppleServicePage profile={profile} />;
  if (profile.kind === 'vat') return <VatPage profile={profile} />;
  if (profile.kind === 'business') return <BusinessPage profile={profile} />;
  if (profile.kind === 'warranty-brands') return <WarrantyBrandsPage profile={profile} />;
  if (profile.kind === 'contact') return <ContactPage profile={profile} />;
  if (profile.kind === 'jobs') return <JobsPage profile={profile} />;
  if (profile.kind === 'extended-warranty') return <ExtendedWarrantyPage profile={profile} />;
  return <ArticlePage profile={profile} />;
}

export default function FooterPages({ pathname = window.location.pathname, search = window.location.search }) {
  const profile = resolveFooterPageProfile(pathname, search);

  if (!profile) {
    return (
      <section className="footer-pages-shell">
        <div className="container footer-pages-container">
          <div className="footer-page-missing"><h1>Nội dung đang được cập nhật</h1><p>Trang này chưa có mẫu giao diện tương ứng.</p><a href="/">Về trang chủ</a></div>
        </div>
      </section>
    );
  }

  return (
    <section className="footer-pages-shell">
      <div className="container footer-pages-container">
        <nav className="footer-page-breadcrumb" aria-label="Breadcrumb"><a href="/">Trang chủ</a><span>/</span><strong>{profile.title}</strong></nav>
        <div className="footer-page-layout">
          <FooterPageNavigation pathname={pathname} search={search} />
          <main className="footer-page-main"><MainContent profile={profile} /></main>
          <HelpAside />
        </div>
      </div>
    </section>
  );
}
