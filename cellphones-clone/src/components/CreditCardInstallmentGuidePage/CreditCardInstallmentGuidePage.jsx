import { useState } from 'react';
import './CreditCardInstallmentGuidePage.css';

const BANK_IMAGE = 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:0/q:100/plain/https://cellphones.com.vn/media/wysiwyg/20260623-102231.jpg';
const HERO_IMAGE = 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:0/q:100/plain/https://cellphones.com.vn/media/wysiwyg/tra-gop-3-0-12-20245-desk.png';
const PROGRAM_IMAGE = 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:0/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Screenshot_3_9.png';
const ANT_IMAGE = 'https://cdn2.cellphones.com.vn/insecure/rs:fill:160:0/q:90/plain/https://cellphones.com.vn/media/wysiwyg/ant-hello-2025.png';

const DIRECT_BANKS = [
  'UOB', 'Sacombank', 'BVBank', 'MBBank', 'VPBank', 'VIB', 'Vietcombank', 'MSB',
  'BIDV', 'Shinhan Bank', 'OCB', 'Home Credit', 'HSBC', 'Standard Chartered',
  'ACB', 'Techcombank', 'Nam Á Bank', 'VietinBank',
];

const THREE_ZERO_ROWS = [
  {
    product: 'Laptop mới / Điện máy',
    banks: 'UOB, Shinhan Bank, VIB, HSBC, BIDV, MSB, Home Credit, Sacombank, Techcombank, ACB, Standard Chartered, VietinBank, BVBank, MBBank, Nam Á',
    method: 'Tại cửa hàng CellphoneS',
    term: '3 - 6 - 9 - 12',
  },
  {
    product: 'iPhone mới / Laptop mới',
    banks: 'Nhóm ngân hàng liên kết trực tiếp, bổ sung OCB, Vietcombank và VPBank theo chương trình',
    method: 'Tại cửa hàng CellphoneS',
    term: '6',
  },
  {
    product: 'Sản phẩm khác',
    banks: 'Ngân hàng liên kết trực tiếp CellphoneS',
    method: 'Tại cửa hàng CellphoneS',
    term: '3 - 6',
  },
  {
    product: 'iPhone cũ / Apple mới, trừ iPhone',
    banks: 'Ngân hàng liên kết trực tiếp và ngân hàng hỗ trợ qua KBANK hoặc OnePay',
    method: 'Cửa hàng, KBANK hoặc OnePay',
    term: '3 - 6 - 9',
  },
  {
    product: 'Điện máy',
    banks: 'Ngân hàng hỗ trợ qua KBANK',
    method: 'Cổng KBANK',
    term: '3 - 6 - 9 - 12',
  },
  {
    product: 'iPhone mới / sản phẩm khác, trừ Laptop mới',
    banks: 'Ngân hàng hỗ trợ qua KBANK',
    method: 'Cổng KBANK',
    term: '3 - 6',
  },
  {
    product: 'Điện máy',
    banks: 'Ngân hàng hỗ trợ qua OnePay',
    method: 'OnePay trên website',
    term: '3 - 6 - 9 - 12',
  },
  {
    product: 'iPhone mới / sản phẩm khác, trừ Laptop mới',
    banks: 'Ngân hàng hỗ trợ qua OnePay',
    method: 'OnePay trên website',
    term: '3 - 6',
  },
];

const SAMPLE_FAQ = [
  {
    question: 'Tôi có thể dùng thẻ Debit để trả góp không?',
    answer: 'Không. Chương trình áp dụng cho thẻ tín dụng Visa, Mastercard hoặc JCB đủ điều kiện và được phát hành tại Việt Nam.',
  },
  {
    question: 'Sau khi chuyển đổi trả góp có thể hủy giao dịch không?',
    answer: 'Giao dịch đã được ngân hàng chuyển sang trả góp thường không thể hủy theo cách thông thường. Khách hàng nên kiểm tra kỹ sản phẩm, kỳ hạn và phí trước khi xác nhận.',
  },
  {
    question: 'Số tiền tối thiểu để đăng ký trả góp là bao nhiêu?',
    answer: 'Mức tối thiểu thường từ 3.000.000đ và có thể thay đổi theo ngân hàng, cổng thanh toán hoặc chương trình đang áp dụng.',
  },
];

function BulletList({ items }) {
  return (
    <ul className="credit-installment-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export default function CreditCardInstallmentGuidePage() {
  const [question, setQuestion] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  const submitQuestion = (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    setQuestion('');
    setSubmitted(true);
  };

  return (
    <section className="credit-installment-page">
      <div className="container credit-installment-container">
        <nav className="credit-installment-breadcrumb" aria-label="Breadcrumb">
          <a href="/">Trang chủ</a><span>/</span><a href="/tra-gop">Trả góp</a><span>/</span><strong>Trả góp bằng thẻ tín dụng</strong>
        </nav>

        <article className="credit-installment-article">
          <img className="credit-installment-hero" src={HERO_IMAGE} alt="Trả góp bằng thẻ tín dụng tại CellphoneS" />
          <h1>HƯỚNG DẪN MUA TRẢ GÓP BẰNG THẺ TÍN DỤNG</h1>

          <div className="credit-installment-intro">
            <strong>Đối tượng áp dụng</strong>
            <p>
              Chủ thẻ tín dụng Visa, Mastercard hoặc JCB do ngân hàng tại Việt Nam phát hành. Không áp dụng thẻ phụ,
              thẻ ghi nợ hoặc giao dịch cà thẻ tại nhà.
            </p>
          </div>

          <section>
            <h2>1. CÁC HÌNH THỨC MUA HÀNG TRẢ GÓP THẺ TÍN DỤNG</h2>
            <h3>Ngân hàng và kỳ hạn áp dụng</h3>
            <div className="credit-installment-method-grid">
              <article>
                <span>01</span>
                <h4>Liên kết trực tiếp tại cửa hàng</h4>
                <p>Cà thẻ và đăng ký chuyển đổi ngay tại CellphoneS. Một số chương trình hỗ trợ kỳ hạn đến 12 tháng.</p>
              </article>
              <article>
                <span>02</span>
                <h4>Qua cổng KBANK</h4>
                <p>Thực hiện tại cửa hàng với hơn 30 ngân hàng, kỳ hạn phổ biến 3, 6, 9 hoặc 12 tháng.</p>
              </article>
              <article>
                <span>03</span>
                <h4>Qua OnePay trên website</h4>
                <p>Thanh toán trực tuyến qua cổng OnePay với kỳ hạn 3, 6, 9 hoặc 12 tháng tùy ngân hàng.</p>
              </article>
            </div>

            <div className="credit-installment-bank-box">
              <h3>Ngân hàng liên kết trực tiếp</h3>
              <p>{DIRECT_BANKS.join(', ')}.</p>
              <img src={BANK_IMAGE} alt="Danh sách ngân hàng hỗ trợ trả góp" loading="lazy" />
            </div>

            <h3>Quy định chung</h3>
            <BulletList items={[
              'Không giới hạn số lần mua nếu hạn mức tín dụng còn đủ.',
              'Không nên hủy giao dịch sau khi ngân hàng đã chuyển đổi sang trả góp.',
              'Thẻ phải còn hiệu lực trong toàn bộ thời gian đăng ký kỳ hạn.',
              'Giao dịch cận ngày sao kê có thể không đủ điều kiện chuyển đổi.',
              'Ngân hàng có thể từ chối khi thẻ không chính chủ, hết hạn, không đủ hạn mức, có nợ quá hạn hoặc phát sinh lỗi xác thực.',
            ]} />
          </section>

          <section>
            <h2>2. CHƯƠNG TRÌNH TRẢ GÓP 3 KHÔNG</h2>
            <div className="credit-installment-three-zero">
              <div><strong>0%</strong><span>Lãi suất</span></div>
              <div><strong>0đ</strong><span>Trả trước</span></div>
              <div><strong>0đ</strong><span>Phụ phí theo chương trình</span></div>
            </div>

            <div className="credit-installment-table-wrap">
              <table>
                <thead>
                  <tr><th>Sản phẩm áp dụng</th><th>Ngân hàng</th><th>Hình thức</th><th>Kỳ hạn</th></tr>
                </thead>
                <tbody>
                  {THREE_ZERO_ROWS.map((row) => (
                    <tr key={`${row.product}-${row.method}`}>
                      <td>{row.product}</td><td>{row.banks}</td><td>{row.method}</td><td>{row.term} tháng</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="credit-installment-channel-note">
              <div><strong>Tại cửa hàng</strong><span>Nhân viên tư vấn, hỗ trợ cà thẻ và hoàn tất đăng ký chuyển đổi.</span></div>
              <div><strong>Trên website</strong><span>Chọn sản phẩm, chọn trả góp qua OnePay và kỳ hạn được hỗ trợ.</span></div>
            </div>

            <img className="credit-installment-program-image" src={PROGRAM_IMAGE} alt="Minh họa chương trình trả góp" loading="lazy" />
          </section>

          <section>
            <h2>3. CÁCH CHUYỂN ĐỔI TRẢ GÓP BẰNG THẺ TÍN DỤNG</h2>
            <div className="credit-installment-process">
              <article>
                <span>1</span><div><h3>Ngân hàng liên kết trực tiếp</h3><p>Cà thẻ và điền mẫu đăng ký tại CellphoneS. Hồ sơ được chuyển đến ngân hàng để xử lý, khách hàng không cần thao tác bổ sung nếu giao dịch đủ điều kiện.</p></div>
              </article>
              <article>
                <span>2</span><div><h3>OnePay hoặc MPOS</h3><p>Chọn số tiền, kỳ hạn và hoàn tất thanh toán. Cổng thanh toán gửi yêu cầu đến ngân hàng để chuyển đổi giao dịch sang trả góp.</p></div>
              </article>
            </div>

            <div className="credit-installment-warning">
              <strong>Lưu ý về chi phí</strong>
              <BulletList items={[
                'Một số ngân hàng hoặc kỳ hạn ngoài chương trình 3 Không có thể thu phí chuyển đổi.',
                'Giá trị đăng ký thường từ 3.000.000đ và tối đa bằng giá trị đơn hàng.',
                'Hãy kiểm tra tổng tiền phải trả trước khi xác nhận giao dịch.',
              ]} />
            </div>
          </section>

          <section>
            <h2>4. ĐĂNG KÝ TRẢ GÓP QUA THẺ TÍN DỤNG TRÊN WEBSITE</h2>
            <div className="credit-installment-online-guide">
              <div>
                <span>HƯỚNG DẪN ONLINE</span>
                <h3>Thực hiện trả góp trực tiếp trên website</h3>
                <p>Xem quy trình chọn sản phẩm, nhập thông tin, chọn ngân hàng, kỳ hạn và hoàn tất thanh toán.</p>
              </div>
              <a href="/tra-gop-online-the-tin-dung">Xem hướng dẫn chi tiết</a>
            </div>
          </section>

          <section>
            <h2>5. LƯU Ý</h2>
            <p className="credit-installment-vat-note">Đơn hàng tham gia trả góp bằng thẻ tín dụng không áp dụng xuất hóa đơn VAT cho công ty.</p>
          </section>
        </article>

        <section className="credit-installment-faq">
          <h2>Hỏi và đáp</h2>
          <div className="credit-installment-faq-head">
            <img src={ANT_IMAGE} alt="CellphoneS hỗ trợ" />
            <div><h3>Hãy đặt câu hỏi cho chúng tôi</h3><p>CellphoneS sẽ phản hồi trong giờ hỗ trợ. Thông tin ngân hàng và kỳ hạn có thể thay đổi theo chương trình.</p></div>
          </div>

          <form onSubmit={submitQuestion}>
            <textarea value={question} onChange={(event) => { setQuestion(event.target.value); setSubmitted(false); }} placeholder="Mời bạn để lại câu hỏi..." rows={4} />
            <button type="submit">Gửi câu hỏi</button>
          </form>
          {submitted && <p className="credit-installment-success">Câu hỏi đã được ghi nhận trên giao diện mô phỏng.</p>}

          <div className="credit-installment-faq-list">
            {SAMPLE_FAQ.map((item, index) => (
              <article className={openFaq === index ? 'open' : ''} key={item.question}>
                <button type="button" onClick={() => setOpenFaq(openFaq === index ? -1 : index)}>
                  <span>{item.question}</span><b>{openFaq === index ? '−' : '+'}</b>
                </button>
                <div><p>{item.answer}</p></div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
