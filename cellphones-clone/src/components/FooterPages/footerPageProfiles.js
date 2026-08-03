export const footerPolicyLinks = [
  ['Mua hàng và thanh toán Online', '/chinh-sach/mua-hang-va-thanh-toan-online'],
  ['Mua hàng trả góp', '/tra-gop'],
  ['Mua hàng trả góp bằng thẻ tín dụng', '/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones'],
  ['Chính sách giao hàng', '/chinh-sach-giao-hang'],
  ['Chính sách đổi trả', '/tos?part=refund-policy'],
  ['Tra điểm Smember', '/smember/tra-diem'],
  ['Xem ưu đãi Smember', '/uu-dai-smember'],
  ['Tra thông tin bảo hành', '/bao-hanh/tra-thong-tin-bao-hanh'],
  ['Tra cứu hoá đơn điện tử', '/hoa-don/tra-cuu-hoa-don-dien-tu'],
  ['Thông tin hoá đơn mua hàng', '/quy-dinh-ve-hoa-don-khi-mua-hang-cellphones'],
  ['Trung tâm bảo hành chính hãng', '/bao-hanh/apple'],
  ['Quy định về việc sao lưu dữ liệu', '/quy-dinh-ve-viec-sao-luu-du-lieu'],
  ['Chính sách khui hộp sản phẩm Apple', '/chinh-sach-khui-hop-apple'],
  ['VAT Refund', '/vat-refund'],
];

export const footerServiceLinks = [
  ['Khách hàng doanh nghiệp (B2B)', '/dich-vu-khach-hang-doanh-nghiep'],
  ['Ưu đãi thanh toán', '/danh-sach-khuyen-mai'],
  ['Quy chế hoạt động', '/tos'],
  ['Chính sách bảo mật thông tin cá nhân', '/tos?part=privacy-policy'],
  ['Chính sách Bảo hành', '/chinh-sach-bao-hanh'],
  ['Liên hệ hợp tác kinh doanh', '/lien-he-hop-tac'],
  ['Tuyển dụng', '/tuyen-dung'],
  ['Dịch vụ bảo hành mở rộng', '/bieu-phi-bao-hanh-mo-rong'],
];

const commonFaq = [
  ['Thông tin có thể thay đổi theo thời gian không?', 'Có. Điều kiện áp dụng có thể được cập nhật theo từng thời điểm, ngành hàng hoặc chương trình.'],
  ['Tôi cần hỗ trợ thêm bằng cách nào?', 'Liên hệ tổng đài 1800.2097 hoặc gửi yêu cầu tại trang Góp ý - Phản hồi - Hỗ trợ.'],
];

const article = (title, lead, sections, extra = {}) => ({
  kind: 'article',
  eyebrow: 'Thông tin và chính sách',
  title,
  lead,
  sections,
  faq: commonFaq,
  ...extra,
});

export const footerPageProfiles = {
  '/chinh-sach/mua-hang-va-thanh-toan-online': article(
    'Hướng dẫn mua hàng và thanh toán trực tuyến',
    'Đặt hàng nhanh trên website CellphoneS với nhiều hình thức thanh toán online miễn phí, an toàn và thuận tiện.',
    [
      { title: 'Bước 1: Chọn sản phẩm', body: 'Tìm sản phẩm cần mua, kiểm tra khu vực bán hàng, giá bán, quà tặng và tình trạng còn hàng.', bullets: ['Chọn Mua ngay để đặt hàng thông thường.', 'Chọn Trả góp để xem hình thức thanh toán theo kỳ hạn.', 'Kiểm tra màu sắc, dung lượng và số lượng trước khi tiếp tục.'] },
      { title: 'Bước 2: Kiểm tra giỏ hàng', body: 'Xác nhận sản phẩm, ưu đãi, mã giảm giá và tổng thanh toán dự kiến.' },
      { title: 'Bước 3: Điền thông tin nhận hàng', body: 'Cung cấp họ tên, số điện thoại, địa chỉ nhận hàng hoặc cửa hàng muốn đến nhận.' },
      { title: 'Bước 4: Chọn phương thức thanh toán', bullets: ['Thanh toán khi nhận hàng.', 'Chuyển khoản hoặc VietQR.', 'Thẻ ATM, Visa, Mastercard, JCB.', 'Ví điện tử và mua trước trả sau.', 'Trả góp qua thẻ tín dụng hoặc công ty tài chính.'] },
      { title: 'Bước 5: Xác nhận đơn hàng', body: 'Hệ thống gửi mã đơn và nhân viên liên hệ xác nhận trước khi giao hàng.' },
    ],
    {
      tone: 'red',
      heroImage: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/i-headbanner01.jpg',
      stats: [['2 giây', 'Thanh toán nhanh'], ['Nhiều phương thức', 'Thẻ, QR, ví'], ['1800.2097', 'Hỗ trợ miễn phí']],
    },
  ),

  '/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones': article(
    'Hướng dẫn mua trả góp bằng thẻ tín dụng',
    'Áp dụng cho chủ thẻ Visa, Mastercard hoặc JCB do ngân hàng tại Việt Nam phát hành và còn đủ hạn mức.',
    [
      { title: 'Hình thức trả góp', bullets: ['Thanh toán trực tiếp trên website qua cổng trả góp.', 'Cà thẻ và đăng ký chuyển đổi tại cửa hàng.', 'Kỳ hạn phổ biến 3, 6, 9 hoặc 12 tháng tùy ngân hàng.'] },
      { title: 'Điều kiện áp dụng', bullets: ['Thẻ tín dụng chính, còn hiệu lực và đủ hạn mức.', 'Không áp dụng thẻ ghi nợ hoặc thẻ phụ.', 'Chủ thẻ cần xác thực thông tin khi giao dịch.'] },
      { title: 'Quy trình tại website', bullets: ['Chọn sản phẩm và hình thức trả góp thẻ tín dụng.', 'Chọn ngân hàng và kỳ hạn.', 'Nhập thông tin thẻ tại cổng thanh toán bảo mật.', 'Nhận xác nhận giao dịch và theo dõi đơn hàng.'] },
      { title: 'Lưu ý quan trọng', bullets: ['Phí chuyển đổi hiển thị theo ngân hàng và kỳ hạn.', 'Không hủy giao dịch sau khi ngân hàng đã chuyển đổi trả góp.', 'Mỗi giỏ hàng có thể bị giới hạn số lượng sản phẩm theo chương trình.'] },
    ],
    {
      tone: 'blue',
      stats: [['25+', 'Ngân hàng hỗ trợ'], ['3-12 tháng', 'Kỳ hạn linh hoạt'], ['0%', 'Ưu đãi theo chương trình']],
    },
  ),

  '/chinh-sach-giao-hang': article(
    'Hướng dẫn mua hàng từ xa',
    'Thông tin thanh toán, giao hàng, nhận tại cửa hàng và xử lý đơn hàng online tại CellphoneS.',
    [
      { title: 'Tra cứu đơn hàng online', body: 'Đăng nhập Smember và mở Lịch sử mua hàng để theo dõi trạng thái đơn.' },
      { title: 'Hình thức đặt hàng', bullets: ['Đặt trực tiếp trên website.', 'Gọi tổng đài miễn phí 1800.2097.', 'Chat qua website hoặc kênh mạng xã hội chính thức.'] },
      { title: 'Thanh toán và giao hàng', bullets: ['Thanh toán khi nhận hàng.', 'Chuyển khoản, VietQR, thẻ hoặc ví điện tử.', 'Nhận hàng tại nhà hoặc tại cửa hàng CellphoneS.'] },
      { title: 'Phí và thời gian giao hàng', bullets: ['Đơn từ 300.000đ được áp dụng chính sách miễn phí giao hàng theo điều kiện hiện hành.', 'Giao nhanh nội thành phụ thuộc khoảng cách và tồn kho.', 'Điện máy cồng kềnh được xác nhận lịch giao và lắp đặt riêng.'] },
      { title: 'Hủy đơn và hoàn tiền', body: 'Liên hệ tổng đài trước khi đơn được giao. Thời gian hoàn tiền phụ thuộc phương thức thanh toán và ngân hàng.' },
    ],
    {
      tone: 'red',
      stats: [['300K+', 'Miễn phí giao hàng'], ['1-2 giờ', 'Giao nhanh nội thành'], ['Toàn quốc', 'Phạm vi phục vụ']],
    },
  ),

  '/tos:refund-policy': article(
    'Chính sách huỷ giao dịch, đổi trả hàng',
    'Quy định về thời gian đổi trả, điều kiện sản phẩm và quy trình gửi trả tại CellphoneS.',
    [
      { title: 'Điều kiện hủy giao dịch', body: 'Khách hàng có thể yêu cầu hủy từ khi đặt hàng đến trước thời điểm nhận hàng thành công.' },
      { title: 'Thời gian đổi trả', bullets: ['Điện thoại, máy tính bảng, MacBook: mốc đổi mới tiêu chuẩn theo chính sách từng thời điểm.', 'Laptop và phụ kiện áp dụng thời hạn riêng theo ngành hàng.', 'Ngoài thời hạn đổi trả, sản phẩm được xử lý theo chính sách bảo hành.'] },
      { title: 'Điều kiện tiếp nhận', bullets: ['Máy và hộp không bị cấn móp, rách vỡ hoặc thay đổi ngoại hình ngoài quy định.', 'IMEI hoặc Serial trên hộp trùng với sản phẩm.', 'Đầy đủ phụ kiện, quà tặng và chứng từ liên quan.', 'Đăng xuất iCloud, Google Account, Mi Account và các tài khoản cá nhân.'] },
      { title: 'Cách thực hiện', bullets: ['Mang sản phẩm đến cửa hàng CellphoneS gần nhất.', 'Gửi trả qua đơn vị vận chuyển theo hướng dẫn của nhân viên.', 'Đơn xuất hóa đơn công ty cần chuẩn bị biên bản và chứng từ điều chỉnh phù hợp.'] },
    ],
    { tone: 'red', stats: [['30 ngày', 'Mốc phổ biến'], ['IMEI/Serial', 'Thông tin đối chiếu'], ['1800.2097', 'Hỗ trợ đổi trả']] },
  ),

  '/smember/tra-diem': {
    kind: 'lookup',
    tone: 'member',
    eyebrow: 'Smember',
    title: 'Tra cứu điểm và hạng thành viên',
    lead: 'Nhập số điện thoại đã đăng ký Smember để kiểm tra tổng chi tiêu, điểm tích lũy và hạng thành viên.',
    lookupType: 'points',
    fields: [
      { name: 'phone', label: 'Số điện thoại Smember', placeholder: 'Nhập số điện thoại', type: 'tel' },
      { name: 'email', label: 'Email', placeholder: 'Nhập email nếu có', type: 'email', optional: true },
    ],
    resultTitle: 'Thông tin Smember',
    stats: [['S-NEW', 'Khách hàng mới'], ['S-MEM', 'Thành viên'], ['S-VIP', 'Khách hàng thân thiết']],
  },

  '/uu-dai-smember': {
    kind: 'member',
    tone: 'member',
    eyebrow: 'Smember',
    title: 'Ưu đãi dành riêng cho thành viên',
    lead: 'Đăng nhập Smember để nhận voucher cá nhân hóa, ưu đãi theo hạng, quà sinh nhật và đặc quyền giáo dục.',
    stats: [['3 triệu+', 'Thành viên'], ['Voucher', 'Cá nhân hóa'], ['S-Student', 'Ưu đãi giáo dục']],
    benefits: [
      ['Hạng thành viên', 'Theo dõi tổng chi tiêu và quyền lợi theo hạng S-NEW, S-MEM, S-VIP.'],
      ['Mã giảm giá', 'Lưu và sử dụng voucher đã thu thập trong tài khoản.'],
      ['Lịch sử mua hàng', 'Tra cứu đơn, bảo hành và hóa đơn thuận tiện.'],
      ['Ưu đãi sinh nhật', 'Nhận quà hoặc voucher theo chương trình hiện hành.'],
      ['S-Student & S-Teacher', 'Ưu đãi thiết bị học tập, giảng dạy và trả góp.'],
      ['S-Business', 'Đặc quyền dành cho khách hàng doanh nghiệp.'],
    ],
  },

  '/bao-hanh/tra-thong-tin-bao-hanh': {
    kind: 'lookup',
    tone: 'blue',
    eyebrow: 'Bảo hành',
    title: 'Tra thông tin bảo hành',
    lead: 'Tra cứu bằng số điện thoại và IMEI, Serial hoặc mã đơn hàng.',
    lookupType: 'warranty',
    fields: [
      { name: 'phone', label: 'Số điện thoại mua hàng', placeholder: 'Nhập số điện thoại', type: 'tel' },
      { name: 'reference', label: 'IMEI / Serial / Mã đơn', placeholder: 'Nhập thông tin sản phẩm hoặc đơn hàng' },
    ],
    resultTitle: 'Kết quả bảo hành',
    stats: [['IMEI', 'Tra điện thoại'], ['Serial', 'Tra thiết bị'], ['Mã đơn', 'Đối chiếu mua hàng']],
  },

  '/hoa-don/tra-cuu-hoa-don-dien-tu': {
    kind: 'lookup',
    tone: 'invoice',
    eyebrow: 'Hóa đơn điện tử',
    title: 'Tra cứu hóa đơn mua hàng',
    lead: 'Nhập mã đơn cùng email hoặc số điện thoại đã mua hàng để tìm hóa đơn điện tử.',
    lookupType: 'invoice',
    fields: [
      { name: 'orderCode', label: 'Mã đơn hàng', placeholder: 'VD: CPS20260803...' },
      { name: 'contact', label: 'Email hoặc số điện thoại', placeholder: 'Nhập thông tin nhận hóa đơn' },
    ],
    resultTitle: 'Kết quả hóa đơn',
    stats: [['VAT', 'Hóa đơn điện tử'], ['10 năm', 'Thời gian lưu trữ'], ['1800.2063', 'Hỗ trợ hóa đơn']],
  },

  '/quy-dinh-ve-hoa-don-khi-mua-hang-cellphones': article(
    'Thông báo về hóa đơn khi mua hàng tại CellphoneS',
    'CellphoneS áp dụng hóa đơn VAT điện tử cho hàng hóa bán ra và cung cấp theo quy định tại thời điểm mua hàng.',
    [
      { title: 'Các loại hóa đơn', bullets: ['Hóa đơn điện tử.', 'Bản thể hiện hóa đơn điện tử.', 'Hóa đơn chuyển đổi theo điều kiện áp dụng.'] },
      { title: 'Thông tin cần cung cấp', bullets: ['Họ tên hoặc tên doanh nghiệp.', 'Mã số thuế và địa chỉ đăng ký nếu xuất cho công ty.', 'Email nhận hóa đơn và mã đơn hàng.'] },
      { title: 'Thời gian nhận hóa đơn', body: 'Hóa đơn được phát hành theo thời điểm bán hàng và gửi đến email đã đăng ký.' },
      { title: 'Cách tìm lại hóa đơn', body: 'Sử dụng trang Tra cứu hóa đơn điện tử hoặc liên hệ tổng đài 1800.2063 khi không nhận được hóa đơn.' },
    ],
    { tone: 'invoice', stats: [['100%', 'Hàng hóa có VAT'], ['10 năm', 'Lưu trữ hóa đơn'], ['1800.2063', 'Hỗ trợ khiếu nại']] },
  ),

  '/bao-hanh/apple': {
    kind: 'apple-service',
    tone: 'dark',
    eyebrow: 'Apple Authorized Service',
    title: 'Trung tâm bảo hành Apple chính hãng',
    lead: 'Tra cứu địa điểm tiếp nhận iPhone, iPad, MacBook, Apple Watch và phụ kiện Apple theo quy trình ủy quyền.',
    stats: [['CareS', 'Trung tâm ủy quyền'], ['Apple', 'Quy trình chính hãng'], ['HN & TP.HCM', 'Khu vực phục vụ']],
    serviceSteps: [
      ['01', 'Kiểm tra sản phẩm', 'Đối chiếu Serial, tình trạng ngoại quan và thông tin bảo hành.'],
      ['02', 'Tiếp nhận', 'Lập phiếu tiếp nhận và xác nhận dữ liệu, phụ kiện đi kèm.'],
      ['03', 'Kiểm tra kỹ thuật', 'Kỹ thuật viên kiểm tra theo công cụ và tiêu chuẩn Apple.'],
      ['04', 'Trả kết quả', 'Thông báo phương án xử lý, thời gian và điều kiện áp dụng.'],
    ],
    locations: [
      ['CareS Hồ Chí Minh', '350-352 Võ Văn Kiệt, Phường Cầu Ông Lãnh, TP.HCM'],
      ['CareS Hà Nội', 'Khu vực trung tâm Hà Nội – vui lòng kiểm tra lịch tiếp nhận trước khi đến'],
    ],
  },

  '/quy-dinh-ve-viec-sao-luu-du-lieu': article(
    'Quy định về hỗ trợ sao lưu, chuyển dữ liệu',
    'Khách hàng cần chủ động sao lưu dữ liệu trước khi cài đặt, sửa chữa, bảo hành hoặc chuyển sang thiết bị mới.',
    [
      { title: 'Trường hợp áp dụng', bullets: ['Mua điện thoại, laptop, PC và cần chuyển dữ liệu sang thiết bị mới.', 'Mua USB, thẻ nhớ hoặc ổ cứng và cần sao lưu dữ liệu.'] },
      { title: 'Nguyên tắc thực hiện', bullets: ['Khách hàng tự sao lưu dữ liệu trên thiết bị cá nhân.', 'Không lưu dữ liệu cá nhân lâu dài trên thiết bị thuộc CellphoneS.', 'Nhân viên hỗ trợ hướng dẫn và giải thích rủi ro có thể phát sinh.'] },
      { title: 'iPhone và Android', bullets: ['iPhone: sao lưu iCloud hoặc máy tính cá nhân.', 'Android: đồng bộ Google và thiết bị lưu trữ thuộc khách hàng.', 'Chuyển khác hệ điều hành có thể giới hạn loại dữ liệu hỗ trợ.'] },
      { title: 'Cam kết miễn trừ trách nhiệm', body: 'Khi yêu cầu nhân viên hỗ trợ trực tiếp, khách hàng xác nhận đã được thông báo rủi ro và ký cam kết theo quy trình tại cửa hàng.' },
    ],
    { tone: 'blue', stats: [['iCloud', 'Sao lưu iPhone'], ['Google', 'Đồng bộ Android'], ['Chủ động', 'Bảo vệ dữ liệu']] },
  ),

  '/chinh-sach-khui-hop-apple': article(
    'Chính sách khui hộp sản phẩm Apple',
    'Quy trình kiểm tra seal, ngoại quan, phụ kiện và kích hoạt sản phẩm Apple tại CellphoneS.',
    [
      { title: 'Trước khi khui hộp', bullets: ['Đối chiếu đúng phiên bản, màu sắc, dung lượng.', 'Kiểm tra tình trạng hộp và seal.', 'Xác nhận thông tin đơn hàng và chính sách đổi trả.'] },
      { title: 'Trong quá trình khui hộp', bullets: ['Khui hộp tại quầy dưới sự hỗ trợ của nhân viên.', 'Kiểm tra ngoại quan máy và phụ kiện.', 'Đối chiếu Serial/IMEI trước khi kích hoạt.'] },
      { title: 'Sau khi kích hoạt', body: 'Sản phẩm áp dụng chính sách bảo hành và đổi trả tương ứng với tình trạng đã kích hoạt.' },
      { title: 'Lưu ý', bullets: ['Giữ lại hộp và phụ kiện trong thời gian đổi trả.', 'Không tự ý tháo seal hoặc thay đổi ngoại hình trước khi kiểm tra.', 'Báo ngay cho nhân viên nếu phát hiện bất thường.'] },
    ],
    { tone: 'dark', stats: [['Seal', 'Kiểm tra trước'], ['IMEI', 'Đối chiếu sản phẩm'], ['Apple', 'Chính sách riêng']] },
  ),

  '/vat-refund': {
    kind: 'vat',
    tone: 'vat',
    eyebrow: 'VAT Refund in Vietnam',
    title: 'Hoàn thuế GTGT tại CellphoneS',
    lead: 'Hỗ trợ du khách quốc tế và người Việt Nam định cư ở nước ngoài thực hiện thủ tục hoàn thuế khi xuất cảnh.',
    stats: [['2 triệu+', 'Giá trị tối thiểu'], ['60 ngày', 'Thời hạn hóa đơn'], ['85%', 'Phần thuế được hoàn']],
    serviceSteps: [
      ['01', 'Tại cửa hàng', 'Xuất trình hộ chiếu hợp lệ và yêu cầu lập hóa đơn GTGT kiêm tờ khai hoàn thuế.'],
      ['02', 'Kiểm tra hóa đơn', 'Kiểm tra thông tin và ký hai bản; mỗi bên giữ một bản.'],
      ['03', 'Tại sân bay hoặc cảng', 'Xuất trình hàng hóa, hộ chiếu và hóa đơn cho Hải quan kiểm tra.'],
      ['04', 'Nhận tiền hoàn', 'Ngân hàng kiểm tra hồ sơ và hoàn tiền bằng tiền mặt hoặc thẻ quốc tế.'],
    ],
    sections: [
      { title: 'Đối tượng được hoàn thuế', body: 'Người nước ngoài hoặc người Việt Nam định cư ở nước ngoài mang hộ chiếu hoặc giấy tờ đi lại quốc tế.' },
      { title: 'Điều kiện hàng hóa', bullets: ['Chưa qua sử dụng, còn nguyên đai nguyên kiện.', 'Không thuộc danh mục cấm xuất khẩu hoặc cấm đưa lên phương tiện vận tải.', 'Mua tại doanh nghiệp bán hàng hoàn thuế và đáp ứng mức giá trị tối thiểu.'] },
      { title: 'Hồ sơ cần chuẩn bị', bullets: ['Hộ chiếu hoặc giấy tờ xuất nhập cảnh.', 'Hóa đơn GTGT kiêm tờ khai hoàn thuế.', 'Hàng hóa và thẻ lên tàu bay hoặc tàu biển.'] },
    ],
  },

  '/dich-vu-khach-hang-doanh-nghiep': {
    kind: 'business',
    tone: 'business',
    eyebrow: 'S-Business',
    title: 'Trở thành khách hàng doanh nghiệp cùng CellphoneS',
    lead: 'Giá cạnh tranh, hàng hóa chính hãng, thanh toán linh hoạt và hỗ trợ triển khai trên toàn quốc.',
    stats: [['Đến 8%', 'Chiết khấu ngành hàng'], ['200K', 'Voucher chào mừng'], ['1%', 'Hoàn tiền tích lũy'], ['178', 'Cửa hàng']],
    benefits: [
      ['Chiết khấu riêng', 'Mức ưu đãi theo ngành hàng và giá trị đơn hàng.'],
      ['Sản phẩm chính hãng', 'Đầy đủ hóa đơn, chứng từ và chính sách bảo hành.'],
      ['Thanh toán linh hoạt', 'Hỗ trợ chuyển khoản, công nợ theo điều kiện và nhiều phương thức.'],
      ['Giao hàng toàn quốc', 'Hỗ trợ giao, lắp đặt và triển khai theo lịch dự án.'],
      ['Hotline riêng', 'Đội ngũ B2B tư vấn cấu hình, báo giá và sau bán hàng.'],
      ['Tài khoản S-Business', 'Theo dõi ưu đãi và lịch sử mua hàng doanh nghiệp.'],
    ],
    discountTable: [
      ['0 - 50 triệu', '1%', '1%', '5%', '1%'],
      ['50 - 100 triệu', '1.5%', '2%', '6%', '2%'],
      ['100 - 200 triệu', '2%', '3%', '7%', '3%'],
      ['Từ 200 triệu', '2%', '4%', '8%', '4%'],
    ],
  },

  '/tos:default': article(
    'Quy chế hoạt động website CellphoneS',
    'Quy định chung, quy trình giao dịch, quyền và nghĩa vụ của các bên khi sử dụng website thương mại điện tử CellphoneS.',
    [
      { title: 'Phần I. Quy định chung', bullets: ['Phạm vi áp dụng và nguyên tắc hoạt động.', 'Thông tin đơn vị sở hữu, quản lý website.', 'Nguyên tắc công khai, minh bạch và bảo vệ người tiêu dùng.'] },
      { title: 'Phần II. Quy trình giao dịch', bullets: ['Quy trình đặt hàng, xác nhận và thanh toán.', 'Giao nhận, hủy đơn và xử lý khiếu nại.', 'Quản lý thông tin tài khoản khách hàng.'] },
      { title: 'Phần III. Chính sách bảo hành', body: 'Quy định trách nhiệm tiếp nhận, kiểm tra và hỗ trợ sản phẩm theo chính sách hãng và CellphoneS.' },
      { title: 'Phần IV. Đổi trả hàng', body: 'Điều kiện, thời gian và phương thức xử lý yêu cầu hủy giao dịch, đổi hoặc trả hàng.' },
      { title: 'Phần V. Bảo mật thông tin', body: 'Nguyên tắc thu thập, sử dụng, lưu trữ và bảo vệ dữ liệu cá nhân.' },
    ],
    { tone: 'blue', stats: [['TMĐT', 'Quy chế website'], ['Giao dịch', 'Quy trình minh bạch'], ['Bảo mật', 'Dữ liệu khách hàng']] },
  ),

  '/tos:privacy-policy': article(
    'Chính sách bảo mật thông tin cá nhân',
    'Giải thích cách CellphoneS thu thập, sử dụng, lưu trữ, chia sẻ và bảo vệ dữ liệu khách hàng.',
    [
      { title: 'Sự chấp thuận', body: 'Khi sử dụng nền tảng hoặc cung cấp dữ liệu, khách hàng xác nhận lựa chọn đồng ý theo nội dung được hiển thị.' },
      { title: 'Phạm vi thu thập', bullets: ['Họ tên, email, số điện thoại, địa chỉ.', 'Thông tin tài khoản và lịch sử giao dịch.', 'Thông tin cần thiết để giao hàng, bảo hành, hóa đơn và chăm sóc khách hàng.'] },
      { title: 'Mục đích xử lý', bullets: ['Xác thực tài khoản và thực hiện đơn hàng.', 'Hỗ trợ bảo hành, đổi trả và giải quyết khiếu nại.', 'Gửi thông tin ưu đãi khi khách hàng đồng ý.'] },
      { title: 'Quyền của khách hàng', bullets: ['Yêu cầu xem, cập nhật hoặc chỉnh sửa thông tin.', 'Thay đổi lựa chọn đồng ý xử lý dữ liệu.', 'Yêu cầu xóa dữ liệu theo quy trình và quy định pháp luật.'] },
      { title: 'Cam kết bảo mật', body: 'CellphoneS áp dụng biện pháp kỹ thuật và tổ chức để bảo vệ thông tin giao dịch và dữ liệu cá nhân.' },
    ],
    { tone: 'blue', stats: [['Tài khoản', 'Thông tin đăng nhập'], ['Đơn hàng', 'Dữ liệu giao dịch'], ['1800.2063', 'Yêu cầu dữ liệu']] },
  ),

  '/chinh-sach-bao-hanh': {
    kind: 'warranty-brands',
    tone: 'blue',
    eyebrow: 'Chính sách sau bán hàng',
    title: 'Chính sách bảo hành',
    lead: 'Tìm thương hiệu để xem thông tin trung tâm bảo hành và điều kiện áp dụng.',
    stats: [['30 ngày', 'Đổi mới theo điều kiện'], ['100+', 'Thương hiệu'], ['1800.2097', 'Tổng đài bảo hành']],
    brands: ['Apple', 'Asus', 'Lenovo', 'LG', 'Dell', 'OPPO', 'Samsung', 'Sony', 'Vivo', 'Xiaomi', 'HP', 'MSI', 'Acer', 'Huawei', 'Realme', 'Nokia', 'Logitech', 'Garmin', 'Amazfit', 'Anker', 'Aukey', 'Belkin', 'DJI', 'Dreame', 'Edifier', 'Energizer', 'Ezviz', 'Gigabyte', 'GoPro', 'JBL', 'Kingston', 'Marshall', 'Microsoft', 'Nubia', 'OnePlus', 'Roborock', 'Sandisk', 'Shokz', 'Soundpeats', 'Spigen', 'TCL', 'Tecno', 'Tenda', 'Tineco', 'TP-Link', 'Ugreen', 'ZTE'],
  },

  '/lien-he-hop-tac': {
    kind: 'contact',
    tone: 'red',
    eyebrow: 'Hợp tác kinh doanh',
    title: 'Liên hệ hợp tác cùng CellphoneS',
    lead: 'Thông tin liên hệ dành cho hợp tác kinh doanh, mặt bằng, truyền thông và mua hàng doanh nghiệp.',
    contacts: [
      ['Hợp tác kinh doanh và mặt bằng', 'Mr Kinh Doanh', 'toan.nguyen@cellphones.com.vn'],
      ['Hợp tác truyền thông SChannel', 'Mr Huy', 'quangcao.schannel@gmail.com'],
      ['Doanh nghiệp miền Nam', '028.7100.9350 – Line 1351 / 1346', 'phongb2b@cellphones.com.vn'],
      ['Doanh nghiệp miền Bắc – Trung', '024.7103.7999 – Line 3013 / 3014 / 3101', 'b2bmienbac@cellphones.com.vn'],
    ],
  },

  '/tuyen-dung': {
    kind: 'jobs',
    tone: 'jobs',
    eyebrow: 'CellphoneS Careers',
    title: 'Tìm việc phù hợp gần bạn',
    lead: 'Khám phá cơ hội việc làm tại cửa hàng, văn phòng, công nghệ và vận hành trong hệ sinh thái CellphoneS.',
    stats: [['Cửa hàng', 'Việc làm bán lẻ'], ['Văn phòng', 'Khối chuyên môn'], ['Toàn quốc', 'Nhiều địa điểm']],
    jobs: [
      ['Trưởng Nhóm Admin Website', 'Khối văn phòng', 'TP. Hồ Chí Minh', 'Thỏa thuận'],
      ['Nhân viên Tư vấn Bán hàng', 'Khối cửa hàng', 'Nhiều tỉnh thành', '9 - 15 triệu'],
      ['Nhân viên Thu ngân', 'Khối cửa hàng', 'Hà Nội / TP.HCM', 'Thỏa thuận'],
      ['Nhân viên Kỹ thuật Phần mềm', 'Khối cửa hàng', 'Nhiều khu vực', 'Thỏa thuận'],
      ['Automation Tester ERP', 'Khối công nghệ', 'TP. Hồ Chí Minh', 'Thỏa thuận'],
      ['Middle / Senior .NET Developer', 'Khối công nghệ', 'TP. Hồ Chí Minh', 'Thỏa thuận'],
    ],
    offices: [
      ['Trụ sở TP. Hồ Chí Minh', '350-352 Võ Văn Kiệt, Phường Cầu Ông Lãnh, TP.HCM', '0931.864.363', 'tuyendung@cellphones.com.vn'],
      ['Trụ sở Hà Nội', 'Số 2 ngõ 183 Đặng Tiến Đông, Phường Đống Đa, Hà Nội', '0963.013.240', 'tuyendungdaotao.hn@cellphones.com.vn'],
    ],
  },

  '/bieu-phi-bao-hanh-mo-rong': {
    kind: 'extended-warranty',
    tone: 'blue',
    eyebrow: 'Gói bảo vệ toàn diện',
    title: 'Dịch vụ bảo hành mở rộng',
    lead: 'Bảo hành 1 đổi 1 VIP, hỗ trợ rơi vỡ – vào nước và gia hạn bảo hành S24+ cho nhiều nhóm sản phẩm.',
    stats: [['1 đổi 1', 'VIP'], ['90%', 'Hỗ trợ sửa chữa'], ['24-36 tháng', 'Gia hạn bảo hành']],
    plans: [
      ['1 đổi 1 VIP', 'Điện thoại, tablet, tai nghe cao cấp, đồng hồ Apple/Samsung', '6 hoặc 12 tháng', 'Đổi sản phẩm tương đương khi đủ điều kiện.'],
      ['Rơi vỡ – Rơi nước', 'Điện thoại và máy tính bảng', '12 tháng', 'Hỗ trợ tới 90% chi phí sửa chữa theo điều kiện.'],
      ['S24+', 'MacBook, điện thoại và phụ kiện cao cấp', '24 đến 36 tháng', 'Tiếp tục bảo hành lỗi nhà sản xuất sau thời hạn hãng.'],
    ],
    priceTable: [
      ['Dưới 2,5 triệu', '150.000đ', '200.000đ', '250.000đ'],
      ['2,5 - 4 triệu', '180.000đ', '250.000đ', '350.000đ'],
      ['4 - 7 triệu', '250.000đ', '350.000đ', '500.000đ'],
      ['7 - 10 triệu', '350.000đ', '500.000đ', '700.000đ'],
      ['10 - 15 triệu', '500.000đ', '700.000đ', '1.000.000đ'],
      ['15 - 20 triệu', '700.000đ', '1.000.000đ', '1.400.000đ'],
      ['Trên 20 triệu', 'Theo biểu phí', 'Theo biểu phí', 'Theo biểu phí'],
    ],
  },
};

export function resolveFooterPageProfile(pathname = '/', search = '') {
  const params = new URLSearchParams(search || '');
  if (pathname === '/tos') {
    const part = params.get('part') || 'default';
    return footerPageProfiles[`/tos:${part}`] || footerPageProfiles['/tos:default'];
  }

  if (pathname === '/chinh-sach/chinh-sach-doi-tra') {
    return footerPageProfiles['/tos:refund-policy'];
  }

  if (pathname === '/chinh-sach-bao-mat' || pathname === '/chinh-sach/chinh-sach-bao-mat-thong-tin-ca-nhan') {
    return footerPageProfiles['/tos:privacy-policy'];
  }

  return footerPageProfiles[pathname] || null;
}
