import { useState } from 'react';
import './ShippingPolicyPage.css';

const DELIVERY_ROWS = [
  {
    area: 'Hồ Chí Minh',
    inner: 'Giao nhanh khoảng 1 - 2 giờ khi cửa hàng có hàng và địa chỉ trong bán kính 10 km. Không áp dụng tại Cần Giờ, Củ Chi và Nhà Bè.',
    outer: 'Khoảng 24 - 48 giờ với địa chỉ xa hơn 10 km.',
  },
  {
    area: 'Hà Nội',
    inner: 'Giao nhanh khoảng 1 - 2 giờ khi cửa hàng có hàng và địa chỉ trong bán kính 10 km. Một số huyện ngoại thành không áp dụng.',
    outer: 'Khoảng 24 - 48 giờ với khu vực ngoài phạm vi giao nhanh.',
  },
  {
    area: 'Tỉnh có cửa hàng CellphoneS',
    inner: 'Trong vòng 24 giờ với địa chỉ cách cửa hàng không quá 10 km.',
    outer: 'Khoảng 1 - 2 ngày với địa chỉ xa hơn 10 km.',
  },
  {
    area: 'Khu vực còn lại',
    inner: 'Giao nội tỉnh hoặc liên tỉnh qua đối tác vận chuyển.',
    outer: 'Khoảng 2 - 5 ngày tùy tuyến và địa chỉ nhận hàng.',
  },
];

const REFUND_ROWS = [
  ['Tiền mặt', 'Hoàn tại cửa hàng ngay khi hồ sơ được xác nhận'],
  ['Chuyển khoản', 'Trong khoảng 03 ngày làm việc'],
  ['Thẻ ATM', 'Khoảng 7 - 10 ngày làm việc'],
  ['Visa / Mastercard / JCB', 'Khoảng 7 - 15 ngày làm việc'],
  ['MPOS / Alepay / OnePay', 'Khoảng 7 - 14 ngày làm việc'],
  ['VNPay / Kredivo / MoMo / ShopeePay / ZaloPay / Fundiin', 'Khoảng 3 - 8 ngày làm việc'],
];

const SAMPLE_QUESTIONS = [
  {
    name: 'Khách hàng',
    time: 'Gần đây',
    question: 'Đơn đã thanh toán trước có được gọi xác nhận trước khi giao không?',
    answer: 'Nhân viên giao hàng thường liên hệ trước để xác nhận địa chỉ và thời gian nhận. Bạn nên giữ điện thoại trong trạng thái có thể liên lạc.',
  },
  {
    name: 'Khách hàng',
    time: 'Gần đây',
    question: 'Khi nhận hàng online cần kiểm tra gì để hạn chế rủi ro?',
    answer: 'Kiểm tra ngoại quan thùng, tem niêm phong và tình trạng hộp. Nếu thùng ẩm, móp, rách hoặc mất tem, nên từ chối nhận và gọi 1800.2097.',
  },
];

function SectionTitle({ children }) {
  return <h2 className="shipping-policy-section-title">{children}</h2>;
}

function BulletList({ items }) {
  return (
    <ul className="shipping-policy-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export default function ShippingPolicyPage() {
  const [question, setQuestion] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submitQuestion = (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    setSubmitted(true);
    setQuestion('');
  };

  return (
    <section className="shipping-policy-page">
      <div className="container shipping-policy-container">
        <article className="shipping-policy-article">
          <h1>HƯỚNG DẪN MUA HÀNG TỪ XA</h1>

          <section>
            <SectionTitle>1. TRA CỨU ĐƠN HÀNG ONLINE</SectionTitle>
            <p>
              Tính năng tra cứu bằng mã đơn và số điện thoại có thể được bảo trì trong một số thời điểm.
              Khách hàng đã đăng nhập có thể xem trạng thái tại mục lịch sử mua hàng trong Smember.
            </p>
            <a className="shipping-policy-inline-link" href="/smember?tab=orders">Xem đơn hàng trong Smember</a>
          </section>

          <section>
            <SectionTitle>2. THÔNG TIN THANH TOÁN VÀ GIAO HÀNG</SectionTitle>
            <BulletList items={[
              'Khách hàng từ Đà Nẵng trở ra phía Bắc áp dụng giá bán khu vực miền Bắc.',
              'Khách hàng từ Quảng Nam trở vào phía Nam áp dụng giá bán khu vực miền Nam.',
              'Có thể đặt hàng trực tiếp trên website, gọi 1800.2097 hoặc liên hệ qua các kênh tư vấn chính thức.',
            ]} />

            <h3>a. Giao hàng và thanh toán tại nhà</h3>
            <p>Khách hàng thanh toán cho nhân viên giao nhận sau khi kiểm tra tình trạng bên ngoài của kiện hàng theo hướng dẫn.</p>

            <h3>b. Chuyển khoản hoặc thanh toán online</h3>
            <p>
              Website hỗ trợ thẻ tín dụng, thẻ ATM, Internet Banking, VietQR, ZaloPay, MoMo, VNPay,
              Kredivo, ShopeePay, Fundiin và các cổng thanh toán được tích hợp theo từng thời điểm.
            </p>
            <div className="shipping-policy-vietqr-box">
              <div>
                <strong>Thanh toán VietQR</strong>
                <span>Quét mã để tự điền số tài khoản, số tiền và nội dung chuyển khoản.</span>
              </div>
              <a href="/chinh-sach/mua-hang-va-thanh-toan-online">Xem hướng dẫn</a>
            </div>

            <h3>c. Mua hàng trả góp</h3>
            <BulletList items={[
              'Trả góp online qua thẻ tín dụng và các cổng thanh toán hỗ trợ.',
              'Trả góp tại cửa hàng qua ngân hàng hoặc đối tác tài chính theo hồ sơ được duyệt.',
              'Kỳ hạn, phí chuyển đổi và điều kiện áp dụng phụ thuộc từng ngân hàng hoặc chương trình.',
            ]} />

            <h3>d. Mua hàng xuất hóa đơn VAT cho công ty</h3>
            <p>
              Với đơn hàng doanh nghiệp có giá trị từ 5.000.000đ, nên thanh toán không dùng tiền mặt
              để bảo đảm chứng từ hợp lệ và thuận tiện đối soát.
            </p>
            <BulletList items={[
              'Chuyển khoản từ tài khoản ngân hàng đứng tên tổ chức hoặc công ty.',
              'Thanh toán bằng thẻ doanh nghiệp qua POS hoặc cổng online.',
              'Thanh toán qua tài khoản doanh nghiệp tại các cổng trung gian được hỗ trợ.',
            ]} />

            <div className="shipping-policy-payment-visuals" aria-label="Minh họa thanh toán doanh nghiệp">
              <div><span>VietQR</span><strong>Quét mã chuyển khoản</strong><small>Đúng số tiền và nội dung thanh toán</small></div>
              <div><span>VAT</span><strong>Thanh toán không tiền mặt</strong><small>Thuận tiện đối chiếu hóa đơn doanh nghiệp</small></div>
            </div>

            <h3>e. Chi phí vận chuyển</h3>
            <div className="shipping-policy-fee-grid">
              <div><strong>Smem và SVip</strong><span>Miễn phí giao hàng theo chính sách hiện hành</span></div>
              <div><strong>Đơn dưới 300.000đ</strong><span>Phí giao hàng tiêu chuẩn 15.000đ</span></div>
              <div><strong>Đơn từ 300.000đ</strong><span>Miễn phí giao hàng tiêu chuẩn</span></div>
            </div>

            <p className="shipping-policy-note">
              Một số đơn hàng có thể phát sinh phụ thu cồng kềnh khi do CellphoneS hoặc đối tác vận chuyển thực hiện.
            </p>
            <BulletList items={[
              'Khối lượng thực tế lớn hơn 8 kg.',
              'Khối lượng quy đổi lớn hơn 10 kg, tính theo công thức dài × rộng × cao / 5.000.',
              'Cả ba chiều đều lớn hơn 35 cm.',
              'Hai chiều bất kỳ lớn hơn 45 cm.',
              'Có một chiều lớn hơn 50 cm.',
            ]} />
          </section>

          <section>
            <SectionTitle>3. THỜI GIAN GIAO NHẬN HÀNG</SectionTitle>
            <h3>a. Phạm vi áp dụng</h3>
            <BulletList items={[
              'Giao nội thành tại TP.HCM, Hà Nội và các khu vực trung tâm.',
              'Giao ngoại thành tại vùng ven, huyện và các tỉnh thành khác.',
              'Giao liên tỉnh toàn quốc qua đội ngũ giao nhận và đối tác 3PL.',
              'Giao hàng điện máy, hàng cồng kềnh và hỗ trợ lắp đặt tùy sản phẩm.',
            ]} />

            <h3>b. Hình thức và dịch vụ giao hàng</h3>
            <BulletList items={[
              'Giao tiêu chuẩn tại địa chỉ khách hàng cung cấp.',
              'Giao nhanh khoảng 2 giờ tại một số quận nội thành và khi cửa hàng gần nhất còn hàng.',
              'Áp dụng chủ yếu cho điện thoại, laptop, máy tính bảng, phụ kiện và sản phẩm kích thước vừa hoặc nhỏ.',
            ]} />

            <div className="shipping-policy-table-wrap">
              <table>
                <thead><tr><th>KHU VỰC</th><th>NỘI THÀNH</th><th>NGOẠI THÀNH</th></tr></thead>
                <tbody>
                  {DELIVERY_ROWS.map((row) => (
                    <tr key={row.area}><td>{row.area}</td><td>{row.inner}</td><td>{row.outer}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Giao và lắp đặt hàng cồng kềnh, điện máy</h3>
            <p>
              Điều hòa, máy giặt, tủ lạnh, tivi, máy lọc không khí và sản phẩm cồng kềnh được nhân viên liên hệ
              trước để xác nhận thời gian giao hoặc lắp đặt.
            </p>

            <h3>Lưu ý khi giao nhận</h3>
            <BulletList items={[
              'Khung giờ giao trong ngày tại nội thành TP.HCM và Hà Nội thường từ 8:00 đến 20:00.',
              'Đơn xác nhận trước 14:00 được ưu tiên tính trong ngày; đơn sau thời điểm này có thể chuyển sang ngày tiếp theo.',
              'Thời gian ngoại thành và liên tỉnh không tính Chủ nhật, ngày nghỉ Lễ hoặc Tết.',
              'Khách hàng cần cung cấp đầy đủ tên người nhận, địa chỉ và số điện thoại.',
              'Đơn từ 10.000.000đ có thể được kiểm tra thẻ thanh toán và giấy tờ của chủ thẻ.',
              'Đơn trả trước từ 2.000.000đ có thể yêu cầu mã OTP xác nhận khi nhận hàng.',
            ]} />
          </section>

          <section>
            <SectionTitle>4. THÔNG TIN VỀ HỦY ĐƠN HÀNG VÀ THỜI GIAN HOÀN TIỀN</SectionTitle>
            <p>Thời gian hoàn tiền dự kiến phụ thuộc phương thức thanh toán ban đầu:</p>
            <div className="shipping-policy-table-wrap compact">
              <table>
                <thead><tr><th>PHƯƠNG THỨC</th><th>THỜI GIAN DỰ KIẾN</th></tr></thead>
                <tbody>{REFUND_ROWS.map(([method, time]) => <tr key={method}><td>{method}</td><td>{time}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="shipping-policy-note">
              Ngày làm việc được hiểu từ thứ Hai đến thứ Sáu, không gồm cuối tuần và ngày nghỉ theo quy định.
              Phí vận chuyển, phụ phí, phí chuyển đổi trả góp hoặc ưu đãi cộng thêm có thể không được hoàn lại.
            </p>
          </section>

          <section>
            <SectionTitle>5. HÀNG HÓA ĐẢM BẢO</SectionTitle>
            <BulletList items={[
              'Sản phẩm được bảo vệ bằng vật liệu chống va đập và đóng trong hộp carton.',
              'Quá trình đóng gói được thực hiện tại khu vực có camera giám sát.',
              'Đơn giá trị cao được dán tem niêm phong nhận diện CellphoneS.',
              'Nếu kiện hàng ẩm, móp, rách, biến dạng hoặc mất tem niêm phong, khách hàng nên từ chối nhận và liên hệ cửa hàng xử lý đơn.',
            ]} />
          </section>

          <section>
            <SectionTitle>6. CHÍNH SÁCH ĐỔI MỚI</SectionTitle>
            <BulletList items={[
              'Đơn mua online áp dụng chính sách đổi mới tương tự giao dịch tại cửa hàng.',
              'Thời gian tính từ ngày khách nhận sản phẩm và không vượt quá mốc quy định kể từ ngày xuất bán.',
              'Sản phẩm gửi đổi cần được đóng gói cẩn thận và liên hệ trước với cửa hàng xử lý đơn.',
              'CellphoneS hỗ trợ chi phí vận chuyển hai chiều khi sản phẩm phát sinh lỗi phần cứng nhà sản xuất trong thời gian được hỗ trợ.',
            ]} />
            <h3>Đổi trả đối với khách hàng doanh nghiệp</h3>
            <p>
              Đơn đã xuất hóa đơn công ty cần chuẩn bị biên bản trả hàng, thu hồi hoặc điều chỉnh hóa đơn có đầy đủ xác nhận của doanh nghiệp.
              Trường hợp thiếu hồ sơ, phần thuế tương ứng có thể được khấu trừ khi xử lý đổi trả.
            </p>
          </section>

          <section>
            <SectionTitle>7. YÊU CẦU THANH TOÁN TRƯỚC VỚI MỘT SỐ TRƯỜNG HỢP</SectionTitle>
            <div className="shipping-policy-prepay-grid">
              <div><strong>Mua tặng hoặc không thanh toán tiền mặt</strong><span>Thanh toán trước toàn bộ giá trị đơn hàng</span></div>
              <div><strong>Đơn có giá trị trên 30 triệu đồng</strong><span>Chuyển khoản toàn bộ hoặc phần vượt hạn mức được xác nhận</span></div>
            </div>
          </section>
        </article>

        <section className="shipping-policy-qa">
          <h2>Hỏi và đáp</h2>
          <div className="shipping-policy-qa-intro">
            <img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:160:0/q:90/plain/https://cellphones.com.vn/media/wysiwyg/ant-hello-2025.png" alt="CellphoneS hỗ trợ" />
            <div>
              <h3>Hãy đặt câu hỏi cho chúng tôi</h3>
              <p>CellphoneS cố gắng phản hồi trong khoảng một giờ. Câu hỏi gửi sau 22:00 có thể được trả lời vào sáng hôm sau.</p>
            </div>
          </div>

          <form className="shipping-policy-question-form" onSubmit={submitQuestion}>
            <textarea value={question} onChange={(event) => { setQuestion(event.target.value); setSubmitted(false); }} placeholder="Mời bạn để lại câu hỏi..." rows={4} />
            <button type="submit">Gửi câu hỏi</button>
          </form>
          {submitted && <p className="shipping-policy-submit-success">Câu hỏi đã được ghi nhận trên giao diện mô phỏng.</p>}

          <div className="shipping-policy-question-list">
            {SAMPLE_QUESTIONS.map((item) => (
              <article key={item.question}>
                <div className="shipping-policy-question-avatar">K</div>
                <div>
                  <div className="shipping-policy-question-meta"><strong>{item.name}</strong><span>{item.time}</span></div>
                  <p>{item.question}</p>
                  <button type="button">Phản hồi</button>
                  <div className="shipping-policy-admin-reply">
                    <span>QTV</span>
                    <div><strong>Quản trị viên</strong><p>{item.answer}</p></div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
