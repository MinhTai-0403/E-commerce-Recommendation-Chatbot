import { useMemo } from 'react';
import './InfoPage.css';
import { useApiProducts } from '../../hooks/useApiProducts';
import ProductCard, { ProductCardSkeleton } from '../ProductCard/ProductCard';
import { getInfoPageContent, infoNavigationGroups } from '../../data/infoPageContent';
import {
  buildCategoryPath,
  buildInfoPageModel,
  buildSearchPath,
} from '../../utils/linkRoutes';

const supportCards = [
  {
    title: 'Cần hỗ trợ nhanh?',
    text: 'Gọi tổng đài 1800 2097 hoặc để lại yêu cầu, CellphoneS sẽ phản hồi theo luồng chăm sóc khách hàng.',
    href: 'tel:18002097',
    cta: 'Gọi 1800 2097',
  },
  {
    title: 'Theo dõi đơn hàng',
    text: 'Kiểm tra trạng thái đặt hàng, thanh toán, đóng gói, giao hàng và lịch sử xử lý đơn.',
    href: '/tra-cuu-don-hang',
    cta: 'Tra cứu đơn',
  },
  {
    title: 'Ưu đãi thành viên',
    text: 'Xem hạng Smember, điểm tích luỹ, ưu đãi sinh nhật, mã giảm giá và quyền lợi S-Student.',
    href: '/smember/uu-dai',
    cta: 'Xem Smember',
  },
];

const installmentAnchors = [
  ['installment-program', 'CHƯƠNG TRÌNH TRẢ GÓP'],
  ['installment-student', 'TRẢ GÓP SINH VIÊN'],
  ['installment-products', 'SẢN PHẨM ƯU ĐÃI'],
  ['installment-faq', 'CÂU HỎI THƯỜNG GẶP'],
];

const installmentMethods = [
  {
    icon: '💳',
    title: 'Thẻ tín dụng',
    text: 'Miễn phí chuyển đổi trả góp qua thẻ của hơn 25 ngân hàng. Không cần hồ sơ, không chờ xét duyệt.',
    href: '/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones',
  },
  {
    icon: '🏦',
    title: 'Công ty tài chính',
    text: 'Lãi suất 0% kỳ hạn đến 12 tháng cùng Home Credit, HD Saison, Shinhan Finance, Mirae Asset.',
    bullets: ['Chỉ cần CCCD', 'Trả trước từ 0đ', 'Duyệt nhanh tại cửa hàng'],
  },
  {
    icon: '📱',
    title: 'Mua trước trả sau',
    text: 'Sở hữu sản phẩm ngay với Kredivo, MoMo, Fundiin và thanh toán theo kỳ hạn trên ứng dụng.',
    bullets: ['Thủ tục online', 'Không cần hồ sơ giấy', 'Phù hợp đơn hàng công nghệ'],
  },
];

const installmentSteps = [
  ['01', 'Bước 1: Chọn sản phẩm', 'Truy cập CellphoneS và lựa chọn sản phẩm mong muốn.'],
  ['02', 'Bước 2: Chọn hình thức', 'Chọn trả góp qua thẻ tín dụng, công ty tài chính hoặc mua trước trả sau.'],
  ['03', 'Bước 3: Làm hồ sơ', 'Điền thông tin cần thiết; với công ty tài chính, nhân viên sẽ tư vấn tại cửa hàng.'],
  ['04', 'Bước 4: Nhận máy', 'Sau khi hồ sơ được duyệt, khách hàng nhận sản phẩm đã đặt.'],
];

const installmentFaqs = [
  ['Nên trả góp trong bao lâu?', 'Thời hạn nên dựa trên khả năng chi trả hàng tháng. Kỳ hạn ngắn giúp tất toán nhanh, kỳ hạn dài giảm áp lực tiền mỗi tháng.'],
  ['Có khả thi không nếu mua trả góp hai sản phẩm cùng lúc?', 'Có thể, nhưng còn phụ thuộc hạn mức, lịch sử tín dụng và điều kiện duyệt của ngân hàng hoặc công ty tài chính.'],
  ['Tại sao mua trả góp không được duyệt?', 'Một số nguyên nhân thường gặp là hồ sơ thiếu thông tin, thu nhập chưa phù hợp, lịch sử tín dụng chưa tốt hoặc hạn mức không đủ.'],
  ['Nợ xấu có mua trả góp được không?', 'Khả năng được duyệt sẽ thấp hơn. Khách hàng nên kiểm tra và tất toán khoản nợ quá hạn trước khi đăng ký khoản mới.'],
  ['Cách kiểm tra còn phải trả góp bao lâu?', 'Liên hệ đơn vị tài chính hoặc cửa hàng đã hỗ trợ hồ sơ để được kiểm tra số kỳ còn lại.'],
  ['Khách hàng là S-Student có thể sử dụng đồng thời hai khuyến mãi S-Finance và Ưu đãi sinh viên được không?', 'Khách hàng chỉ được sử dụng một trong hai chương trình theo điều kiện áp dụng tại thời điểm mua hàng.'],
];

const installmentBrandFilters = ['Tất cả', 'Apple', 'Samsung', 'Xiaomi', 'OPPO', 'TECNO', 'Honor', 'Nubia', 'Sony', 'Nokia', 'Infinix', 'Nothing', 'realme'];

const makeFooterLandingProfile = ({
  title,
  eyebrow = 'Thông tin CellphoneS',
  description,
  sourceUrl,
  tone = 'red',
  stats = [],
  tabs = [],
  highlights = [],
  sections = [],
  table = [],
  faqs = [],
  form = null,
  cta = null,
}) => ({ title, eyebrow, description, sourceUrl, tone, stats, tabs, highlights, sections, table, faqs, form, cta });

const footerLandingProfiles = {
  '/chinh-sach-giao-hang': makeFooterLandingProfile({
    title: 'Hướng dẫn mua hàng từ xa',
    description: 'Trang mô phỏng chính sách mua hàng online, thanh toán, giao hàng, phí vận chuyển, thời gian nhận hàng và xử lý hoàn tiền của CellphoneS.',
    sourceUrl: 'https://cellphones.com.vn/chinh-sach-giao-hang',
    stats: [['300k+', 'Miễn phí vận chuyển'], ['1-2h', 'Giao nhanh nội thành'], ['1800.2097', 'Tư vấn mua hàng']],
    tabs: ['Tra cứu đơn hàng', 'Thanh toán', 'Giao hàng', 'Hoàn tiền', 'Đổi mới'],
    highlights: ['Đặt hàng online qua website, tổng đài, chat hoặc cửa hàng gần nhất', 'Thanh toán COD, chuyển khoản, thẻ, ví điện tử, QR hoặc trả góp', 'Thời gian giao phụ thuộc khu vực, tồn kho và khung giờ xác nhận đơn'],
    sections: [
      { title: 'Thông tin thanh toán và giao hàng', items: ['Khách hàng chọn khu vực để xem đúng giá bán và tồn kho.', 'Đơn công ty cần thông tin xuất hóa đơn hợp lệ ngay khi đặt hàng.', 'Một số đơn giá trị cao có thể yêu cầu xác minh chủ thẻ/CCCD khi giao.'] },
      { title: 'Phí và thời gian giao hàng', items: ['Đơn từ 300.000đ được miễn phí giao hàng theo chính sách hiện hành.', 'Nội thành có thể giao nhanh 1 - 2 giờ nếu khoảng cách và tồn kho phù hợp.', 'Hàng điện máy/cồng kềnh sẽ được liên hệ xác nhận thời gian giao/lắp đặt.'] },
      { title: 'Hủy đơn và hoàn tiền', items: ['Tiền mặt có thể hoàn tại cửa hàng.', 'Chuyển khoản, thẻ và ví điện tử cần thời gian xử lý theo ngân hàng/cổng thanh toán.', 'Phụ phí, phí chuyển đổi trả góp hoặc khuyến mãi cộng thêm có thể không được hoàn lại.'] },
    ],
    faqs: [['Mua online có nhận tại cửa hàng được không?', 'Có. Khách chọn nhận tại cửa hàng khi đặt đơn và chờ xác nhận giữ hàng.'], ['Đơn dưới 300.000đ có miễn phí giao không?', 'Thông thường đơn dưới mức miễn phí sẽ có phí giao hàng theo chính sách hiện hành.']],
  }),
  '/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones': makeFooterLandingProfile({
    title: 'Hướng dẫn mua hàng trả góp qua thẻ tín dụng',
    description: 'Trang hướng dẫn trả góp bằng thẻ tín dụng tại website hoặc cửa hàng, gồm ngân hàng hỗ trợ, kỳ hạn, phí chuyển đổi và điều kiện chủ thẻ.',
    sourceUrl: 'https://cellphones.com.vn/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones',
    stats: [['3-12', 'Tháng kỳ hạn'], ['Visa/Master/JCB', 'Loại thẻ chính'], ['0%', 'Ưu đãi tùy chương trình']],
    tabs: ['Điều kiện thẻ', 'Ngân hàng', 'Trả góp 3 không', 'Cách đăng ký', 'Lưu ý'],
    highlights: ['Áp dụng cho thẻ tín dụng chính, còn hạn mức và còn hiệu lực', 'Có hình thức tại cửa hàng và qua cổng thanh toán online', 'Một số giao dịch có thể bị từ chối nếu thẻ lỗi, không chính chủ hoặc không đủ hạn mức'],
    sections: [
      { title: 'Hình thức trả góp qua thẻ', items: ['Cà thẻ và đăng ký chuyển đổi trực tiếp tại cửa hàng.', 'Thanh toán online qua cổng trả góp nếu sản phẩm/ngân hàng hỗ trợ.', 'Kỳ hạn phổ biến gồm 3, 6, 9 và 12 tháng tùy ngân hàng.'] },
      { title: 'Quy định chung', items: ['Không giới hạn số lần mua nếu thẻ còn đủ hạn mức.', 'Không hủy giao dịch sau khi giao dịch đã chuyển sang trả góp.', 'Một số đơn trả góp có thể không xuất VAT công ty theo chính sách từng thời điểm.'] },
    ],
    table: [['Thẻ áp dụng', 'Visa, Mastercard, JCB do ngân hàng tại Việt Nam phát hành'], ['Hạn mức', 'Tối thiểu bằng giá trị khoản thanh toán đăng ký'], ['Phí chuyển đổi', 'Hiển thị theo ngân hàng/kỳ hạn trước khi xác nhận']],
  }),
  '/tos?part=refund-policy': makeFooterLandingProfile({
    title: 'Chính sách đổi trả',
    description: 'Trang đổi trả mô phỏng phần refund-policy trong quy chế hoạt động của CellphoneS, tập trung vào điều kiện đổi mới, trả hàng và hoàn tiền.',
    sourceUrl: 'https://cellphones.com.vn/tos?part=refund-policy',
    stats: [['15-35 ngày', 'Mốc tham khảo'], ['IMEI/Serial', 'Cần đối chiếu'], ['CSKH', 'Hỗ trợ xử lý']],
    tabs: ['Điều kiện', 'Quy trình', 'Sản phẩm lỗi', 'Hoàn tiền'],
    highlights: ['Sản phẩm cần còn đủ phụ kiện, hộp và chứng từ theo từng nhóm hàng', 'Lỗi kỹ thuật cần được kiểm tra bởi CellphoneS hoặc trung tâm ủy quyền', 'Đơn xuất hóa đơn công ty có thể cần biên bản/điều chỉnh hóa đơn khi đổi trả'],
    sections: [
      { title: 'Điều kiện tiếp nhận', items: ['Có thông tin mua hàng hoặc tài khoản Smember liên quan.', 'Sản phẩm không bị tác động vật lý ngoài điều kiện chính sách.', 'Dữ liệu cá nhân nên được sao lưu trước khi kiểm tra/sửa chữa.'] },
      { title: 'Luồng xử lý', items: ['Gửi yêu cầu hoặc mang sản phẩm đến cửa hàng.', 'Nhân viên kiểm tra tình trạng và chính sách áp dụng.', 'Cập nhật kết quả: đổi mới, bảo hành, hoàn tiền hoặc hỗ trợ khác.'] },
    ],
  }),
  '/smember/tra-diem': makeFooterLandingProfile({
    title: 'Tra điểm Smember',
    eyebrow: 'Smember',
    description: 'Trang tra cứu điểm, hạng thành viên và lịch sử tích lũy của khách hàng Smember.',
    sourceUrl: 'https://smember.com.vn/?company_id=cellphones',
    tone: 'member',
    stats: [['S-NEW', 'Hạng mặc định'], ['S-MEM', 'Mua sắm tích lũy'], ['S-VIP', 'Khách hàng thân thiết']],
    highlights: ['Tra tổng chi tiêu tích lũy', 'Xem điểm Smember và hạng thành viên', 'Liên kết nhanh tới lịch sử mua hàng'],
    form: { title: 'Tra cứu điểm', fields: ['Số điện thoại Smember', 'Email nếu có'], button: 'Tra điểm' },
  }),
  '/uu-dai-smember': makeFooterLandingProfile({
    title: 'Ưu đãi Smember',
    eyebrow: 'Smember',
    description: 'Trang ưu đãi thành viên gồm quyền lợi theo hạng, voucher, sinh nhật, S-Student và ưu đãi dành riêng cho tài khoản đăng nhập.',
    sourceUrl: 'https://cellphones.com.vn/uu-dai-smember',
    tone: 'member',
    stats: [['S-NEW', 'Khách mới'], ['S-MEM', 'Thành viên'], ['S-VIP', 'Ưu đãi cao']],
    tabs: ['Hạng thành viên', 'Voucher', 'S-Student', 'Sinh nhật'],
    highlights: ['Ưu đãi theo hạng Smember', 'Voucher cá nhân hóa theo tài khoản', 'Ưu đãi giáo dục cho S-Student/S-Teacher'],
    sections: [
      { title: 'Nhóm quyền lợi', items: ['Giảm thêm khi mua hàng tùy sản phẩm.', 'Nhận voucher theo chiến dịch và hạng thành viên.', 'Theo dõi đơn hàng, bảo hành và hóa đơn nhanh hơn khi đăng nhập.'] },
    ],
  }),
  '/bao-hanh/tra-thong-tin-bao-hanh': makeFooterLandingProfile({
    title: 'Tra thông tin bảo hành',
    eyebrow: 'Bảo hành',
    description: 'Trang tra cứu tình trạng bảo hành bằng số điện thoại, mã đơn, IMEI hoặc Serial sản phẩm.',
    sourceUrl: 'https://smember.com.vn/warranty?company_id=cellphones',
    tone: 'blue',
    stats: [['IMEI', 'Tra máy'], ['Serial', 'Tra phụ kiện'], ['Đơn hàng', 'Đối chiếu mua hàng']],
    highlights: ['Kiểm tra hạn bảo hành', 'Tra theo thông tin đơn hàng', 'Liên hệ trung tâm bảo hành nếu cần hỗ trợ thêm'],
    form: { title: 'Tra cứu bảo hành', fields: ['Số điện thoại mua hàng', 'IMEI / Serial / Mã đơn'], button: 'Tra bảo hành' },
  }),
  '/hoa-don/tra-cuu-hoa-don-dien-tu': makeFooterLandingProfile({
    title: 'Tra cứu hóa đơn điện tử',
    eyebrow: 'Hóa đơn VAT',
    description: 'Trang tra cứu hóa đơn điện tử theo mã đơn, email và thông tin khách hàng.',
    sourceUrl: 'https://hddt.cellphones.com.vn/',
    tone: 'blue',
    stats: [['VAT', 'Hóa đơn điện tử'], ['Email', 'Nhận hóa đơn'], ['MST', 'Khách công ty']],
    highlights: ['Tìm lại hóa đơn mua hàng', 'Hỗ trợ khách cá nhân và công ty', 'Cần nhập đúng email/số điện thoại đã đặt hàng'],
    form: { title: 'Tra cứu hóa đơn', fields: ['Mã đơn hàng', 'Email nhận hóa đơn'], button: 'Tra hóa đơn' },
  }),
  '/quy-dinh-ve-hoa-don-khi-mua-hang-cellphones': makeFooterLandingProfile({
    title: 'Thông báo về hóa đơn khi mua hàng tại CellphoneS',
    eyebrow: 'Hóa đơn mua hàng',
    description: 'Trang quy định hóa đơn VAT điện tử, thời gian nhận hóa đơn, cách tìm lại hóa đơn và thông tin cần cung cấp khi mua hàng.',
    sourceUrl: 'https://cellphones.com.vn/quy-dinh-ve-hoa-don-khi-mua-hang-cellphones',
    stats: [['100%', 'Hàng hóa có hóa đơn'], ['10 năm', 'Lưu trữ theo quy định'], ['1800.2063', 'Hỗ trợ khiếu nại']],
    tabs: ['Các loại hóa đơn', 'Quy định', 'Thời gian nhận', 'Tìm lại hóa đơn', 'FAQ'],
    highlights: ['Hóa đơn điện tử được cung cấp khi mua hàng theo quy định', 'Khách công ty cần nhập đúng tên, mã số thuế, địa chỉ', 'Liên hệ tổng đài khi không nhận được hóa đơn'],
    sections: [
      { title: 'Thông tin cần có', items: ['Mã đơn hàng hoặc số điện thoại đặt hàng.', 'Email nhận hóa đơn.', 'Tên công ty, MST và địa chỉ nếu xuất hóa đơn doanh nghiệp.'] },
    ],
  }),
  '/bao-hanh/apple': makeFooterLandingProfile({
    title: 'Trung tâm bảo hành Apple chính hãng',
    eyebrow: 'Apple Authorized Service',
    description: 'Trang giới thiệu trung tâm bảo hành ủy quyền Apple và quy trình tiếp nhận sản phẩm Apple chính hãng.',
    sourceUrl: 'https://cellphones.com.vn/bao-hanh/apple',
    tone: 'dark',
    stats: [['CareS', 'Trung tâm ủy quyền'], ['iPhone/iPad/Mac', 'Thiết bị hỗ trợ'], ['Hà Nội/TP.HCM', 'Khu vực chính']],
    highlights: ['Tiếp nhận iPhone, iPad, MacBook và phụ kiện Apple', 'Kiểm tra theo quy trình hãng', 'Hướng dẫn điều kiện bảo hành trước khi tiếp nhận'],
    sections: [
      { title: 'Quy trình tiếp nhận', items: ['Kiểm tra tình trạng ngoại quan và số serial.', 'Đối chiếu điều kiện bảo hành theo hệ thống hãng.', 'Cập nhật kết quả sửa chữa/bảo hành cho khách hàng.'] },
    ],
  }),
  '/quy-dinh-ve-viec-sao-luu-du-lieu': makeFooterLandingProfile({
    title: 'Quy định về việc sao lưu dữ liệu',
    description: 'Trang nhắc khách hàng chủ động sao lưu dữ liệu trước khi sửa chữa, bảo hành, đổi trả hoặc can thiệp phần mềm.',
    sourceUrl: 'https://cellphones.com.vn/quy-dinh-ve-viec-sao-luu-du-lieu',
    stats: [['Dữ liệu cá nhân', 'Cần tự sao lưu'], ['Reset', 'Có thể phát sinh'], ['Đồng ý', 'Trước khi xử lý']],
    highlights: ['Sao lưu hình ảnh, danh bạ, tài liệu và ứng dụng', 'Một số thao tác có thể cần khôi phục cài đặt gốc', 'CellphoneS chỉ hỗ trợ kỹ thuật trong phạm vi khách hàng đồng ý'],
    sections: [{ title: 'Khuyến nghị trước khi gửi máy', items: ['Đăng xuất tài khoản cá nhân nếu cần.', 'Sao lưu dữ liệu lên iCloud, Google Drive hoặc thiết bị khác.', 'Ghi nhớ mật khẩu/mã khóa để hỗ trợ kiểm tra.'] }],
  }),
  '/chinh-sach-khui-hop-apple': makeFooterLandingProfile({
    title: 'Chính sách khui hộp sản phẩm Apple',
    description: 'Trang mô phỏng quy định kiểm tra seal, ngoại quan, kích hoạt và đổi trả riêng với sản phẩm Apple.',
    sourceUrl: 'https://cellphones.com.vn/chinh-sach-khui-hop-apple',
    stats: [['Seal', 'Kiểm tra trước'], ['Active', 'Áp chính sách riêng'], ['Apple', 'Sản phẩm đặc thù']],
    highlights: ['Kiểm tra ngoại quan, seal, hộp và phụ kiện trước khi kích hoạt', 'Sản phẩm đã kích hoạt áp dụng chính sách Apple/CellphoneS tương ứng', 'Khách nên giữ hộp và phụ kiện trong thời gian đổi trả'],
    sections: [{ title: 'Luồng khui hộp', items: ['Nhân viên hỗ trợ kiểm tra ngoại quan.', 'Khách xác nhận tình trạng trước khi kích hoạt.', 'Ghi nhận thông tin khi có bất thường về hộp/máy/phụ kiện.'] }],
  }),
  '/vat-refund': makeFooterLandingProfile({
    title: 'Tax refund at CellphoneS',
    eyebrow: 'VAT Refund in Vietnam',
    description: 'Landing page tiếng Anh mô phỏng trang hoàn thuế GTGT cho khách đủ điều kiện khi mua hàng tại CellphoneS.',
    sourceUrl: 'https://cellphones.com.vn/vat-refund',
    tone: 'blue',
    stats: [['177+', 'Stores'], ['3M+', 'Smembers'], ['VAT', 'Full invoice']],
    tabs: ['Eligibility', 'About CellphoneS', 'Ecosystem', 'How to claim'],
    highlights: ['Eligible foreign visitors or Vietnamese residing abroad may request tax refund support', 'CellphoneS provides VAT invoice for genuine products', 'Retail ecosystem includes CellphoneS, Điện Thoại Vui, CareS and SChannel'],
    sections: [{ title: 'Eligible beneficiaries', items: ['Foreigners or Vietnamese residing abroad with valid passport/immigration document.', 'Documents must be used for entry/exit in Vietnam.', 'Refund procedure depends on legal requirements and store guidance.'] }],
  }),
  '/dich-vu-khach-hang-doanh-nghiep': makeFooterLandingProfile({
    title: 'Khách hàng doanh nghiệp',
    eyebrow: 'B2B',
    description: 'Landing page cho khách hàng doanh nghiệp mua số lượng lớn, cần báo giá, hóa đơn, thiết bị công nghệ và hỗ trợ triển khai.',
    sourceUrl: 'https://cellphones.com.vn/dich-vu-khach-hang-doanh-nghiep',
    tone: 'blue',
    stats: [['B2B', 'Mua số lượng lớn'], ['VAT', 'Hỗ trợ chứng từ'], ['Dự án', 'Giao hàng linh hoạt']],
    tabs: ['Lợi ích', 'Sản phẩm', 'Quy trình', 'Liên hệ'],
    highlights: ['Báo giá theo nhu cầu doanh nghiệp', 'Tư vấn cấu hình thiết bị cho đội nhóm', 'Hỗ trợ xuất hóa đơn và giao hàng dự án'],
    sections: [{ title: 'Dịch vụ B2B', items: ['Tư vấn thiết bị cho văn phòng, trường học, doanh nghiệp.', 'Báo giá số lượng theo ngành hàng.', 'Hỗ trợ giao nhiều điểm hoặc theo lịch triển khai.'] }],
    form: { title: 'Gửi yêu cầu doanh nghiệp', fields: ['Tên công ty', 'Người liên hệ', 'Số điện thoại', 'Nhu cầu mua hàng'], button: 'Gửi yêu cầu' },
  }),
  '/danh-sach-khuyen-mai': makeFooterLandingProfile({
    title: 'Danh sách khuyến mãi',
    eyebrow: 'Ưu đãi thanh toán',
    description: 'Trang danh sách ưu đãi thanh toán theo ngân hàng, thẻ, ví điện tử, mua trước trả sau và chương trình đối tác.',
    sourceUrl: 'https://cellphones.com.vn/danh-sach-khuyen-mai',
    tone: 'promo',
    stats: [['Ngân hàng', 'Ưu đãi thẻ'], ['Ví điện tử', 'Voucher/hoàn tiền'], ['Trả sau', 'Mua trước trả sau']],
    tabs: ['Ưu đãi thanh toán', 'Ngân hàng', 'Ví điện tử', 'Mua trước trả sau'],
    highlights: ['Ưu đãi thanh toán thay đổi theo thời điểm', 'Cần kiểm tra điều kiện từng ngân hàng/ví điện tử', 'Một số mã chỉ áp dụng trên app hoặc khi thanh toán online'],
    sections: [{ title: 'Nhóm ưu đãi', items: ['Mở thẻ và nhận ưu đãi.', 'Thanh toán QR/thẻ/ví điện tử.', 'Mua trước trả sau hoặc trả góp theo kỳ hạn.'] }],
  }),
  '/tos': makeFooterLandingProfile({
    title: 'Quy chế hoạt động website',
    description: 'Trang quy chế hoạt động của website thương mại điện tử CellphoneS, gồm quy định chung, quy trình giao dịch, bảo hành, đổi trả và bảo mật.',
    sourceUrl: 'https://cellphones.com.vn/tos',
    stats: [['TMĐT', 'Quy chế website'], ['Giao dịch', 'Quy trình mua bán'], ['Bảo mật', 'Thông tin cá nhân']],
    tabs: ['Quy định chung', 'Quy trình giao dịch', 'Bảo hành', 'Đổi trả', 'Bảo mật'],
    highlights: ['Quy định quyền và trách nhiệm của khách hàng, website và đơn vị bán hàng', 'Mô tả luồng đặt hàng, xác nhận, thanh toán, giao nhận', 'Tích hợp các chính sách bảo hành, đổi trả và bảo mật'],
    sections: [{ title: 'Nội dung chính', items: ['Quy định chung khi sử dụng website.', 'Quy trình đặt hàng và xử lý giao dịch.', 'Chính sách bảo hành, đổi trả, hủy giao dịch và bảo mật dữ liệu.'] }],
  }),
  '/tos?part=privacy-policy': makeFooterLandingProfile({
    title: 'Chính sách bảo mật thông tin cá nhân',
    description: 'Trang bảo mật thông tin cá nhân mô phỏng phần privacy-policy trong quy chế hoạt động của CellphoneS.',
    sourceUrl: 'https://cellphones.com.vn/tos?part=privacy-policy',
    stats: [['Tài khoản', 'Thông tin đăng nhập'], ['Đơn hàng', 'Thông tin giao nhận'], ['CSKH', 'Dữ liệu hỗ trợ']],
    tabs: ['Thu thập', 'Mục đích', 'Lưu trữ', 'Chia sẻ', 'Quyền khách hàng'],
    highlights: ['Dữ liệu dùng để xác thực tài khoản, xử lý đơn hàng và chăm sóc khách hàng', 'Thông tin thanh toán/giao nhận cần được bảo vệ và chỉ dùng đúng mục đích', 'Khách hàng có thể yêu cầu cập nhật thông tin theo quy trình hỗ trợ'],
    sections: [{ title: 'Nhóm dữ liệu thường dùng', items: ['Thông tin tài khoản và liên hệ.', 'Thông tin đơn hàng, giao nhận, bảo hành.', 'Lịch sử tương tác hỗ trợ, đánh giá, hỏi đáp.'] }],
  }),
  '/chinh-sach-bao-hanh': makeFooterLandingProfile({
    title: 'Chính sách bảo hành và đổi trả sản phẩm',
    eyebrow: 'Bảo hành',
    description: 'Trang chính sách bảo hành, đổi trả sản phẩm tại CellphoneS với nhóm bảo hành hãng, 1 đổi 1, sửa chữa và hỗ trợ sau bán hàng.',
    sourceUrl: 'https://cellphones.com.vn/chinh-sach-bao-hanh',
    tone: 'blue',
    stats: [['Bảo hành hãng', 'Theo thương hiệu'], ['1 đổi 1', 'Theo điều kiện'], ['CSKH', 'Hỗ trợ sau bán']],
    tabs: ['Bảo hành', 'Đổi trả', 'Sửa chữa', 'FAQ'],
    highlights: ['Chính sách bảo hành phụ thuộc từng sản phẩm và thương hiệu', 'Khách hàng cần thông tin mua hàng/IMEI/Serial khi gửi bảo hành', 'Một số sản phẩm có chính sách đổi mới riêng trong thời gian đầu'],
    sections: [{ title: 'Quy trình bảo hành', items: ['Tiếp nhận sản phẩm và thông tin mua hàng.', 'Kiểm tra điều kiện bảo hành/đổi trả.', 'Cập nhật phương án xử lý cho khách hàng.'] }],
  }),
  '/lien-he-hop-tac': makeFooterLandingProfile({
    title: 'Liên hệ hợp tác cùng CellphoneS',
    eyebrow: 'Hợp tác kinh doanh',
    description: 'Trang tiếp nhận hợp tác kinh doanh, cung ứng, truyền thông, dịch vụ và đối tác triển khai.',
    sourceUrl: 'https://cellphones.com.vn/lien-he-hop-tac',
    stats: [['Supplier', 'Nhà cung cấp'], ['Media', 'Truyền thông'], ['Service', 'Dịch vụ']],
    highlights: ['Tiếp nhận thông tin nhà cung cấp sản phẩm/dịch vụ', 'Hỗ trợ đề xuất hợp tác truyền thông hoặc chiến dịch thương mại', 'Phân loại yêu cầu để chuyển đúng bộ phận phụ trách'],
    form: { title: 'Thông tin hợp tác', fields: ['Tên đơn vị', 'Email liên hệ', 'Số điện thoại', 'Nội dung hợp tác'], button: 'Gửi thông tin' },
  }),
  '/tuyen-dung': makeFooterLandingProfile({
    title: 'Tuyển dụng CellphoneS',
    eyebrow: 'Careers',
    description: 'Trang tuyển dụng local cho các vị trí bán hàng, kỹ thuật, vận hành, marketing và công nghệ.',
    sourceUrl: 'https://tuyendung.cellphones.com.vn/',
    tone: 'promo',
    stats: [['Retail', 'Bán hàng'], ['Tech', 'Kỹ thuật'], ['Back office', 'Vận hành']],
    highlights: ['Ứng tuyển vị trí cửa hàng và văn phòng', 'Nộp thông tin liên hệ nhanh', 'Theo dõi vị trí mới trên trang tuyển dụng gốc'],
    form: { title: 'Ứng tuyển nhanh', fields: ['Họ và tên', 'Số điện thoại', 'Email', 'Vị trí quan tâm'], button: 'Gửi hồ sơ' },
  }),
  '/bieu-phi-bao-hanh-mo-rong': makeFooterLandingProfile({
    title: 'Dịch vụ bảo hành mở rộng',
    eyebrow: 'Gói bảo vệ toàn diện',
    description: 'Trang dịch vụ bảo hành mở rộng, bảo vệ rơi vỡ, vào nước, gia hạn bảo hành và hỗ trợ sửa chữa theo gói.',
    sourceUrl: 'https://cellphones.com.vn/bieu-phi-bao-hanh-mo-rong',
    tone: 'blue',
    stats: [['Gia hạn', 'Kéo dài bảo hành'], ['Rơi vỡ', 'Hỗ trợ sửa chữa'], ['Gói bảo vệ', 'Theo sản phẩm']],
    tabs: ['Điện thoại', 'Laptop', 'Tablet', 'Đồng hồ', 'Phụ kiện'],
    highlights: ['Gói dịch vụ tùy theo ngành hàng và giá trị sản phẩm', 'Quyền lợi, phí và điều kiện được hiển thị trước khi mua', 'Khách nên đọc kỹ phạm vi bảo vệ và trường hợp loại trừ'],
    table: [['Gia hạn bảo hành', 'Kéo dài thời gian bảo hành theo gói'], ['Rơi vỡ/vào nước', 'Hỗ trợ chi phí sửa chữa theo điều kiện'], ['Bảo vệ màn hình', 'Áp dụng cho một số nhóm điện thoại/tablet']],
  }),
};

footerLandingProfiles['/chinh-sach/mua-hang-va-thanh-toan-online'] = footerLandingProfiles['/chinh-sach-giao-hang'];
footerLandingProfiles['/chinh-sach/mua-hang-tra-gop-bang-the-tin-dung'] = footerLandingProfiles['/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones'];
footerLandingProfiles['/chinh-sach/chinh-sach-doi-tra'] = footerLandingProfiles['/tos?part=refund-policy'];
footerLandingProfiles['/chinh-sach-bao-mat'] = footerLandingProfiles['/tos?part=privacy-policy'];
footerLandingProfiles['/chinh-sach/chinh-sach-bao-mat-thong-tin-ca-nhan'] = footerLandingProfiles['/tos?part=privacy-policy'];
footerLandingProfiles['/chinh-sach/chinh-sach-bao-hanh'] = footerLandingProfiles['/chinh-sach-bao-hanh'];
footerLandingProfiles['/chinh-sach/quy-che-hoat-dong'] = footerLandingProfiles['/tos'];
footerLandingProfiles['/dich-vu/khach-hang-doanh-nghiep-b2b'] = footerLandingProfiles['/dich-vu-khach-hang-doanh-nghiep'];

const getFooterLandingKey = (page) => {
  const part = page.params?.get?.('part') || '';
  return part ? `${page.path}?part=${part}` : page.path;
};

const knownPhoneBrands = {
  apple: 'apple',
  iphone: 'apple',
  samsung: 'samsung',
  xiaomi: 'xiaomi',
  redmi: 'xiaomi',
  poco: 'xiaomi',
  oppo: 'oppo',
  realme: 'oppo',
  oneplus: 'oppo',
  honor: 'honor',
  tecno: 'tecno',
  nubia: 'nubia',
  sony: 'sony',
  nokia: 'nokia',
  nothing: 'nothing',
  masstel: 'masstel',
  itel: 'itel',
  huawei: 'huawei',
  meizu: 'meizu',
  infinix: 'infinix',
};

const iPhoneSeries = [
  { label: 'IPHONE 17 SERIES', q: 'iPhone 17' },
  { label: 'IPHONE AIR', q: 'iPhone Air' },
  { label: 'IPHONE 16 SERIES', q: 'iPhone 16' },
  { label: 'IPHONE 15 SERIES', q: 'iPhone 15' },
  { label: 'IPHONE 14 SERIES', q: 'iPhone 14' },
  { label: 'IPHONE 13 SERIES', q: 'iPhone 13' },
];

const categoryCriteria = [
  { id: 'all', label: 'Bộ lọc', icon: 'filter' },
  { id: 'in-stock', label: 'Sẵn hàng', icon: 'truck', filter: 'in-stock', inStock: true },
  { id: 'new', label: 'Hàng mới về', icon: 'new', filter: 'new', sort: 'latest' },
  { id: 'price', label: 'Xem theo giá', icon: 'price', filter: 'price', sort: 'price_asc' },
  { id: 'storage', label: 'Bộ nhớ trong', icon: 'storage', facet: 'storage' },
  { id: 'ram', label: 'Dung lượng RAM', icon: 'ram', facet: 'ram' },
  { id: 'screen-size', label: 'Kích thước màn hình', icon: 'screenSize', facet: 'screen-size' },
  { id: 'usage', label: 'Nhu cầu sử dụng', icon: 'usage', facet: 'usage' },
  { id: 'display', label: 'Kiểu màn hình', icon: 'display', facet: 'display' },
  { id: 'camera', label: 'Tính năng camera', icon: 'camera', facet: 'camera' },
  { id: 'refresh-rate', label: 'Tần số quét', icon: 'refresh', facet: 'refresh-rate' },
  { id: 'special', label: 'Tính năng đặc biệt', icon: 'special', facet: 'special' },
];

const sortOptions = [
  { label: 'Phổ biến', sort: 'latest', icon: 'popular' },
  { label: 'Khuyến mãi HOT', sort: 'hot_deal', icon: 'hot', filter: 'hot-deal' },
  { label: 'Giá Thấp - Cao', sort: 'price_asc', icon: 'priceLow' },
  { label: 'Giá Cao - Thấp', sort: 'price_desc', icon: 'priceHigh' },
];

const normalizeLabel = (value = '') => (
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
);

const getBrandFromText = (value = '') => {
  const key = normalizeLabel(value).replace(/[^a-z0-9]+/g, ' ').trim();
  const words = key.split(/\s+/).filter(Boolean);
  const direct = words.find((word) => knownPhoneBrands[word]);
  if (direct) return knownPhoneBrands[direct];

  const joined = words.join(' ');
  if (joined.includes('iphone') || joined.includes('apple')) return 'apple';
  if (joined.includes('galaxy') || joined.includes('samsung')) return 'samsung';
  if (joined.includes('redmi') || joined.includes('poco') || joined.includes('xiaomi')) return 'xiaomi';
  return '';
};

const getApiCategory = (page) => {
  const category = page.category || '';
  const key = normalizeLabel(category);
  if (key.includes('dien thoai')) return 'Điện thoại';
  if (key.includes('tablet') || key.includes('may tinh bang')) return 'Máy tính bảng';
  if (!page.categoryParam && getBrandFromText(page.title || page.keyword || page.slug)) return 'Điện thoại';
  return category;
};

const getOverrideValue = (overrides, page, key) => (
  Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : page[key]
);

const buildCategoryControlPath = (page, overrides = {}) => {
  const category = overrides.category || getApiCategory(page) || page.keyword || 'Sản phẩm';
  const inferredBrand = page.brand || (page.root === 'category'
    ? getBrandFromText(page.keyword || page.title || page.slug)
    : '');
  return buildCategoryPath(category, {
    brand: Object.prototype.hasOwnProperty.call(overrides, 'brand')
      ? overrides.brand
      : inferredBrand,
    q: getOverrideValue(overrides, page, 'q'),
    keyword: getOverrideValue(overrides, page, 'keyword'),
    segment: getOverrideValue(overrides, page, 'segment'),
    sort: getOverrideValue(overrides, page, 'sort'),
    title: getOverrideValue(overrides, page, 'title'),
    filter: getOverrideValue(overrides, page, 'filter'),
    facet: getOverrideValue(overrides, page, 'facet'),
    inStock: getOverrideValue(overrides, page, 'inStock'),
    priceMin: getOverrideValue(overrides, page, 'priceMin'),
    priceMax: getOverrideValue(overrides, page, 'priceMax'),
  });
};

function ChipIcon({ name }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
  };

  switch (name) {
    case 'filter':
      return (
        <svg {...common}>
          <path d="M4 5h16" />
          <path d="M7 12h10" />
          <path d="M10 19h4" />
        </svg>
      );
    case 'truck':
      return (
        <svg {...common}>
          <path d="M3 7h11v10H3z" />
          <path d="M14 10h4l3 3v4h-7z" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
        </svg>
      );
    case 'new':
      return (
        <svg {...common}>
          <path d="M12 3v18" />
          <path d="m17 8-5-5-5 5" />
          <path d="M5 21h14" />
        </svg>
      );
    case 'price':
      return (
        <svg {...common}>
          <path d="M12 2v20" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case 'storage':
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 7h6M9 11h6M9 15h3" />
        </svg>
      );
    case 'ram':
      return (
        <svg {...common}>
          <rect x="4" y="7" width="16" height="10" rx="2" />
          <path d="M8 3v4M12 3v4M16 3v4M8 17v4M12 17v4M16 17v4" />
        </svg>
      );
    case 'screenSize':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case 'usage':
      return (
        <svg {...common}>
          <path d="M12 3 4 7v6c0 5 3.5 7.5 8 8 4.5-.5 8-3 8-8V7z" />
          <path d="m9 12 2 2 4-5" />
        </svg>
      );
    case 'display':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="12" rx="2" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      );
    case 'camera':
      return (
        <svg {...common}>
          <path d="M6 7h3l1.5-2h3L15 7h3a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" />
          <path d="M4 4v4h4" />
          <path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" />
          <path d="M20 20v-4h-4" />
        </svg>
      );
    case 'special':
      return (
        <svg {...common}>
          <path d="m12 3 2.4 5 5.6.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.6-.8z" />
        </svg>
      );
    case 'hot':
      return (
        <svg {...common}>
          <path d="M12 21c4 0 7-2.7 7-6.6 0-2.3-1-4.2-3-5.9.2 2.5-1.3 3.4-1.3 3.4C15 8.4 12.4 5.5 9.7 3 10 7.1 5 8.7 5 14.4 5 18.3 8 21 12 21z" />
        </svg>
      );
    case 'priceLow':
      return (
        <svg {...common}>
          <path d="M6 6h12M6 12h9M6 18h6" />
          <path d="m18 14-3 3-3-3" />
        </svg>
      );
    case 'priceHigh':
      return (
        <svg {...common}>
          <path d="M6 6h6M6 12h9M6 18h12" />
          <path d="m15 10 3-3 3 3" />
        </svg>
      );
    case 'popular':
    default:
      return (
        <svg {...common}>
          <path d="m12 3 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7z" />
        </svg>
      );
  }
}

function InfoForm({ form }) {
  if (!form) return null;

  return (
    <form className="info-local-form" onSubmit={(event) => event.preventDefault()}>
      <h3>{form.title}</h3>
      {form.fields.map((field) => (
        <label key={field.label}>
          <span>{field.label}</span>
          {field.textarea ? (
            <textarea placeholder={field.placeholder} rows={4} />
          ) : (
            <input placeholder={field.placeholder} />
          )}
        </label>
      ))}
      {form.helper && <p>{form.helper}</p>}
      <button type="submit">{form.button || 'Gửi thông tin'}</button>
    </form>
  );
}

function InfoSection({ section }) {
  return (
    <section className="info-section-card">
      <h2>{section.title}</h2>
      {section.body && <p>{section.body}</p>}

      {section.bullets && (
        <ul className="info-bullet-list">
          {section.bullets.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}

      {section.steps && (
        <ol className="info-step-list">
          {section.steps.map((item, index) => (
            <li key={item}>
              <span>{index + 1}</span>
              <p>{item}</p>
            </li>
          ))}
        </ol>
      )}

      {section.cards && (
        <div className="info-mini-card-grid">
          {section.cards.map((card) => (
            <article className="info-mini-card" key={card.title}>
              <strong>{card.title}</strong>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
      )}

      {section.table && (
        <div className="info-table-wrap">
          <table className="info-table">
            <tbody>
              {section.table.map(([label, value]) => (
                <tr key={label}>
                  <th>{label}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function InfoContent({ page }) {
  const content = getInfoPageContent(page);
  const currentPart = page.params?.get?.('part') || '';
  const currentHref = currentPart ? `${page.path}?part=${currentPart}` : page.path;

  return (
    <div className="info-clone-layout">
      <aside className="info-clone-sidebar" aria-label="Menu nội dung footer">
        {infoNavigationGroups.map((group) => (
          <nav key={group.title}>
            <h2>{group.title}</h2>
            {group.links.map(([label, href]) => (
              <a className={href === currentHref || href === page.path ? 'active' : ''} href={href} key={href}>{label}</a>
            ))}
          </nav>
        ))}
      </aside>

      <main className="info-clone-main">
        <article className={`info-clone-hero info-clone-hero-${content.tone || 'red'}`}>
          <div>
            <span>{content.eyebrow || page.eyebrow}</span>
            <h2>{content.title || page.title}</h2>
            <p>{content.description || page.description}</p>
            {content.badges?.length > 0 && (
              <div className="info-route-badges">
                {content.badges.map((badge) => <em key={badge}>{badge}</em>)}
              </div>
            )}

          </div>
          <div className="info-clone-badge" aria-hidden="true">S</div>
        </article>

        {content.stats?.length > 0 && (
          <div className="info-kpi-grid">
            {content.stats.map((stat) => (
              <div className="info-kpi-card" key={`${stat.value}-${stat.label}`}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        )}

        {content.sections?.map((section) => <InfoSection section={section} key={section.title} />)}

        <InfoForm form={content.form} />

        {content.faq?.length > 0 && (
          <section className="info-section-card">
            <h2>Câu hỏi thường gặp</h2>
            <div className="info-faq-list">
              {content.faq.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}
      </main>

      <aside className="info-clone-sidecards" aria-label="Hỗ trợ nhanh">
        {(content.sideCards || supportCards).map((card) => (
          <a href={card.href} className="info-side-card" key={card.title}>
            <strong>{card.title}</strong>
            <p>{card.text}</p>
            <span>{card.cta || 'Xem thêm'} ›</span>
          </a>
        ))}
      </aside>
    </div>
  );
}

function FooterLandingPage({ page, profile }) {
  const currentPart = page.params?.get?.('part') || '';
  const currentHref = currentPart ? `${page.path}?part=${currentPart}` : page.path;

  return (
    <section className={`footer-landing-page footer-landing-${profile.tone || 'red'}`}>
      <div className="container footer-landing-container">
        <nav className="footer-landing-breadcrumb" aria-label="Breadcrumb">
          <a href="/">Trang chủ</a>
          <span>/</span>
          <strong>{profile.title}</strong>
        </nav>

        <article className="footer-landing-hero">
          <div>
            <span>{profile.eyebrow}</span>
            <h1>{profile.title}</h1>
            <p>{profile.description}</p>
            <div className="footer-landing-actions">
              <a href="tel:18002097">Gọi 1800.2097</a>
            </div>
          </div>
          <div className="footer-landing-brand-card" aria-hidden="true">
            <strong>cellphone</strong>
            <span>S</span>
          </div>
        </article>

        {profile.tabs?.length > 0 && (
          <div className="footer-landing-tabs" aria-label="Mục nội dung">
            {profile.tabs.map((tab, index) => <a href={`#footer-section-${index + 1}`} key={tab}>{tab}</a>)}
          </div>
        )}

        <div className="footer-landing-layout">
          <main className="footer-landing-main">
            {profile.stats?.length > 0 && (
              <div className="footer-landing-stats">
                {profile.stats.map(([value, label]) => (
                  <div key={`${value}-${label}`}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}

            {profile.highlights?.length > 0 && (
              <section className="footer-landing-card">
                <h2>Thông tin nổi bật</h2>
                <ul className="footer-landing-checks">
                  {profile.highlights.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            )}

            {profile.sections?.map((section, sectionIndex) => (
              <section className="footer-landing-card" key={section.title} id={`footer-section-${sectionIndex + 1}`}>
                <h2>{section.title}</h2>
                <div className="footer-landing-step-list">
                  {(section.items || []).map((item, index) => (
                    <div key={item}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {profile.table?.length > 0 && (
              <section className="footer-landing-card">
                <h2>Bảng thông tin tham khảo</h2>
                <div className="footer-landing-table-wrap">
                  <table className="footer-landing-table">
                    <tbody>
                      {profile.table.map(([label, value]) => (
                        <tr key={label}>
                          <th>{label}</th>
                          <td>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {profile.form && (
              <section className="footer-landing-card footer-landing-form-card">
                <h2>{profile.form.title}</h2>
                <form onSubmit={(event) => event.preventDefault()}>
                  {profile.form.fields.map((field) => (
                    <label key={field}>
                      <span>{field}</span>
                      <input placeholder={field} />
                    </label>
                  ))}
                  <button type="submit">{profile.form.button || 'Gửi thông tin'}</button>
                </form>
              </section>
            )}

            {profile.faqs?.length > 0 && (
              <section className="footer-landing-card">
                <h2>Câu hỏi thường gặp</h2>
                <div className="footer-landing-faqs">
                  {profile.faqs.map(([question, answer]) => (
                    <details key={question}>
                      <summary>{question}</summary>
                      <p>{answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </main>

          <aside className="footer-landing-side">
            <section>
              <h2>Danh mục</h2>
              {infoNavigationGroups.map((group) => (
                <nav key={group.title}>
                  <strong>{group.title}</strong>
                  {group.links.map(([label, href]) => (
                    <a className={href === currentHref || href === page.path ? 'active' : ''} href={href} key={href}>{label}</a>
                  ))}
                </nav>
              ))}
            </section>

            <section>
              <h2>Hỗ trợ nhanh</h2>
              <a href="tel:18002097">Mua hàng - bảo hành: 1800.2097</a>
              <a href="tel:18002063">Khiếu nại: 1800.2063</a>
              <a href="/tra-cuu-don-hang">Tra cứu đơn hàng</a>
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}

function InstallmentLandingPage() {
  const { products, loading } = useApiProducts({
    category: 'Điện thoại',
    include: 'details',
    displayLimit: 10,
    fetchLimit: 60,
    sort: 'hot_deal',
    inStock: true,
  }, []);

  return (
    <section className="installment-clone-page">
      <nav className="installment-sticky-tabs" aria-label="Menu trả góp">
        <div className="container installment-sticky-tabs-inner">
          {installmentAnchors.map(([id, label]) => (
            <a href={`#${id}`} key={id}>{label}</a>
          ))}
        </div>
      </nav>

      <div className="container installment-container">
        <header className="installment-title-row">
          <h1>Mua điện thoại trả góp 0% - 0 trả trước - 0 phí tại CellphoneS</h1>
        </header>

        <div className="installment-hero-grid" id="installment-program">
          <div className="installment-hero-left">
            <blockquote>
              Trả góp là phương thức mua sắm giúp chia nhỏ khoản thanh toán theo kỳ hạn, giảm áp lực tài chính khi mua sản phẩm công nghệ.
            </blockquote>
            <img
              src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/i-headbanner01.jpg"
              alt="Trả góp 3 không tại CellphoneS"
              loading="lazy"
            />
          </div>

          <aside className="installment-faq-card" id="installment-faq">
            <h2>Câu hỏi thường gặp</h2>
            <div className="installment-faq-list">
              {installmentFaqs.map(([question, answer], index) => (
                <details key={question} open={index === 0}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </aside>
        </div>

        <section className="installment-section">
          <h2>Các hình thức trả góp đa dạng</h2>
          <div className="installment-method-grid">
            {installmentMethods.map((method) => (
              <article className="installment-method-card" key={method.title}>
                <span className="installment-method-icon">{method.icon}</span>
                <h3>{method.title}</h3>
                <p>{method.text}</p>
                {method.bullets?.length > 0 && (
                  <ul>
                    {method.bullets.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
                {method.href && <a href={method.href}>Xem chi tiết</a>}
              </article>
            ))}
          </div>
        </section>

        <section className="installment-section">
          <h2>Quy trình mua trả góp tại CellphoneS</h2>
          <div className="installment-process-grid">
            {installmentSteps.map(([number, title, text]) => (
              <article className="installment-process-card" key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="installment-student-card" id="installment-student">
          <div>
            <span>Đăng ký S-Student</span>
            <h2>Chương trình Trả góp Sinh viên</h2>
            <p>Ưu đãi dành cho khách hàng sinh viên khi mua sắm sản phẩm công nghệ tại CellphoneS.</p>
            <a href="/uu-dai-smember">Xem chi tiết ưu đãi</a>
          </div>
          <img
            src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/tra-gop/s-finacing-30-d.jpg"
            alt="Chương trình trả góp sinh viên"
            loading="lazy"
          />
        </section>

        <section className="installment-products" id="installment-products">
          <div className="installment-product-head">
            <h2>Sản phẩm ưu đãi trả góp</h2>
            <a href="/category/dien-thoai?keyword=Điện thoại&category=Điện thoại&sort=hot_deal">Xem tất cả</a>
          </div>

          <div className="installment-category-tabs">
            {['Điện thoại', 'Laptop', 'Máy tính bảng', 'Tivi', 'Hàng cũ'].map((item, index) => (
              <button type="button" className={index === 0 ? 'active' : ''} key={item}>{item}</button>
            ))}
          </div>

          <div className="installment-brand-row">
            {installmentBrandFilters.map((brand, index) => (
              <button type="button" className={index === 0 ? 'active' : ''} key={brand}>{brand}</button>
            ))}
          </div>

          <div className="installment-sort-row">
            <strong>Sắp xếp theo:</strong>
            {['Phổ biến', 'Khuyến mãi HOT', 'Giá Thấp - Cao', 'Giá Cao - Thấp'].map((item, index) => (
              <button type="button" className={index === 0 ? 'active' : ''} key={item}>{item}</button>
            ))}
          </div>

          <div className="installment-product-grid" aria-busy={loading}>
            {loading ? (
              Array.from({ length: 10 }).map((_, index) => <ProductCardSkeleton key={`installment-skeleton-${index}`} />)
            ) : products.length ? (
              products.map((product) => <ProductCard product={product} key={product.id || product.slug || product.name} />)
            ) : (
              <div className="info-empty-result">Chưa có sản phẩm ưu đãi trả góp phù hợp.</div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function ListingContent({ page }) {
  const apiCategory = getApiCategory(page);
  const isCategoryPage = page.root === 'category';
  const brandFromText = getBrandFromText(page.brand || page.keyword || page.title || page.slug);
  const effectiveBrand = page.brand || (isCategoryPage ? brandFromText : '');
  const activeFilter = page.facet || page.filter || (page.inStock === 'true' ? 'in-stock' : 'all');
  const isIphonePage = isCategoryPage && (
    effectiveBrand === 'apple' ||
    normalizeLabel(page.title).includes('iphone') ||
    normalizeLabel(page.keyword).includes('iphone')
  );

  const query = useMemo(() => {
    const nextQuery = {
      include: 'details',
      displayLimit: 30,
      fetchLimit: 90,
      sort: page.sort || 'latest',
      inStock: page.inStock || true,
    };

    if (isCategoryPage && apiCategory) nextQuery.category = apiCategory;
    if (isCategoryPage && effectiveBrand) nextQuery.brand = effectiveBrand;
    if (page.q) nextQuery.q = page.q;
    if (!isCategoryPage && page.keyword) nextQuery.q = page.keyword;
    if (page.segment) nextQuery.segment = page.segment;
    if (page.filter) nextQuery.filter = page.filter;
    if (page.facet) nextQuery.facet = page.facet;
    if (page.priceMin) nextQuery.priceMin = page.priceMin;
    if (page.priceMax) nextQuery.priceMax = page.priceMax;

    return nextQuery;
  }, [
    apiCategory,
    effectiveBrand,
    isCategoryPage,
    page.facet,
    page.filter,
    page.inStock,
    page.keyword,
    page.priceMax,
    page.priceMin,
    page.q,
    page.segment,
    page.sort,
  ]);
  const { products, loading } = useApiProducts(query, []);

  return (
    <section className={`info-listing-panel ${isCategoryPage ? 'category-listing-panel' : ''}`}>
      {isCategoryPage && (
        <div className="category-listing-controls">
          {isIphonePage && (
            <>
              <div className="category-series-pills" aria-label="Dòng iPhone">
                {iPhoneSeries.map((item) => (
                  <a
                    href={buildCategoryControlPath(page, {
                      category: 'Điện thoại',
                      brand: 'apple',
                      q: item.q,
                      keyword: item.label,
                      title: 'iPhone',
                      filter: '',
                      facet: '',
                    })}
                    className="category-series-pill"
                    key={item.label}
                  >
                    {item.label}
                  </a>
                ))}
              </div>

              <div className="category-voucher-card">
                <strong>Ưu đãi & voucher</strong>
                <div className="category-voucher-ticket">
                  <span>Giảm 5%</span>
                  <p>Voucher 5% tối đa 500k cho sản phẩm có hiển thị.</p>
                  <button type="button">Thu thập</button>
                </div>
              </div>
            </>
          )}

          <div className="category-filter-row" aria-label="Chọn theo tiêu chí">
            <h2>Chọn theo tiêu chí</h2>
            <div className="category-filter-chips">
              {categoryCriteria.map((item) => {
                const isActive = item.id === 'all'
                  ? activeFilter === 'all'
                  : activeFilter === (item.facet || item.filter || item.id);
                const href = item.id === 'all'
                  ? buildCategoryControlPath(page, {
                    filter: '',
                    facet: '',
                    inStock: '',
                    priceMin: '',
                    priceMax: '',
                    q: '',
                    sort: 'latest',
                  })
                  : buildCategoryControlPath(page, {
                    filter: item.filter || item.id,
                    facet: item.facet || '',
                    inStock: item.inStock ? 'true' : page.inStock,
                    sort: item.sort || page.sort || 'latest',
                    q: page.q,
                  });

                return (
                  <a
                    href={href}
                    className={isActive ? 'active' : ''}
                    key={item.id}
                  >
                    <span className="category-chip-icon"><ChipIcon name={item.icon} /></span>
                    {item.label}
                    {item.facet && <span className="category-chip-caret">⌄</span>}
                  </a>
                );
              })}
            </div>
          </div>

          <div className="category-sort-row" aria-label="Sắp xếp theo">
            <h2>Sắp xếp theo</h2>
            <div className="category-sort-chips">
              {sortOptions.map((item) => {
                const isActive = page.sort === item.sort || (!page.sort && item.sort === 'latest');
                return (
                  <a
                    href={buildCategoryControlPath(page, {
                      sort: item.sort,
                      filter: item.filter || page.filter,
                    })}
                    className={isActive ? 'active' : ''}
                    key={item.label}
                  >
                    <span className="category-chip-icon"><ChipIcon name={item.icon} /></span>
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="info-listing-head">
        <h2>{isCategoryPage ? 'Danh sách sản phẩm' : 'Sản phẩm phù hợp'}</h2>
        <a href={isCategoryPage ? buildCategoryControlPath(page, {
          filter: '',
          facet: '',
          q: '',
          sort: 'latest',
        }) : buildSearchPath(page.keyword)}>
          Làm mới kết quả
        </a>
      </div>

      <div className="info-product-grid" aria-busy={loading}>
        {loading ? (
          Array.from({ length: 8 }).map((_, index) => (
            <ProductCardSkeleton key={`info-skeleton-${index}`} />
          ))
        ) : products.length ? (
          products.map((product) => <ProductCard product={product} key={product.id || product.slug || product.name} />)
        ) : (
          <div className="info-empty-result">
            Chưa có sản phẩm khớp chính xác. Bạn có thể thử từ khóa khác hoặc quay lại trang chủ.
          </div>
        )}
      </div>
    </section>
  );
}

export default function InfoPage({ pathname = window.location.pathname, search = window.location.search, onGoHome }) {
  const page = useMemo(() => buildInfoPageModel(pathname, search), [pathname, search]);
  const footerLandingKey = getFooterLandingKey(page);
  const footerLandingProfile = footerLandingProfiles[footerLandingKey];

  if (page.path === '/tra-gop') {
    return <InstallmentLandingPage />;
  }

  if (footerLandingProfile) {
    return <FooterLandingPage page={page} profile={footerLandingProfile} />;
  }

  return (
    <section className="info-page">
      <div className="container">
        <nav className="info-breadcrumb" aria-label="Breadcrumb">
          <a href="/" onClick={(event) => {
            if (!onGoHome) return;
            event.preventDefault();
            onGoHome();
          }}>
            Trang chủ
          </a>
          <span>/</span>
          <strong>{page.title}</strong>
        </nav>

        <header className={`info-hero-card ${page.root === 'category' ? 'category-title-card' : ''}`}>
          {page.root !== 'category' && <span>{page.eyebrow}</span>}
          <h1>{page.title}</h1>
          {page.root !== 'category' && <p>{page.description}</p>}
        </header>

        {page.isListing ? <ListingContent page={page} /> : <InfoContent page={page} />}

        <div className="info-support-grid">
          {supportCards.map((card) => (
            <a href={card.href} className="info-support-card" key={card.title}>
              <strong>{card.title}</strong>
              <p>{card.text}</p>
              <span>{card.cta} ›</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
