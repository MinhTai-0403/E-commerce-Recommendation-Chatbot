import { useState } from 'react';
import './RefundPolicyPage.css';

const TOS_SECTIONS = [
  ['I', 'Quy định chung', '/tos'],
  ['II', 'Quy trình giao dịch', '/tos?part=transaction-process'],
  ['III', 'Chính sách bảo hành sản phẩm', '/tos?part=warranty-policy'],
  ['IV', 'Chính sách huỷ giao dịch, đổi trả hàng', '/tos?part=refund-policy'],
  ['V', 'Bảo mật thông tin khách hàng CellphoneS', '/tos?part=privacy-policy'],
  ['VI', 'Bảo mật thông tin khách hàng Sforum', '/tos?part=sforum-privacy-policy'],
  ['VII', 'Thoả thuận sử dụng dịch vụ Sforum', '/tos?part=sforum-terms'],
];

const RETURN_ROWS = [
  ['Điện thoại / Máy tính bảng / MacBook', '30 ngày', '30 ngày', '20%', '15%', 'Thoả thuận', 'Thoả thuận'],
  ['Apple Watch', '30 ngày', '30 ngày', '20%', '20%', 'Thoả thuận', 'Thoả thuận'],
  ['Samsung Watch', '30 ngày', '30 ngày', '30%', '30%', 'Thoả thuận', 'Thoả thuận'],
  ['Laptop', '30 ngày', '30 ngày', '20%', 'Không áp dụng', 'Không áp dụng', 'Không áp dụng'],
  ['Phụ kiện dưới 1 triệu', '1 năm', '30 ngày', 'Không áp dụng', 'Không áp dụng', 'Không áp dụng', 'Không áp dụng'],
  ['Phụ kiện trên 1 triệu', '15 ngày', '15 ngày', 'Không áp dụng (*)', 'Không áp dụng (*)', 'Không áp dụng (**)', 'Không áp dụng (**)'],
  ['Bảo hành mở rộng', 'Không áp dụng', 'Không áp dụng', 'Không áp dụng (***)', 'Không áp dụng (***)', 'Không áp dụng', 'Không áp dụng'],
];

const REFUND_ROWS = [
  ['Tiền mặt', 'Hoàn ngay tại cửa hàng'],
  ['Chuyển khoản', 'Trong vòng 02 ngày làm việc'],
  ['Thẻ ATM', 'Trong vòng 7 - 10 ngày làm việc'],
  ['Visa / Mastercard / JCB', 'Trong vòng 7 - 15 ngày làm việc'],
  ['MPOS / Alepay', 'Trong vòng 7 - 14 ngày làm việc'],
  ['VNPay', 'Trong vòng 3 - 8 ngày làm việc'],
  ['Ví Moca', 'Trong vòng 3 - 5 ngày làm việc'],
];

const SAMPLE_QA = [
  {
    question: 'Máy đã kích hoạt nhưng chưa sử dụng có đổi trả được không?',
    answer: 'Sản phẩm được kiểm tra theo thời hạn, ngoại quan, hộp, phụ kiện, tài khoản và chính sách của từng nhóm hàng. Bạn nên mang máy cùng đầy đủ phụ kiện đến cửa hàng để được đánh giá trực tiếp.',
  },
  {
    question: 'Đơn mua online tính thời gian đổi trả từ ngày nào?',
    answer: 'Thời gian được tính từ ngày khách nhận hàng, nhưng không vượt quá giới hạn so với ngày trên hóa đơn theo chính sách hiện hành.',
  },
];

function PolicyList({ children }) {
  return <ul className="refund-policy-list">{children}</ul>;
}

export default function RefundPolicyPage() {
  const [question, setQuestion] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    setQuestion('');
    setSubmitted(true);
  };

  return (
    <section className="refund-policy-page">
      <div className="container refund-policy-container">
        <nav className="refund-policy-breadcrumb" aria-label="Breadcrumb">
          <a href="/">Trang chủ</a><span>/</span><a href="/tos">Quy chế hoạt động</a><span>/</span><strong>Chính sách đổi trả</strong>
        </nav>

        <div className="refund-policy-layout">
          <aside className="refund-policy-toc">
            <h2>Quy chế hoạt động</h2>
            {TOS_SECTIONS.map(([number, label, href]) => (
              <a className={number === 'IV' ? 'active' : ''} href={href} key={number}>
                <span>{number}</span><strong>{label}</strong>
              </a>
            ))}
          </aside>

          <main className="refund-policy-main">
            <article className="refund-policy-article">
              <header>
                <p>QUY CHẾ HOẠT ĐỘNG WEBSITE CUNG CẤP DỊCH VỤ TMĐT CELLPHONES.COM.VN</p>
                <h1>IV. CHÍNH SÁCH HUỶ GIAO DỊCH, ĐỔI TRẢ HÀNG</h1>
              </header>

              <section>
                <h2>1. Chính sách hủy giao dịch</h2>
                <h3>1.1. Điều kiện hủy giao dịch</h3>
                <p>Khách hàng có thể yêu cầu hủy kể từ lúc hoàn tất thao tác đặt hàng đến trước thời điểm nhận hàng thành công.</p>

                <h3>1.2. Phương thức hủy giao dịch</h3>
                <PolicyList>
                  <li>Gọi tổng đài <a href="tel:18002097">1800.2097</a> hoặc gửi email đến <a href="mailto:cskh@cellphones.com.vn">cskh@cellphones.com.vn</a>.</li>
                  <li>Liên hệ fanpage chính thức CellphoneS để báo hủy đơn.</li>
                  <li>Từ chối nhận hàng và xác nhận hủy khi đơn vị vận chuyển giao tới.</li>
                </PolicyList>
              </section>

              <section>
                <h2>2. Chính sách đổi, trả hàng</h2>
                <h3>2.1. Thời gian đổi trả</h3>

                <div className="refund-policy-table-wrap return-table">
                  <table>
                    <thead>
                      <tr>
                        <th rowSpan="2">Loại sản phẩm</th>
                        <th colSpan="2">Thời gian đổi mới tiêu chuẩn</th>
                        <th colSpan="2">Trong thời gian tiêu chuẩn</th>
                        <th colSpan="2">Ngoài thời gian tiêu chuẩn</th>
                      </tr>
                      <tr>
                        <th>Mới</th><th>Cũ</th><th>Mới</th><th>Cũ</th><th>Mới</th><th>Cũ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RETURN_ROWS.map((row) => (
                        <tr key={row[0]}>{row.map((cell, index) => <td key={`${cell}-${index}`}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="refund-policy-footnotes">
                  <p>(*) AirPods nhập trả trong thời gian áp dụng có thể khấu trừ 20%.</p>
                  <p>(**) AirPods ngoài thời gian tiêu chuẩn được định giá theo thỏa thuận.</p>
                  <p>(***) Gói bảo hành mở rộng có thể nhập trả trong 7 ngày đầu và khấu trừ 50% phí.</p>
                </div>

                <div className="refund-policy-note">
                  <strong>Đơn hàng giao online</strong>
                  <p>Thời gian được tính từ ngày nhận hàng và không vượt quá giới hạn quy định so với ngày trên hóa đơn. Ngoài thời gian đổi trả, sản phẩm được tiếp nhận theo chính sách bảo hành.</p>
                </div>

                <h3>2.2. Điều kiện đổi trả</h3>
                <PolicyList>
                  <li><strong>Máy mới:</strong> Không trầy xước, không dán decal hoặc trang trí làm thay đổi hiện trạng.</li>
                  <li><strong>Máy cũ:</strong> Giữ tình trạng tương đương thời điểm mua.</li>
                  <li><strong>Hộp sản phẩm:</strong> Không móp méo, rách, vỡ, viết vẽ hoặc dán keo; Serial/IMEI trên hộp trùng với máy.</li>
                  <li><strong>Phụ kiện và quà tặng:</strong> Đầy đủ, không gãy, móp, méo hoặc biến dạng; tem bảo hành còn nguyên theo yêu cầu.</li>
                  <li><strong>Tài khoản:</strong> Đã đăng xuất iCloud, Google Account, Mi Account và các tài khoản bảo mật khác.</li>
                </PolicyList>

                <div className="refund-policy-condition-grid">
                  <article><span>01</span><strong>Ngoại quan</strong><p>Máy, hộp và phụ kiện đáp ứng điều kiện tiếp nhận.</p></article>
                  <article><span>02</span><strong>IMEI / Serial</strong><p>Thông tin trên hộp và thiết bị phải trùng khớp.</p></article>
                  <article><span>03</span><strong>Tài khoản</strong><p>Đăng xuất toàn bộ tài khoản cá nhân trước khi bàn giao.</p></article>
                  <article><span>04</span><strong>Chứng từ</strong><p>Chuẩn bị hóa đơn và giấy tờ doanh nghiệp khi cần.</p></article>
                </div>

                <h3>2.3. Hướng dẫn gửi trả lại sản phẩm</h3>
                <h4>a. Kiểm tra điều kiện đổi trả</h4>
                <p>Trước khi gửi sản phẩm, khách hàng cần kiểm tra và bảo đảm thiết bị đáp ứng đầy đủ các điều kiện tại mục 2.2.</p>

                <h4>b. Các bước thực hiện đổi - trả</h4>
                <div className="refund-policy-method-grid">
                  <article>
                    <span>TRỰC TIẾP</span>
                    <h4>Đổi trả tại cửa hàng</h4>
                    <p>Mang sản phẩm và toàn bộ phụ kiện tới cửa hàng CellphoneS gần nhất để nhân viên kiểm tra.</p>
                    <a href="/dia-chi-cua-hang">Xem hệ thống cửa hàng</a>
                  </article>
                  <article>
                    <span>VẬN CHUYỂN</span>
                    <h4>Gửi qua đơn vị chuyển phát</h4>
                    <p>Khách hàng có thể gửi qua VNPost, Viettel Post hoặc sử dụng gói thu hồi hàng tại nội thành Hà Nội và TP.HCM theo hướng dẫn.</p>
                  </article>
                </div>

                <PolicyList>
                  <li>CellphoneS không chịu trách nhiệm nếu sản phẩm hư hỏng do lỗi đóng gói hoặc lỗi của đơn vị vận chuyển.</li>
                  <li>Chi phí vận chuyển chỉ được hỗ trợ đối với trường hợp đủ điều kiện đổi trả do lỗi nhà sản xuất.</li>
                </PolicyList>

                <div className="refund-policy-company-box">
                  <h4>Đổi trả đối với sản phẩm đã xuất hóa đơn công ty</h4>
                  <p>Doanh nghiệp cần cung cấp biên bản trả hàng, thu hồi hóa đơn hoặc biên bản điều chỉnh hóa đơn có xác nhận hợp lệ. Khi hồ sơ không đầy đủ, phần thuế tương ứng có thể bị khấu trừ theo thuế suất sản phẩm.</p>
                </div>

                <h3>2.4. Hoàn tiền</h3>
                <div className="refund-policy-table-wrap refund-table">
                  <table>
                    <thead><tr><th>Phương thức thanh toán</th><th>Thời gian hoàn dự kiến</th></tr></thead>
                    <tbody>{REFUND_ROWS.map(([method, time]) => <tr key={method}><td>{method}</td><td>{time}</td></tr>)}</tbody>
                  </table>
                </div>

                <div className="refund-policy-note warning">
                  <strong>Lưu ý</strong>
                  <p>Ngày làm việc không bao gồm cuối tuần và ngày nghỉ lễ. Phí vận chuyển, phụ phí, phí chuyển đổi trả góp và ưu đãi cộng thêm có thể không được hoàn lại.</p>
                </div>
              </section>
            </article>

            <section className="refund-policy-qa">
              <h2>Hỏi và đáp</h2>
              <div className="refund-policy-qa-head">
                <img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:160:0/q:90/plain/https://cellphones.com.vn/media/wysiwyg/ant-hello-2025.png" alt="CellphoneS hỗ trợ" />
                <div>
                  <h3>Hãy đặt câu hỏi cho chúng tôi</h3>
                  <p>CellphoneS sẽ phản hồi trong giờ hỗ trợ. Chính sách có thể được cập nhật theo từng thời điểm và nhóm sản phẩm.</p>
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                <textarea rows="4" value={question} onChange={(event) => { setQuestion(event.target.value); setSubmitted(false); }} placeholder="Mời bạn để lại câu hỏi..." />
                <button type="submit">Gửi câu hỏi</button>
              </form>
              {submitted && <p className="refund-policy-success">Câu hỏi đã được ghi nhận trên giao diện mô phỏng.</p>}

              <div className="refund-policy-question-list">
                {SAMPLE_QA.map((item) => (
                  <article key={item.question}>
                    <span>K</span>
                    <div>
                      <strong>Khách hàng</strong>
                      <p>{item.question}</p>
                      <div className="refund-policy-admin-reply"><b>QTV</b><p>{item.answer}</p></div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </main>

          <aside className="refund-policy-support">
            <section>
              <h2>Liên hệ</h2>
              <p>Tổng đài hỗ trợ miễn phí</p>
              <a href="tel:18002097"><span>Mua hàng - bảo hành</span><strong>1800.2097</strong><small>7h30 - 22h00</small></a>
              <a href="tel:18002063"><span>Khiếu nại</span><strong>1800.2063</strong><small>8h00 - 21h30</small></a>
            </section>
            <section>
              <a href="/chinh-sach-bao-hanh">Chính sách bảo hành</a>
              <a href="/chinh-sach-giao-hang">Chính sách giao hàng</a>
              <a href="/support">Góp ý - Phản hồi</a>
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}
