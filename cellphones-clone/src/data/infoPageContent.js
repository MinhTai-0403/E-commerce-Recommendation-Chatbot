const policyLinks = [
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

const serviceLinks = [
  ['Khách hàng doanh nghiệp (B2B)', '/dich-vu-khach-hang-doanh-nghiep'],
  ['Ưu đãi thanh toán', '/danh-sach-khuyen-mai'],
  ['Quy chế hoạt động', '/tos'],
  ['Chính sách bảo mật thông tin cá nhân', '/tos?part=privacy-policy'],
  ['Chính sách Bảo hành', '/chinh-sach-bao-hanh'],
  ['Liên hệ hợp tác kinh doanh', '/lien-he-hop-tac'],
  ['Tuyển dụng', '/tuyen-dung'],
  ['Dịch vụ bảo hành mở rộng', '/bieu-phi-bao-hanh-mo-rong'],
];

const sourceLinksByTitle = {
  'Mua hàng và thanh toán Online': 'https://cellphones.com.vn/chinh-sach-giao-hang',
  'Chính sách giao hàng': 'https://cellphones.com.vn/chinh-sach-giao-hang',
  'Mua hàng trả góp': 'https://cellphones.com.vn/tra-gop',
  'Mua hàng trả góp bằng thẻ tín dụng': 'https://cellphones.com.vn/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones',
  'Chính sách đổi trả': 'https://cellphones.com.vn/tos?part=refund-policy',
  'Tra điểm Smember': 'https://smember.com.vn/?company_id=cellphones',
  'Xem ưu đãi Smember': 'https://cellphones.com.vn/uu-dai-smember',
  'Tra thông tin bảo hành': 'https://smember.com.vn/warranty?company_id=cellphones',
  'Tra cứu hoá đơn điện tử': 'https://hddt.cellphones.com.vn/',
  'Thông tin hoá đơn mua hàng': 'https://cellphones.com.vn/quy-dinh-ve-hoa-don-khi-mua-hang-cellphones',
  'Trung tâm bảo hành chính hãng': 'https://cellphones.com.vn/bao-hanh/apple',
  'Quy định về việc sao lưu dữ liệu': 'https://cellphones.com.vn/quy-dinh-ve-viec-sao-luu-du-lieu',
  'Chính sách khui hộp sản phẩm Apple': 'https://cellphones.com.vn/chinh-sach-khui-hop-apple',
  'VAT Refund': 'https://cellphones.com.vn/vat-refund',
  'Khách hàng doanh nghiệp (B2B)': 'https://cellphones.com.vn/dich-vu-khach-hang-doanh-nghiep',
  'Ưu đãi thanh toán': 'https://cellphones.com.vn/danh-sach-khuyen-mai',
  'Quy chế hoạt động': 'https://cellphones.com.vn/tos',
  'Chính sách bảo mật thông tin cá nhân': 'https://cellphones.com.vn/tos?part=privacy-policy',
  'Chính sách Bảo hành': 'https://cellphones.com.vn/chinh-sach-bao-hanh',
  'Liên hệ hợp tác kinh doanh': 'https://cellphones.com.vn/lien-he-hop-tac',
  'Tuyển dụng CellphoneS': 'https://tuyendung.cellphones.com.vn/',
  'Tuyển dụng': 'https://tuyendung.cellphones.com.vn/',
  'Dịch vụ bảo hành mở rộng': 'https://cellphones.com.vn/bieu-phi-bao-hanh-mo-rong',
};

export const infoNavigationGroups = [
  { title: 'Thông tin về chính sách', links: policyLinks },
  { title: 'Dịch vụ và thông tin khác', links: serviceLinks },
];

const redHero = {
  tone: 'red',
  badges: ['CellphoneS clone', 'Nội dung local'],
};

const makePage = ({
  title,
  eyebrow = 'Thông tin CellphoneS',
  description,
  stats = [],
  sections = [],
  sideCards = [],
  form,
  faq = [],
  tone = 'red',
  badges = ['CellphoneS clone'],
  sourceUrl = '',
}) => ({
  title,
  eyebrow,
  description,
  stats,
  sections,
  sideCards,
  form,
  faq,
  tone,
  badges,
  sourceUrl: sourceUrl || sourceLinksByTitle[title] || '',
});

const makePolicyPage = (title, options = {}) => makePage({
  ...redHero,
  title,
  sourceUrl: options.sourceUrl || sourceLinksByTitle[title] || '',
  description: options.description || 'Trang chính sách được dựng local theo phong cách CellphoneS, có đầy đủ khối hướng dẫn, điều kiện áp dụng và thao tác nhanh.',
  stats: options.stats || [
    { value: '24/7', label: 'Tra cứu nội dung' },
    { value: '1800.2097', label: 'Tổng đài mua hàng' },
    { value: 'Local', label: 'Không nhúng web gốc' },
  ],
  sections: options.sections,
  sideCards: options.sideCards || [
    { title: 'Cần nhân viên hỗ trợ?', text: 'Gọi tổng đài hoặc để lại thông tin để CellphoneS hỗ trợ đúng luồng.', cta: 'Liên hệ ngay', href: '/lien-he' },
    { title: 'Theo dõi đơn hàng', text: 'Kiểm tra trạng thái đặt hàng, thanh toán, đóng gói và giao hàng.', cta: 'Tra cứu đơn', href: '/tra-cuu-don-hang' },
  ],
  form: options.form,
  faq: options.faq,
});

const makeLookupForm = (type, title, fields, button = 'Tra cứu') => ({
  type,
  title,
  fields,
  button,
  helper: 'Form clone local phục vụ demo UI; khi gắn backend sẽ lưu/đọc dữ liệu từ API hiện tại.',
});

export const infoPageContentByPath = {
  '/chinh-sach/mua-hang-va-thanh-toan-online': makePolicyPage('Mua hàng và thanh toán Online', {
    description: 'Hướng dẫn mua hàng online, kiểm tra giỏ hàng, xác nhận thông tin nhận hàng và hoàn tất thanh toán trên website clone.',
    sections: [
      {
        title: 'Quy trình mua hàng online',
        steps: [
          'Chọn sản phẩm, phiên bản, màu sắc và bấm Mua ngay hoặc Thêm vào giỏ hàng.',
          'Kiểm tra số lượng, quà tặng, khuyến mãi và tổng tiền tạm tính.',
          'Nhập thông tin khách hàng, địa chỉ nhận hàng hoặc chọn nhận tại cửa hàng.',
          'Chọn COD hoặc QR ngân hàng, sau đó đặt hàng để hệ thống tạo mã đơn.',
        ],
      },
      {
        title: 'Lưu ý khi thanh toán',
        bullets: [
          'Giá hiển thị đã gồm VAT nếu sản phẩm có chính sách VAT.',
          'Một đơn hàng chỉ áp dụng một số nhóm mã giảm giá theo điều kiện.',
          'Đơn thanh toán tự động cần đúng số tiền và nội dung chuyển khoản.',
        ],
      },
    ],
    form: makeLookupForm('order', 'Kiểm tra nhanh đơn hàng', [
      { label: 'Mã đơn hàng', placeholder: 'Ví dụ: CPS123456' },
      { label: 'Số điện thoại', placeholder: 'Nhập số điện thoại đặt hàng' },
    ], 'Kiểm tra'),
    faq: [
      { q: 'Có thể đổi phương thức thanh toán sau khi đặt không?', a: 'Có thể đổi trước khi đơn được xác nhận giao hàng. Với đơn đã thanh toán, cần liên hệ tổng đài để được hỗ trợ.' },
      { q: 'Đặt online có nhận tại cửa hàng được không?', a: 'Có. Bạn chọn tab nhận tại cửa hàng ở bước thông tin nhận hàng.' },
    ],
  }),

  '/chinh-sach/mua-hang-tra-gop': makePolicyPage('Mua hàng trả góp', {
    description: 'Mô phỏng trang hướng dẫn trả góp CellphoneS với các bước duyệt hồ sơ, chọn kỳ hạn và nhận máy.',
    stats: [
      { value: '0%', label: 'Lãi suất tuỳ chương trình' },
      { value: '10-30 phút', label: 'Duyệt hồ sơ tham khảo' },
      { value: 'Online', label: 'Có thể đăng ký trước' },
    ],
    sections: [
      {
        title: 'Các bước trả góp',
        steps: [
          'Chọn sản phẩm đủ điều kiện trả góp.',
          'Chọn công ty tài chính, số tiền trả trước và kỳ hạn.',
          'Điền thông tin cơ bản để nhân viên xác nhận hồ sơ.',
          'Hoàn tất ký hồ sơ và nhận hàng tại cửa hàng hoặc giao tận nơi.',
        ],
      },
      {
        title: 'Giấy tờ thường cần chuẩn bị',
        cards: [
          { title: 'CMND/CCCD', text: 'Thông tin còn hiệu lực, khớp người mua.' },
          { title: 'Số điện thoại', text: 'Đang sử dụng để nhận OTP/xác minh hồ sơ.' },
          { title: 'Thông tin thu nhập', text: 'Tuỳ chương trình có thể cần thêm xác nhận.' },
        ],
      },
    ],
  }),

  '/chinh-sach/mua-hang-tra-gop-bang-the-tin-dung': makePolicyPage('Mua hàng trả góp bằng thẻ tín dụng', {
    description: 'Trang clone mô tả luồng trả góp qua thẻ tín dụng: chọn ngân hàng, kỳ hạn, kiểm tra phí chuyển đổi và xác nhận giao dịch.',
    sections: [
      {
        title: 'Điều kiện áp dụng',
        bullets: [
          'Thẻ tín dụng còn hạn mức đủ để thanh toán toàn bộ giá trị đơn hàng.',
          'Ngân hàng phát hành thẻ có hỗ trợ trả góp cho ngành hàng tương ứng.',
          'Chủ thẻ xác nhận OTP/3D Secure theo yêu cầu của ngân hàng.',
        ],
      },
      {
        title: 'Bảng thông tin tham khảo',
        table: [
          ['Kỳ hạn', '3, 6, 9, 12 tháng tuỳ ngân hàng'],
          ['Phí chuyển đổi', 'Hiển thị trước khi xác nhận thanh toán'],
          ['Hình thức nhận hàng', 'Giao tận nơi hoặc nhận tại cửa hàng'],
        ],
      },
    ],
  }),

  '/chinh-sach-giao-hang': makePolicyPage('Chính sách giao hàng', {
    description: 'Thông tin giao nhanh, giao tiêu chuẩn, phạm vi áp dụng và cách theo dõi đơn hàng.',
    sections: [
      {
        title: 'Hình thức giao hàng',
        cards: [
          { title: 'Giao nhanh nội thành', text: 'Áp dụng theo khu vực, tồn kho và khung giờ đặt hàng.' },
          { title: 'Giao tiêu chuẩn', text: 'Phù hợp đơn liên tỉnh hoặc sản phẩm cần điều phối kho.' },
          { title: 'Nhận tại cửa hàng', text: 'Đặt trước, giữ hàng và tới cửa hàng đã chọn để nhận.' },
        ],
      },
      {
        title: 'Theo dõi giao hàng',
        bullets: [
          'Mỗi đơn hàng có mã theo dõi trạng thái.',
          'Thông tin nhận hàng cần chính xác số điện thoại, địa chỉ, phường/xã, quận/huyện, tỉnh/thành.',
          'Nhân viên giao hàng sẽ liên hệ trước khi giao.',
        ],
      },
    ],
  }),

  '/chinh-sach/chinh-sach-doi-tra': makePolicyPage('Chính sách đổi trả', {
    description: 'Trang đổi trả local, trình bày các trường hợp đổi mới, trả hàng và kiểm tra tình trạng sản phẩm.',
    sections: [
      {
        title: 'Điều kiện đổi trả',
        bullets: [
          'Sản phẩm còn đầy đủ phụ kiện, hộp, chứng từ mua hàng nếu chính sách yêu cầu.',
          'Lỗi kỹ thuật được kiểm tra bởi CellphoneS hoặc trung tâm bảo hành uỷ quyền.',
          'Một số sản phẩm đặc thù có chính sách khui hộp/đổi trả riêng.',
        ],
      },
      {
        title: 'Luồng xử lý',
        steps: [
          'Gửi yêu cầu hoặc mang sản phẩm tới cửa hàng.',
          'Nhân viên kiểm tra tình trạng sản phẩm và chính sách áp dụng.',
          'Hệ thống cập nhật kết quả: đổi mới, bảo hành, hoàn tiền hoặc hỗ trợ khác.',
        ],
      },
    ],
  }),

  '/smember/tra-diem': makePolicyPage('Tra điểm Smember', {
    eyebrow: 'Smember',
    description: 'Mô phỏng trang tra điểm thành viên Smember ngay trong website clone.',
    stats: [
      { value: 'S-NEW', label: 'Hạng mặc định' },
      { value: 'Tích luỹ', label: 'Theo đơn hàng' },
      { value: 'Ưu đãi', label: 'Theo hạng thành viên' },
    ],
    sections: [
      {
        title: 'Bạn có thể tra cứu',
        bullets: [
          'Tổng chi tiêu tích luỹ và số đơn hàng đã mua.',
          'Hạng thành viên, voucher đang có và hạn sử dụng.',
          'Lịch sử mua hàng gắn với tài khoản đăng nhập.',
        ],
      },
    ],
    form: makeLookupForm('smember', 'Tra điểm thành viên', [
      { label: 'Số điện thoại Smember', placeholder: 'Nhập số điện thoại' },
      { label: 'Email', placeholder: 'Nhập email nếu có' },
    ], 'Tra điểm'),
  }),

  '/uu-dai-smember': makePolicyPage('Xem ưu đãi Smember', {
    eyebrow: 'Smember',
    description: 'Danh sách ưu đãi thành viên được clone local: giảm giá theo hạng, sinh nhật, S-Student và voucher cá nhân.',
    sections: [
      {
        title: 'Nhóm ưu đãi nổi bật',
        cards: [
          { title: 'Giảm thêm khi mua hàng', text: 'Ưu đãi theo hạng thành viên và từng sản phẩm.' },
          { title: 'Voucher sinh nhật', text: 'Mã giảm giá theo chu kỳ sinh nhật tài khoản.' },
          { title: 'S-Student/S-Teacher', text: 'Ưu đãi giáo dục khi xác minh thông tin hợp lệ.' },
        ],
      },
    ],
  }),

  '/smember/uu-dai': makePolicyPage('Ưu đãi Smember', {
    eyebrow: 'Smember',
    description: 'Khu vực xem nhanh ưu đãi, voucher và quyền lợi tài khoản Smember.',
    sections: [
      {
        title: 'Quyền lợi tài khoản',
        bullets: ['Theo dõi đơn hàng', 'Lưu địa chỉ nhận hàng', 'Nhận ưu đãi riêng cho thành viên', 'Tra cứu bảo hành nhanh hơn'],
      },
    ],
  }),

  '/bao-hanh/tra-thong-tin-bao-hanh': makePolicyPage('Tra thông tin bảo hành', {
    eyebrow: 'Bảo hành',
    description: 'Trang tra bảo hành local cho sản phẩm đã mua tại CellphoneS.',
    sections: [
      {
        title: 'Thông tin cần có',
        bullets: ['Số điện thoại mua hàng', 'Mã đơn hàng hoặc IMEI/Serial', 'Tên sản phẩm cần tra cứu'],
      },
    ],
    form: makeLookupForm('warranty', 'Tra cứu bảo hành', [
      { label: 'Số điện thoại', placeholder: 'Nhập số điện thoại mua hàng' },
      { label: 'IMEI / Serial / Mã đơn', placeholder: 'Nhập thông tin sản phẩm' },
    ], 'Tra bảo hành'),
  }),

  '/hoa-don/tra-cuu-hoa-don-dien-tu': makePolicyPage('Tra cứu hoá đơn điện tử', {
    eyebrow: 'Hoá đơn',
    description: 'Trang clone tra hoá đơn điện tử, phục vụ nhập mã đơn và email nhận hoá đơn.',
    sections: [
      {
        title: 'Tra cứu hoá đơn',
        bullets: [
          'Hoá đơn VAT được gửi về email khách hàng đã khai báo.',
          'Nếu thông tin email sai, khách hàng có thể gửi yêu cầu hỗ trợ cập nhật.',
          'Hoá đơn công ty cần thông tin mã số thuế và tên đơn vị chính xác.',
        ],
      },
    ],
    form: makeLookupForm('invoice', 'Tra hoá đơn điện tử', [
      { label: 'Mã đơn hàng', placeholder: 'Nhập mã đơn hàng' },
      { label: 'Email nhận hoá đơn', placeholder: 'Nhập email' },
    ], 'Tra hoá đơn'),
  }),

  '/quy-dinh-ve-hoa-don-khi-mua-hang-cellphones': makePolicyPage('Thông tin hoá đơn mua hàng', {
    eyebrow: 'Hoá đơn',
    description: 'Thông tin về việc xuất hoá đơn cá nhân/công ty khi mua hàng tại CellphoneS clone.',
    sections: [
      {
        title: 'Thông tin cần nhập',
        table: [
          ['Khách cá nhân', 'Email nhận hoá đơn, số điện thoại đặt hàng'],
          ['Khách công ty', 'Tên công ty, mã số thuế, địa chỉ công ty'],
          ['Thời điểm yêu cầu', 'Nên nhập ngay ở bước đặt hàng để xử lý nhanh'],
        ],
      },
    ],
  }),

  '/bao-hanh/apple': makePolicyPage('Trung tâm bảo hành chính hãng', {
    eyebrow: 'Bảo hành',
    description: 'Danh sách và hướng dẫn tiếp nhận bảo hành chính hãng/uỷ quyền được dựng local.',
    sections: [
      {
        title: 'Nhóm trung tâm hỗ trợ',
        cards: [
          { title: 'Apple CareS', text: 'Tiếp nhận thiết bị Apple chính hãng theo quy định uỷ quyền.' },
          { title: 'Hãng điện thoại', text: 'Samsung, OPPO, Xiaomi, HONOR và các thương hiệu khác.' },
          { title: 'Laptop/PC', text: 'Hỗ trợ điều phối tới trung tâm hãng hoặc điểm nhận bảo hành.' },
        ],
      },
    ],
  }),

  '/quy-dinh-ve-viec-sao-luu-du-lieu': makePolicyPage('Quy định về việc sao lưu dữ liệu', {
    description: 'Nhắc khách hàng chủ động sao lưu dữ liệu trước khi sửa chữa, bảo hành hoặc đổi trả sản phẩm.',
    sections: [
      {
        title: 'Trách nhiệm sao lưu',
        bullets: [
          'Khách hàng nên tự sao lưu hình ảnh, danh bạ, tài liệu và dữ liệu ứng dụng.',
          'CellphoneS chỉ hỗ trợ kỹ thuật trong phạm vi được khách hàng đồng ý.',
          'Một số thao tác sửa chữa có thể cần khôi phục cài đặt gốc.',
        ],
      },
    ],
  }),

  '/chinh-sach-khui-hop-apple': makePolicyPage('Chính sách khui hộp sản phẩm Apple', {
    description: 'Trang mô phỏng quy định kiểm tra, khui hộp và đổi trả với sản phẩm Apple.',
    sections: [
      {
        title: 'Quy định khui hộp',
        bullets: [
          'Kiểm tra ngoại quan, seal, phụ kiện và thông tin máy trước khi kích hoạt.',
          'Sản phẩm Apple đã kích hoạt áp dụng theo chính sách bảo hành/đổi trả riêng.',
          'Khách hàng nên giữ hộp và phụ kiện trong suốt thời gian đổi trả theo quy định.',
        ],
      },
    ],
  }),

  '/vat-refund': makePolicyPage('VAT Refund', {
    eyebrow: 'VAT Refund',
    description: 'Trang thông tin hoàn thuế VAT cho khách đủ điều kiện, dựng local trong clone.',
    sections: [
      {
        title: 'Thông tin tham khảo',
        bullets: [
          'Áp dụng theo quy định pháp luật và chính sách cửa hàng ở từng thời điểm.',
          'Khách hàng cần cung cấp đầy đủ giấy tờ/hộ chiếu/hoá đơn theo yêu cầu.',
          'Nhân viên sẽ hướng dẫn quy trình cụ thể trước khi xuất hoá đơn.',
        ],
      },
    ],
  }),

  '/dich-vu-khach-hang-doanh-nghiep': makePolicyPage('Khách hàng doanh nghiệp (B2B)', {
    eyebrow: 'Dịch vụ doanh nghiệp',
    description: 'Trang B2B local dành cho công ty cần mua số lượng lớn, xuất hoá đơn và hỗ trợ triển khai thiết bị.',
    sections: [
      {
        title: 'Dịch vụ cho doanh nghiệp',
        cards: [
          { title: 'Báo giá số lượng', text: 'Tư vấn cấu hình và giá theo nhu cầu triển khai.' },
          { title: 'Hỗ trợ hoá đơn', text: 'Chuẩn bị chứng từ VAT và thông tin công ty.' },
          { title: 'Giao hàng dự án', text: 'Điều phối giao hàng nhiều điểm hoặc một địa chỉ tập trung.' },
        ],
      },
    ],
    form: makeLookupForm('business', 'Gửi yêu cầu B2B', [
      { label: 'Tên công ty', placeholder: 'Nhập tên công ty' },
      { label: 'Người liên hệ', placeholder: 'Tên người phụ trách' },
      { label: 'Số điện thoại', placeholder: 'Nhập số điện thoại' },
    ], 'Gửi yêu cầu'),
  }),

  '/dich-vu/khach-hang-doanh-nghiep-b2b': makePolicyPage('Khách hàng doanh nghiệp (B2B)', {
    eyebrow: 'Dịch vụ doanh nghiệp',
    description: 'Khu vực tư vấn mua hàng doanh nghiệp, báo giá theo số lượng và hỗ trợ chứng từ.',
    sections: [
      { title: 'Cam kết hỗ trợ', bullets: ['Tư vấn nhanh', 'Báo giá rõ ràng', 'Xuất hoá đơn theo thông tin hợp lệ'] },
    ],
  }),

  '/danh-sach-khuyen-mai': makePolicyPage('Ưu đãi thanh toán', {
    eyebrow: 'Khuyến mãi',
    description: 'Tổng hợp ưu đãi thanh toán ngân hàng, ví điện tử và chương trình hoàn tiền trong clone.',
    sections: [
      {
        title: 'Nhóm ưu đãi',
        cards: [
          { title: 'Ngân hàng', text: 'Ưu đãi theo thẻ, trả góp hoặc QR.' },
          { title: 'Ví điện tử', text: 'Mã giảm giá/hoàn tiền theo chương trình.' },
          { title: 'Smember', text: 'Ưu đãi cộng thêm theo hạng thành viên.' },
        ],
      },
    ],
  }),

  '/khuyen-mai/uu-dai-thanh-toan': makePolicyPage('Ưu đãi thanh toán', {
    eyebrow: 'Khuyến mãi',
    description: 'Trang ưu đãi thanh toán local, dùng cho các liên kết footer và nút khuyến mãi.',
    sections: [
      { title: 'Cách nhận ưu đãi', steps: ['Chọn sản phẩm', 'Chọn phương thức thanh toán phù hợp', 'Kiểm tra ưu đãi trước khi đặt hàng'] },
    ],
  }),

  '/chinh-sach/quy-che-hoat-dong': makePolicyPage('Quy chế hoạt động', {
    description: 'Quy chế hoạt động của website thương mại điện tử clone: quyền và trách nhiệm của khách hàng, người bán và hệ thống.',
    sections: [
      {
        title: 'Nguyên tắc hoạt động',
        bullets: [
          'Thông tin sản phẩm cần được hiển thị rõ ràng, đồng bộ với dữ liệu quản trị.',
          'Đơn hàng được ghi nhận vào hệ thống để theo dõi trạng thái xử lý.',
          'Tài khoản người dùng chịu trách nhiệm bảo mật thông tin đăng nhập.',
        ],
      },
    ],
  }),

  '/chinh-sach-bao-mat': makePolicyPage('Chính sách bảo mật thông tin cá nhân', {
    description: 'Trang bảo mật local mô tả cách clone thu thập, sử dụng và bảo vệ thông tin khách hàng.',
    sections: [
      {
        title: 'Dữ liệu có thể được sử dụng',
        bullets: ['Thông tin đăng ký/đăng nhập', 'Thông tin đặt hàng và giao hàng', 'Lịch sử tương tác đánh giá, hỏi đáp, hỗ trợ'],
      },
      {
        title: 'Mục đích sử dụng',
        bullets: ['Xác thực tài khoản', 'Xử lý đơn hàng', 'Cá nhân hoá ưu đãi', 'Chăm sóc khách hàng'],
      },
    ],
  }),

  '/chinh-sach/chinh-sach-bao-mat-thong-tin-ca-nhan': makePolicyPage('Chính sách bảo mật thông tin cá nhân', {
    description: 'Bản local của chính sách bảo mật, dùng cho toàn bộ footer và trang tài khoản.',
    sections: [
      { title: 'Cam kết', bullets: ['Không hiển thị công khai thông tin nhạy cảm', 'Chỉ dùng dữ liệu cho vận hành đơn hàng và chăm sóc khách', 'Có thể xoá/sửa theo yêu cầu hợp lệ'] },
    ],
  }),

  '/chinh-sach-bao-hanh': makePolicyPage('Chính sách Bảo hành', {
    eyebrow: 'Bảo hành',
    description: 'Trang chính sách bảo hành local dành cho sản phẩm mua tại CellphoneS clone.',
    sections: [
      {
        title: 'Các trường hợp thường gặp',
        cards: [
          { title: 'Bảo hành hãng', text: 'Áp dụng theo chính sách thương hiệu và thời hạn bảo hành.' },
          { title: '1 đổi 1', text: 'Tuỳ sản phẩm, lỗi và thời gian mua hàng.' },
          { title: 'Sửa chữa dịch vụ', text: 'Nhân viên báo tình trạng, chi phí và thời gian dự kiến.' },
        ],
      },
    ],
  }),

  '/chinh-sach/chinh-sach-bao-hanh': makePolicyPage('Chính sách Bảo hành', {
    eyebrow: 'Bảo hành',
    description: 'Bản local của chính sách bảo hành cho các liên kết nội bộ.',
    sections: [
      { title: 'Quy trình', steps: ['Tiếp nhận sản phẩm', 'Kiểm tra điều kiện bảo hành', 'Cập nhật kết quả xử lý'] },
    ],
  }),

  '/lien-he-hop-tac': makePolicyPage('Liên hệ hợp tác kinh doanh', {
    eyebrow: 'Hợp tác',
    description: 'Trang local tiếp nhận đề xuất hợp tác thương mại, truyền thông, cung ứng và dịch vụ.',
    sections: [
      {
        title: 'Nhóm hợp tác',
        cards: [
          { title: 'Nhà cung cấp', text: 'Gửi thông tin sản phẩm, chính sách phân phối và hồ sơ doanh nghiệp.' },
          { title: 'Marketing', text: 'Đề xuất chiến dịch truyền thông, affiliate hoặc tài trợ nội dung.' },
          { title: 'Dịch vụ', text: 'Hợp tác bảo hành, sửa chữa, giao vận hoặc giải pháp kỹ thuật.' },
        ],
      },
    ],
    form: makeLookupForm('contact', 'Thông tin hợp tác', [
      { label: 'Tên đơn vị', placeholder: 'Nhập tên công ty/đối tác' },
      { label: 'Email liên hệ', placeholder: 'Nhập email' },
      { label: 'Nội dung', placeholder: 'Mô tả đề xuất hợp tác', textarea: true },
    ], 'Gửi thông tin'),
  }),

  '/tuyen-dung': makePolicyPage('Tuyển dụng CellphoneS', {
    eyebrow: 'Tuyển dụng',
    description: 'Trang tuyển dụng local với các vị trí bán hàng, kỹ thuật, vận hành, marketing và công nghệ.',
    sections: [
      {
        title: 'Vị trí thường tuyển',
        cards: [
          { title: 'Tư vấn bán hàng', text: 'Làm việc tại cửa hàng, tư vấn sản phẩm và chăm sóc khách.' },
          { title: 'Kỹ thuật viên', text: 'Kiểm tra thiết bị, hỗ trợ cài đặt và bảo hành.' },
          { title: 'Vận hành kho', text: 'Đóng gói, điều phối hàng hoá và kiểm kê.' },
        ],
      },
    ],
    form: makeLookupForm('recruitment', 'Ứng tuyển nhanh', [
      { label: 'Họ và tên', placeholder: 'Nhập họ tên' },
      { label: 'Số điện thoại', placeholder: 'Nhập số điện thoại' },
      { label: 'Vị trí quan tâm', placeholder: 'Ví dụ: Tư vấn bán hàng' },
    ], 'Gửi hồ sơ'),
  }),

  '/bieu-phi-bao-hanh-mo-rong': makePolicyPage('Dịch vụ bảo hành mở rộng', {
    eyebrow: 'Dịch vụ bảo hành',
    description: 'Mô phỏng trang bảo hành mở rộng, gói rơi vỡ, vào nước hoặc gia hạn bảo hành theo từng sản phẩm.',
    sections: [
      {
        title: 'Gói dịch vụ',
        table: [
          ['Gia hạn bảo hành', 'Kéo dài thời gian bảo hành theo gói'],
          ['Rơi vỡ', 'Hỗ trợ chi phí sửa chữa theo điều kiện'],
          ['Bảo vệ màn hình', 'Áp dụng cho một số nhóm điện thoại/tablet'],
        ],
      },
    ],
  }),

  '/download-app': makePage({
    ...redHero,
    title: 'Tải ứng dụng CellphoneS',
    eyebrow: 'App CellphoneS',
    description: 'Trang local mô phỏng khu tải app, QR, quyền lợi khi mua sắm trên ứng dụng và theo dõi đơn hàng.',
    stats: [
      { value: 'QR', label: 'Quét tải nhanh' },
      { value: 'Voucher', label: 'Ưu đãi app' },
      { value: 'Order', label: 'Theo dõi đơn' },
    ],
    sections: [
      {
        title: 'Mua sắm dễ dàng trên app',
        cards: [
          { title: 'Tìm sản phẩm nhanh', text: 'Tìm kiếm, lọc theo ngành hàng và xem sản phẩm yêu thích.' },
          { title: 'Theo dõi đơn hàng', text: 'Cập nhật trạng thái xác nhận, đóng gói, giao hàng.' },
          { title: 'Nhận ưu đãi', text: 'Voucher app, ưu đãi Smember và thông báo khuyến mãi.' },
        ],
      },
    ],
    sideCards: [
      { title: 'Android', text: 'Tải ứng dụng từ Google Play hoặc quét QR trong footer.', cta: 'Mở Google Play', href: 'https://play.google.com/store/search?q=CellphoneS&c=apps' },
      { title: 'iOS', text: 'Tải ứng dụng từ App Store cho iPhone/iPad.', cta: 'Mở App Store', href: 'https://apps.apple.com/vn/search?term=cellphones' },
    ],
  }),

  '/khuyen-mai/dang-ky-nhan-tin': makePage({
    ...redHero,
    title: 'Đăng ký nhận tin khuyến mãi',
    eyebrow: 'Khuyến mãi',
    description: 'Trang local để khách đăng ký email/số điện thoại nhận voucher và chương trình mới.',
    sections: [
      { title: 'Quyền lợi khi đăng ký', bullets: ['Nhận voucher cho khách hàng mới', 'Cập nhật sale lớn', 'Nhận ưu đãi theo ngành hàng quan tâm'] },
    ],
    form: makeLookupForm('newsletter', 'Thông tin nhận tin', [
      { label: 'Email', placeholder: 'Nhập email của bạn' },
      { label: 'Số điện thoại', placeholder: 'Nhập số điện thoại' },
    ], 'Đăng ký ngay'),
  }),

  '/he-thong-cua-hang': makePage({
    ...redHero,
    title: 'Hệ thống cửa hàng CellphoneS',
    eyebrow: 'Cửa hàng',
    description: 'Trang tìm cửa hàng local, phục vụ link “Cửa hàng gần bạn” trong header/footer.',
    sections: [
      {
        title: 'Tìm điểm bán gần bạn',
        cards: [
          { title: 'Hồ Chí Minh', text: 'Cửa hàng trung tâm, khu dân cư và trung tâm thương mại.' },
          { title: 'Hà Nội', text: 'Điểm bán và bảo hành tại các quận lớn.' },
          { title: 'Tỉnh thành khác', text: 'Hệ thống mở rộng theo dữ liệu cửa hàng.' },
        ],
      },
    ],
    form: makeLookupForm('store', 'Tìm cửa hàng', [
      { label: 'Tỉnh / Thành phố', placeholder: 'Chọn tỉnh / thành phố' },
      { label: 'Quận / Huyện', placeholder: 'Chọn quận / huyện' },
    ], 'Tìm cửa hàng'),
  }),

  '/tra-cuu-don-hang': makePage({
    ...redHero,
    title: 'Tra cứu đơn hàng',
    eyebrow: 'Đơn hàng',
    description: 'Trang local giúp khách kiểm tra tiến độ xác nhận, thanh toán, đóng gói, giao hàng và hoàn tất.',
    sections: [
      { title: 'Trạng thái đơn hàng', steps: ['Đã đặt hàng', 'Đã xác nhận', 'Đang đóng gói', 'Đang giao', 'Hoàn tất'] },
    ],
    form: makeLookupForm('order', 'Nhập thông tin đơn hàng', [
      { label: 'Mã đơn hàng', placeholder: 'Nhập mã đơn' },
      { label: 'Số điện thoại', placeholder: 'Nhập số điện thoại' },
    ], 'Tra cứu'),
  }),

  '/lien-he': makePage({
    ...redHero,
    title: 'Liên hệ CellphoneS',
    eyebrow: 'Liên hệ',
    description: 'Trang liên hệ local cho tổng đài, góp ý, phản hồi và hỗ trợ sau bán hàng.',
    sections: [
      {
        title: 'Kênh hỗ trợ',
        table: [
          ['Mua hàng - bảo hành', '1800.2097 (7h30 - 22h00)'],
          ['Khiếu nại', '1800.2063 (8h00 - 21h30)'],
          ['Email', 'cskh@cellphones-clone.local'],
        ],
      },
    ],
    form: makeLookupForm('support', 'Gửi yêu cầu hỗ trợ', [
      { label: 'Họ và tên', placeholder: 'Nhập họ tên' },
      { label: 'Số điện thoại', placeholder: 'Nhập số điện thoại' },
      { label: 'Nội dung', placeholder: 'Bạn cần hỗ trợ điều gì?', textarea: true },
    ], 'Gửi yêu cầu'),
  }),

  '/dieu-khoan-su-dung': makePolicyPage('Điều khoản sử dụng', {
    description: 'Điều khoản sử dụng website clone CellphoneS: tài khoản, đơn hàng, dữ liệu và trách nhiệm sử dụng.',
    sections: [
      { title: 'Điều khoản chính', bullets: ['Sử dụng thông tin chính xác khi đặt hàng', 'Không lạm dụng hệ thống khuyến mãi', 'Tôn trọng quyền sở hữu nội dung và dữ liệu'] },
    ],
  }),

  '/tos': makePolicyPage('Quy chế hoạt động', {
    sourceUrl: 'https://cellphones.com.vn/tos',
    description: 'Trang quy chế hoạt động website TMĐT CellphoneS clone, gồm quy định chung, quy trình giao dịch, bảo hành, đổi trả và bảo mật.',
    sections: [
      { title: 'Các phần chính', bullets: ['Quy định chung', 'Quy trình giao dịch', 'Chính sách bảo hành sản phẩm', 'Chính sách huỷ giao dịch, đổi trả hàng', 'Chính sách bảo mật thông tin khách hàng'] },
    ],
  }),
};

infoPageContentByPath['/tra-gop'] = infoPageContentByPath['/chinh-sach/mua-hang-tra-gop'];
infoPageContentByPath['/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones'] = infoPageContentByPath['/chinh-sach/mua-hang-tra-gop-bang-the-tin-dung'];
infoPageContentByPath['/tos?part=refund-policy'] = infoPageContentByPath['/chinh-sach/chinh-sach-doi-tra'];
infoPageContentByPath['/tos?part=privacy-policy'] = infoPageContentByPath['/chinh-sach-bao-mat'];
infoPageContentByPath['/chinh-sach/quy-che-hoat-dong'] = infoPageContentByPath['/tos'];
infoPageContentByPath['/chinh-sach/chinh-sach-bao-mat-thong-tin-ca-nhan'] = infoPageContentByPath['/chinh-sach-bao-mat'];

const paymentDescriptions = {
  'apple-pay': 'Thanh toán nhanh bằng Apple Pay cho thiết bị hỗ trợ, xác nhận bằng Face ID/Touch ID hoặc mật mã.',
  vnpay: 'Thanh toán qua cổng VNPAY hoặc QR ngân hàng, hỗ trợ xác nhận giao dịch tự động khi tích hợp webhook.',
  momo: 'Thanh toán bằng ví MoMo, nhận thông báo giao dịch và ưu đãi theo chương trình.',
  onepay: 'Thanh toán qua cổng OnePay cho thẻ nội địa/quốc tế theo điều kiện hỗ trợ.',
  mpos: 'Thanh toán thẻ tại cửa hàng bằng máy POS/mPOS.',
  kredivo: 'Thanh toán trả sau/trả góp qua Kredivo theo hạn mức và điều kiện duyệt.',
  zalopay: 'Thanh toán bằng ZaloPay, hỗ trợ ví điện tử và ưu đãi theo thời điểm.',
  fundiin: 'Mua trước trả sau qua Fundiin theo kỳ hạn và điều kiện xác minh.',
};

const memberPages = {
  dienthoaivui: makePage({
    ...redHero,
    title: 'Điện Thoại Vui',
    eyebrow: 'Website thành viên',
    description: 'Trang local giới thiệu hệ thống sửa chữa, bảo hành và chăm sóc Điện thoại - Máy tính trong hệ sinh thái.',
    sections: [
      { title: 'Dịch vụ nổi bật', cards: [{ title: 'Sửa chữa điện thoại', text: 'Thay màn hình, pin, camera và linh kiện.' }, { title: 'Sửa laptop', text: 'Vệ sinh, nâng cấp, thay linh kiện.' }, { title: 'Bảo hành dịch vụ', text: 'Theo dõi tình trạng sửa chữa và bảo hành.' }] },
    ],
  }),
  cares: makePage({
    ...redHero,
    title: 'CareS - Trung tâm bảo hành uỷ quyền Apple',
    eyebrow: 'Website thành viên',
    description: 'Trang local giới thiệu trung tâm bảo hành uỷ quyền Apple trong hệ sinh thái CellphoneS.',
    sections: [
      { title: 'Hỗ trợ Apple', bullets: ['Tiếp nhận iPhone, iPad, MacBook và phụ kiện Apple', 'Kiểm tra theo quy trình hãng', 'Tư vấn điều kiện bảo hành'] },
    ],
  }),
  schannel: makePage({
    ...redHero,
    title: 'SChannel',
    eyebrow: 'Website thành viên',
    description: 'Trang local giới thiệu kênh nội dung công nghệ, giải trí và trải nghiệm sản phẩm cho giới trẻ.',
    sections: [
      { title: 'Nội dung chính', cards: [{ title: 'Review sản phẩm', text: 'Trải nghiệm điện thoại, laptop, phụ kiện.' }, { title: 'Tin công nghệ', text: 'Cập nhật xu hướng và sự kiện.' }] },
    ],
  }),
  sforum: makePage({
    ...redHero,
    title: 'Sforum',
    eyebrow: 'Website thành viên',
    description: 'Trang local giới thiệu cổng thông tin công nghệ, thủ thuật, đánh giá và tin tức mới.',
    sections: [
      { title: 'Chuyên mục', bullets: ['Tin công nghệ', 'Thủ thuật', 'Đánh giá', 'Khuyến mãi'] },
    ],
  }),
};

const connectPages = {
  youtube: ['YouTube CellphoneS', 'Theo dõi video đánh giá, hướng dẫn chọn mua và livestream công nghệ.'],
  facebook: ['Facebook CellphoneS', 'Cập nhật khuyến mãi, tin tức cửa hàng và hỗ trợ cộng đồng.'],
  instagram: ['Instagram CellphoneS', 'Hình ảnh sản phẩm, chiến dịch mới và nội dung ngắn.'],
  tiktok: ['TikTok CellphoneS', 'Video ngắn, mẹo công nghệ và trend sản phẩm.'],
  zalo: ['Zalo CellphoneS', 'Kênh thông báo, chăm sóc khách hàng và ưu đãi nhanh.'],
};

const titleFromSlug = (slug = '') => String(slug || '')
  .split('-')
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

export const getInfoPageContent = (page) => {
  const part = page.params?.get?.('part') || '';
  const basePath = page.path || `/${page.root}/${page.slug}`;
  const path = part ? `${basePath}?part=${part}` : basePath;
  if (infoPageContentByPath[path]) return infoPageContentByPath[path];
  if (infoPageContentByPath[basePath]) return infoPageContentByPath[basePath];

  if (page.root === 'thanh-toan') {
    const paymentTitle = titleFromSlug(page.slug);
    return makePage({
      ...redHero,
      title: `Phương thức thanh toán ${paymentTitle}`,
      eyebrow: 'Thanh toán',
      description: paymentDescriptions[page.slug] || `Trang local mô tả phương thức thanh toán ${paymentTitle}.`,
      stats: [
        { value: 'An toàn', label: 'Xác nhận giao dịch' },
        { value: 'COD/QR', label: 'Hỗ trợ đặt hàng' },
        { value: 'Local', label: 'Trang clone nội bộ' },
      ],
      sections: [
        {
          title: 'Cách sử dụng',
          steps: [
            'Chọn sản phẩm và tiến hành đặt hàng.',
            `Chọn ${paymentTitle} ở bước thanh toán nếu phương thức đang khả dụng.`,
            'Kiểm tra tổng tiền, ưu đãi và xác nhận thanh toán.',
          ],
        },
        {
          title: 'Lưu ý',
          bullets: [
            'Đơn hàng chỉ được xác nhận khi hệ thống ghi nhận thanh toán hoặc chọn COD thành công.',
            'Ưu đãi thanh toán có thể thay đổi theo thời điểm và ngân hàng/ví điện tử.',
          ],
        },
      ],
    });
  }

  if (page.root === 'thanh-vien' && memberPages[page.slug]) {
    return memberPages[page.slug];
  }

  if (page.root === 'ket-noi' && connectPages[page.slug]) {
    const [title, description] = connectPages[page.slug];
    return makePage({
      ...redHero,
      title,
      eyebrow: 'Kết nối với CellphoneS',
      description,
      sections: [
        {
          title: 'Nội dung kênh',
          bullets: ['Tin khuyến mãi', 'Review sản phẩm', 'Hướng dẫn mua hàng', 'Chăm sóc khách hàng'],
        },
      ],
    });
  }

  return makePage({
    ...redHero,
    title: page.title,
    description: page.description || 'Trang nội dung local cho liên kết trong website clone.',
    sections: [
      {
        title: 'Nội dung đang được chuẩn hoá',
        bullets: [
          'Route này đã được xử lý nội bộ thay vì trỏ ra website gốc.',
          'Có thể thay nội dung bằng dữ liệu admin/CMS theo slug hiện tại.',
          'Giao diện giữ đúng phong cách CellphoneS để không bị cảm giác trang trống.',
        ],
      },
    ],
  });
};
