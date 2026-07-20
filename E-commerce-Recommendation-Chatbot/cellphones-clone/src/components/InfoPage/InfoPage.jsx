import { useMemo, useState } from "react";
import "./InfoPage.css";
import "./LaptopLanding.css";
import "./LaptopAiLanding.css";
import "./AudioLanding.css";
import { useApiProducts } from "../../hooks/useApiProducts";
import ProductCard, { ProductCardSkeleton } from "../ProductCard/ProductCard";
import PhoneWeekendSale from "../PhoneWeekendSale/PhoneWeekendSale";
import {
  getInfoPageContent,
  infoNavigationGroups,
} from "../../data/infoPageContent";
import { techNews } from "../../data/mockData";
import {
  LAPTOP_BRANDS,
  PHONE_BRANDS,
  TABLET_BRANDS,
} from "../HeroSection/brandData";
import { SafeBrandImage } from "../HeroSection/BrandLogos";
import {
  buildCategoryPath,
  buildInfoPageModel,
  buildSearchPath,
} from "../../utils/linkRoutes";
import {
  LaptopAiFeatureSections,
  LaptopAiLandingIntro,
} from "./LaptopAiLanding";
import CategoryBannerCarousel from "./CategoryBannerCarousel";
import LaptopCategoryIntro from "./LaptopLanding";
import ComputerCategoryIntro from "./ComputerCategoryIntro";
import {
  getLaptopBrandFromText,
  laptopBrandLandingProfiles,
  laptopBrandOrder,
  laptopBrandRoutes,
  laptopCategoryBannerTracks,
  laptopCategoryBanners,
  laptopNeedLandingProfiles,
} from "./laptopLandingData";
import { AudioLandingIntro } from "./AudioLanding";
import { getAudioLandingProfile } from "./audioLandingData";
import {
  audioFilterGroups,
  getAudioCategoryCriteriaForProfile,
} from "./audioLandingData";

const supportCards = [
  {
    title: "Cần hỗ trợ nhanh?",
    text: "Gọi tổng đài 1800 2097 hoặc để lại yêu cầu, CellphoneS sẽ phản hồi theo luồng chăm sóc khách hàng.",
    href: "tel:18002097",
    cta: "Gọi 1800 2097",
  },
  {
    title: "Theo dõi đơn hàng",
    text: "Kiểm tra trạng thái đặt hàng, thanh toán, đóng gói, giao hàng và lịch sử xử lý đơn.",
    href: "/tra-cuu-don-hang",
    cta: "Tra cứu đơn",
  },
  {
    title: "Ưu đãi thành viên",
    text: "Xem hạng Smember, điểm tích luỹ, ưu đãi sinh nhật, mã giảm giá và quyền lợi S-Student.",
    href: "/smember/uu-dai",
    cta: "Xem Smember",
  },
];

const installmentAnchors = [
  ["installment-program", "CHƯƠNG TRÌNH TRẢ GÓP"],
  ["installment-student", "TRẢ GÓP SINH VIÊN"],
  ["installment-products", "SẢN PHẨM ƯU ĐÃI"],
  ["installment-faq", "CÂU HỎI THƯỜNG GẶP"],
];

const installmentMethods = [
  {
    icon: "💳",
    title: "Thẻ tín dụng",
    text: "Miễn phí chuyển đổi trả góp qua thẻ của hơn 25 ngân hàng. Không cần hồ sơ, không chờ xét duyệt.",
    href: "/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones",
  },
  {
    icon: "🏦",
    title: "Công ty tài chính",
    text: "Lãi suất 0% kỳ hạn đến 12 tháng cùng Home Credit, HD Saison, Shinhan Finance, Mirae Asset.",
    bullets: ["Chỉ cần CCCD", "Trả trước từ 0đ", "Duyệt nhanh tại cửa hàng"],
  },
  {
    icon: "📱",
    title: "Mua trước trả sau",
    text: "Sở hữu sản phẩm ngay với Kredivo, MoMo, Fundiin và thanh toán theo kỳ hạn trên ứng dụng.",
    bullets: [
      "Thủ tục online",
      "Không cần hồ sơ giấy",
      "Phù hợp đơn hàng công nghệ",
    ],
  },
];

const installmentSteps = [
  [
    "01",
    "Bước 1: Chọn sản phẩm",
    "Truy cập CellphoneS và lựa chọn sản phẩm mong muốn.",
  ],
  [
    "02",
    "Bước 2: Chọn hình thức",
    "Chọn trả góp qua thẻ tín dụng, công ty tài chính hoặc mua trước trả sau.",
  ],
  [
    "03",
    "Bước 3: Làm hồ sơ",
    "Điền thông tin cần thiết; với công ty tài chính, nhân viên sẽ tư vấn tại cửa hàng.",
  ],
  [
    "04",
    "Bước 4: Nhận máy",
    "Sau khi hồ sơ được duyệt, khách hàng nhận sản phẩm đã đặt.",
  ],
];

const installmentFaqs = [
  [
    "Nên trả góp trong bao lâu?",
    "Thời hạn nên dựa trên khả năng chi trả hàng tháng. Kỳ hạn ngắn giúp tất toán nhanh, kỳ hạn dài giảm áp lực tiền mỗi tháng.",
  ],
  [
    "Có khả thi không nếu mua trả góp hai sản phẩm cùng lúc?",
    "Có thể, nhưng còn phụ thuộc hạn mức, lịch sử tín dụng và điều kiện duyệt của ngân hàng hoặc công ty tài chính.",
  ],
  [
    "Tại sao mua trả góp không được duyệt?",
    "Một số nguyên nhân thường gặp là hồ sơ thiếu thông tin, thu nhập chưa phù hợp, lịch sử tín dụng chưa tốt hoặc hạn mức không đủ.",
  ],
  [
    "Nợ xấu có mua trả góp được không?",
    "Khả năng được duyệt sẽ thấp hơn. Khách hàng nên kiểm tra và tất toán khoản nợ quá hạn trước khi đăng ký khoản mới.",
  ],
  [
    "Cách kiểm tra còn phải trả góp bao lâu?",
    "Liên hệ đơn vị tài chính hoặc cửa hàng đã hỗ trợ hồ sơ để được kiểm tra số kỳ còn lại.",
  ],
  [
    "Khách hàng là S-Student có thể sử dụng đồng thời hai khuyến mãi S-Finance và Ưu đãi sinh viên được không?",
    "Khách hàng chỉ được sử dụng một trong hai chương trình theo điều kiện áp dụng tại thời điểm mua hàng.",
  ],
];

const installmentBrandFilters = [
  "Tất cả",
  "Apple",
  "Samsung",
  "Xiaomi",
  "OPPO",
  "TECNO",
  "Honor",
  "Nubia",
  "Sony",
  "Nokia",
  "Infinix",
  "Nothing",
  "realme",
];

const CATEGORY_INITIAL_LIMIT = 30;
const CATEGORY_LOAD_MORE_STEP = 20;
const CATEGORY_MAX_LIMIT = 300;

const makeFooterLandingProfile = ({
  title,
  eyebrow = "Thông tin CellphoneS",
  description,
  sourceUrl,
  tone = "red",
  stats = [],
  tabs = [],
  highlights = [],
  sections = [],
  table = [],
  faqs = [],
  form = null,
  cta = null,
}) => ({
  title,
  eyebrow,
  description,
  sourceUrl,
  tone,
  stats,
  tabs,
  highlights,
  sections,
  table,
  faqs,
  form,
  cta,
});

const footerLandingProfiles = {
  "/chinh-sach-giao-hang": makeFooterLandingProfile({
    title: "Hướng dẫn mua hàng từ xa",
    description:
      "Trang mô phỏng chính sách mua hàng online, thanh toán, giao hàng, phí vận chuyển, thời gian nhận hàng và xử lý hoàn tiền của CellphoneS.",
    sourceUrl: "https://cellphones.com.vn/chinh-sach-giao-hang",
    stats: [
      ["300k+", "Miễn phí vận chuyển"],
      ["1-2h", "Giao nhanh nội thành"],
      ["1800.2097", "Tư vấn mua hàng"],
    ],
    tabs: [
      "Tra cứu đơn hàng",
      "Thanh toán",
      "Giao hàng",
      "Hoàn tiền",
      "Đổi mới",
    ],
    highlights: [
      "Đặt hàng online qua website, tổng đài, chat hoặc cửa hàng gần nhất",
      "Thanh toán COD, chuyển khoản, thẻ, ví điện tử, QR hoặc trả góp",
      "Thời gian giao phụ thuộc khu vực, tồn kho và khung giờ xác nhận đơn",
    ],
    sections: [
      {
        title: "Thông tin thanh toán và giao hàng",
        items: [
          "Khách hàng chọn khu vực để xem đúng giá bán và tồn kho.",
          "Đơn công ty cần thông tin xuất hóa đơn hợp lệ ngay khi đặt hàng.",
          "Một số đơn giá trị cao có thể yêu cầu xác minh chủ thẻ/CCCD khi giao.",
        ],
      },
      {
        title: "Phí và thời gian giao hàng",
        items: [
          "Đơn từ 300.000đ được miễn phí giao hàng theo chính sách hiện hành.",
          "Nội thành có thể giao nhanh 1 - 2 giờ nếu khoảng cách và tồn kho phù hợp.",
          "Hàng điện máy/cồng kềnh sẽ được liên hệ xác nhận thời gian giao/lắp đặt.",
        ],
      },
      {
        title: "Hủy đơn và hoàn tiền",
        items: [
          "Tiền mặt có thể hoàn tại cửa hàng.",
          "Chuyển khoản, thẻ và ví điện tử cần thời gian xử lý theo ngân hàng/cổng thanh toán.",
          "Phụ phí, phí chuyển đổi trả góp hoặc khuyến mãi cộng thêm có thể không được hoàn lại.",
        ],
      },
    ],
    faqs: [
      [
        "Mua online có nhận tại cửa hàng được không?",
        "Có. Khách chọn nhận tại cửa hàng khi đặt đơn và chờ xác nhận giữ hàng.",
      ],
      [
        "Đơn dưới 300.000đ có miễn phí giao không?",
        "Thông thường đơn dưới mức miễn phí sẽ có phí giao hàng theo chính sách hiện hành.",
      ],
    ],
  }),
  "/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones":
    makeFooterLandingProfile({
      title: "Hướng dẫn mua hàng trả góp qua thẻ tín dụng",
      description:
        "Trang hướng dẫn trả góp bằng thẻ tín dụng tại website hoặc cửa hàng, gồm ngân hàng hỗ trợ, kỳ hạn, phí chuyển đổi và điều kiện chủ thẻ.",
      sourceUrl:
        "https://cellphones.com.vn/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones",
      stats: [
        ["3-12", "Tháng kỳ hạn"],
        ["Visa/Master/JCB", "Loại thẻ chính"],
        ["0%", "Ưu đãi tùy chương trình"],
      ],
      tabs: [
        "Điều kiện thẻ",
        "Ngân hàng",
        "Trả góp 3 không",
        "Cách đăng ký",
        "Lưu ý",
      ],
      highlights: [
        "Áp dụng cho thẻ tín dụng chính, còn hạn mức và còn hiệu lực",
        "Có hình thức tại cửa hàng và qua cổng thanh toán online",
        "Một số giao dịch có thể bị từ chối nếu thẻ lỗi, không chính chủ hoặc không đủ hạn mức",
      ],
      sections: [
        {
          title: "Hình thức trả góp qua thẻ",
          items: [
            "Cà thẻ và đăng ký chuyển đổi trực tiếp tại cửa hàng.",
            "Thanh toán online qua cổng trả góp nếu sản phẩm/ngân hàng hỗ trợ.",
            "Kỳ hạn phổ biến gồm 3, 6, 9 và 12 tháng tùy ngân hàng.",
          ],
        },
        {
          title: "Quy định chung",
          items: [
            "Không giới hạn số lần mua nếu thẻ còn đủ hạn mức.",
            "Không hủy giao dịch sau khi giao dịch đã chuyển sang trả góp.",
            "Một số đơn trả góp có thể không xuất VAT công ty theo chính sách từng thời điểm.",
          ],
        },
      ],
      table: [
        [
          "Thẻ áp dụng",
          "Visa, Mastercard, JCB do ngân hàng tại Việt Nam phát hành",
        ],
        ["Hạn mức", "Tối thiểu bằng giá trị khoản thanh toán đăng ký"],
        ["Phí chuyển đổi", "Hiển thị theo ngân hàng/kỳ hạn trước khi xác nhận"],
      ],
    }),
  "/tos?part=refund-policy": makeFooterLandingProfile({
    title: "Chính sách đổi trả",
    description:
      "Trang đổi trả mô phỏng phần refund-policy trong quy chế hoạt động của CellphoneS, tập trung vào điều kiện đổi mới, trả hàng và hoàn tiền.",
    sourceUrl: "https://cellphones.com.vn/tos?part=refund-policy",
    stats: [
      ["15-35 ngày", "Mốc tham khảo"],
      ["IMEI/Serial", "Cần đối chiếu"],
      ["CSKH", "Hỗ trợ sửa chữa"],
    ],
    tabs: ["Điều kiện", "Quy trình", "Sản phẩm lỗi", "Hoàn tiền"],
    highlights: [
      "Sản phẩm cần còn đủ phụ kiện, hộp và chứng từ theo từng nhóm hàng",
      "Lỗi kỹ thuật cần được kiểm tra bởi CellphoneS hoặc trung tâm ủy quyền",
      "Đơn xuất hóa đơn công ty có thể cần biên bản/điều chỉnh hóa đơn khi đổi trả",
    ],
    sections: [
      {
        title: "Điều kiện tiếp nhận",
        items: [
          "Có thông tin mua hàng hoặc tài khoản Smember liên quan.",
          "Sản phẩm không bị tác động vật lý ngoài điều kiện chính sách.",
          "Dữ liệu cá nhân nên được sao lưu trước khi kiểm tra/sửa chữa.",
        ],
      },
      {
        title: "Luồng xử lý",
        items: [
          "Gửi yêu cầu hoặc mang sản phẩm đến cửa hàng.",
          "Nhân viên kiểm tra tình trạng và chính sách áp dụng.",
          "Cập nhật kết quả: đổi mới, bảo hành, hoàn tiền hoặc hỗ trợ khác.",
        ],
      },
    ],
  }),
  "/smember/tra-diem": makeFooterLandingProfile({
    title: "Tra điểm Smember",
    eyebrow: "Smember",
    description:
      "Trang tra cứu điểm, hạng thành viên và lịch sử tích lũy của khách hàng Smember.",
    sourceUrl: "https://smember.com.vn/?company_id=cellphones",
    tone: "member",
    stats: [
      ["S-NEW", "Hạng mặc định"],
      ["S-MEM", "Mua sắm tích lũy"],
      ["S-VIP", "Khách hàng thân thiết"],
    ],
    highlights: [
      "Tra tổng chi tiêu tích lũy",
      "Xem điểm Smember và hạng thành viên",
      "Liên kết nhanh tới lịch sử mua hàng",
    ],
    form: {
      title: "Tra cứu điểm",
      fields: ["Số điện thoại Smember", "Email nếu có"],
      button: "Tra điểm",
    },
  }),
  "/uu-dai-smember": makeFooterLandingProfile({
    title: "Ưu đãi Smember",
    eyebrow: "Smember",
    description:
      "Trang ưu đãi thành viên gồm quyền lợi theo hạng, voucher, sinh nhật, S-Student và ưu đãi dành riêng cho tài khoản đăng nhập.",
    sourceUrl: "https://cellphones.com.vn/uu-dai-smember",
    tone: "member",
    stats: [
      ["S-NEW", "Khách mới"],
      ["S-MEM", "Thành viên"],
      ["S-VIP", "Ưu đãi cao"],
    ],
    tabs: ["Hạng thành viên", "Voucher", "S-Student", "Sinh nhật"],
    highlights: [
      "Ưu đãi theo hạng Smember",
      "Voucher cá nhân hóa theo tài khoản",
      "Ưu đãi giáo dục cho S-Student/S-Teacher",
    ],
    sections: [
      {
        title: "Nhóm quyền lợi",
        items: [
          "Giảm thêm khi mua hàng tùy sản phẩm.",
          "Nhận voucher theo chiến dịch và hạng thành viên.",
          "Theo dõi đơn hàng, bảo hành và hóa đơn nhanh hơn khi đăng nhập.",
        ],
      },
    ],
  }),
  "/bao-hanh/tra-thong-tin-bao-hanh": makeFooterLandingProfile({
    title: "Tra thông tin bảo hành",
    eyebrow: "Bảo hành",
    description:
      "Trang tra cứu tình trạng bảo hành bằng số điện thoại, mã đơn, IMEI hoặc Serial sản phẩm.",
    sourceUrl: "https://smember.com.vn/warranty?company_id=cellphones",
    tone: "blue",
    stats: [
      ["IMEI", "Tra máy"],
      ["Serial", "Tra phụ kiện"],
      ["Đơn hàng", "Đối chiếu mua hàng"],
    ],
    highlights: [
      "Kiểm tra hạn bảo hành",
      "Tra theo thông tin đơn hàng",
      "Liên hệ trung tâm bảo hành nếu cần hỗ trợ thêm",
    ],
    form: {
      title: "Tra cứu bảo hành",
      fields: ["Số điện thoại mua hàng", "IMEI / Serial / Mã đơn"],
      button: "Tra bảo hành",
    },
  }),
  "/hoa-don/tra-cuu-hoa-don-dien-tu": makeFooterLandingProfile({
    title: "Tra cứu hóa đơn điện tử",
    eyebrow: "Hóa đơn VAT",
    description:
      "Trang tra cứu hóa đơn điện tử theo mã đơn, email và thông tin khách hàng.",
    sourceUrl: "https://hddt.cellphones.com.vn/",
    tone: "blue",
    stats: [
      ["VAT", "Hóa đơn điện tử"],
      ["Email", "Nhận hóa đơn"],
      ["MST", "Khách công ty"],
    ],
    highlights: [
      "Tìm lại hóa đơn mua hàng",
      "Hỗ trợ khách cá nhân và công ty",
      "Cần nhập đúng email/số điện thoại đã đặt hàng",
    ],
    form: {
      title: "Tra cứu hóa đơn",
      fields: ["Mã đơn hàng", "Email nhận hóa đơn"],
      button: "Tra hóa đơn",
    },
  }),
  "/quy-dinh-ve-hoa-don-khi-mua-hang-cellphones": makeFooterLandingProfile({
    title: "Thông báo về hóa đơn khi mua hàng tại CellphoneS",
    eyebrow: "Hóa đơn mua hàng",
    description:
      "Trang quy định hóa đơn VAT điện tử, thời gian nhận hóa đơn, cách tìm lại hóa đơn và thông tin cần cung cấp khi mua hàng.",
    sourceUrl:
      "https://cellphones.com.vn/quy-dinh-ve-hoa-don-khi-mua-hang-cellphones",
    stats: [
      ["100%", "Hàng hóa có hóa đơn"],
      ["10 năm", "Lưu trữ theo quy định"],
      ["1800.2063", "Hỗ trợ khiếu nại"],
    ],
    tabs: [
      "Các loại hóa đơn",
      "Quy định",
      "Thời gian nhận",
      "Tìm lại hóa đơn",
      "FAQ",
    ],
    highlights: [
      "Hóa đơn điện tử được cung cấp khi mua hàng theo quy định",
      "Khách công ty cần nhập đúng tên, mã số thuế, địa chỉ",
      "Liên hệ tổng đài khi không nhận được hóa đơn",
    ],
    sections: [
      {
        title: "Thông tin cần có",
        items: [
          "Mã đơn hàng hoặc số điện thoại đặt hàng.",
          "Email nhận hóa đơn.",
          "Tên công ty, MST và địa chỉ nếu xuất hóa đơn doanh nghiệp.",
        ],
      },
    ],
  }),
  "/bao-hanh/apple": makeFooterLandingProfile({
    title: "Trung tâm bảo hành Apple chính hãng",
    eyebrow: "Apple Authorized Service",
    description:
      "Trang giới thiệu trung tâm bảo hành ủy quyền Apple và quy trình tiếp nhận sản phẩm Apple chính hãng.",
    sourceUrl: "https://cellphones.com.vn/bao-hanh/apple",
    tone: "dark",
    stats: [
      ["CareS", "Trung tâm ủy quyền"],
      ["iPhone/iPad/Mac", "Thiết bị hỗ trợ"],
      ["Hà Nội/TP.HCM", "Khu vực chính"],
    ],
    highlights: [
      "Tiếp nhận iPhone, iPad, MacBook và phụ kiện Apple",
      "Kiểm tra theo quy trình hãng",
      "Hướng dẫn điều kiện bảo hành trước khi tiếp nhận",
    ],
    sections: [
      {
        title: "Quy trình tiếp nhận",
        items: [
          "Kiểm tra tình trạng ngoại quan và số serial.",
          "Đối chiếu điều kiện bảo hành theo hệ thống hãng.",
          "Cập nhật kết quả sửa chữa/bảo hành cho khách hàng.",
        ],
      },
    ],
  }),
  "/quy-dinh-ve-viec-sao-luu-du-lieu": makeFooterLandingProfile({
    title: "Quy định về việc sao lưu dữ liệu",
    description:
      "Trang nhắc khách hàng chủ động sao lưu dữ liệu trước khi sửa chữa, bảo hành, đổi trả hoặc can thiệp phần mềm.",
    sourceUrl: "https://cellphones.com.vn/quy-dinh-ve-viec-sao-luu-du-lieu",
    stats: [
      ["Dữ liệu cá nhân", "Cần tự sao lưu"],
      ["Reset", "Có thể phát sinh"],
      ["Đồng ý", "Trước khi xử lý"],
    ],
    highlights: [
      "Sao lưu hình ảnh, danh bạ, tài liệu và ứng dụng",
      "Một số thao tác có thể cần khôi phục cài đặt gốc",
      "CellphoneS chỉ hỗ trợ kỹ thuật trong phạm vi khách hàng đồng ý",
    ],
    sections: [
      {
        title: "Khuyến nghị trước khi gửi máy",
        items: [
          "Đăng xuất tài khoản cá nhân nếu cần.",
          "Sao lưu dữ liệu lên iCloud, Google Drive hoặc thiết bị khác.",
          "Ghi nhớ mật khẩu/mã khóa để hỗ trợ kiểm tra.",
        ],
      },
    ],
  }),
  "/chinh-sach-khui-hop-apple": makeFooterLandingProfile({
    title: "Chính sách khui hộp sản phẩm Apple",
    description:
      "Trang mô phỏng quy định kiểm tra seal, ngoại quan, kích hoạt và đổi trả riêng với sản phẩm Apple.",
    sourceUrl: "https://cellphones.com.vn/chinh-sach-khui-hop-apple",
    stats: [
      ["Seal", "Kiểm tra trước"],
      ["Active", "Áp chính sách riêng"],
      ["Apple", "Sản phẩm đặc thù"],
    ],
    highlights: [
      "Kiểm tra ngoại quan, seal, hộp và phụ kiện trước khi kích hoạt",
      "Sản phẩm đã kích hoạt áp dụng chính sách Apple/CellphoneS tương ứng",
      "Khách nên giữ hộp và phụ kiện trong thời gian đổi trả",
    ],
    sections: [
      {
        title: "Luồng khui hộp",
        items: [
          "Nhân viên hỗ trợ kiểm tra ngoại quan.",
          "Khách xác nhận tình trạng trước khi kích hoạt.",
          "Ghi nhận thông tin khi có bất thường về hộp/máy/phụ kiện.",
        ],
      },
    ],
  }),
  "/vat-refund": makeFooterLandingProfile({
    title: "Tax refund at CellphoneS",
    eyebrow: "VAT Refund in Vietnam",
    description:
      "Landing page tiếng Anh mô phỏng trang hoàn thuế GTGT cho khách đủ điều kiện khi mua hàng tại CellphoneS.",
    sourceUrl: "https://cellphones.com.vn/vat-refund",
    tone: "blue",
    stats: [
      ["177+", "Stores"],
      ["3M+", "Smembers"],
      ["VAT", "Full invoice"],
    ],
    tabs: ["Eligibility", "About CellphoneS", "Ecosystem", "How to claim"],
    highlights: [
      "Eligible foreign visitors or Vietnamese residing abroad may request tax refund support",
      "CellphoneS provides VAT invoice for genuine products",
      "Retail ecosystem includes CellphoneS, Điện Thoại Vui, CareS and SChannel",
    ],
    sections: [
      {
        title: "Eligible beneficiaries",
        items: [
          "Foreigners or Vietnamese residing abroad with valid passport/immigration document.",
          "Documents must be used for entry/exit in Vietnam.",
          "Refund procedure depends on legal requirements and store guidance.",
        ],
      },
    ],
  }),
  "/dich-vu-khach-hang-doanh-nghiep": makeFooterLandingProfile({
    title: "Khách hàng doanh nghiệp",
    eyebrow: "B2B",
    description:
      "Landing page cho khách hàng doanh nghiệp mua số lượng lớn, cần báo giá, hóa đơn, thiết bị công nghệ và hỗ trợ triển khai.",
    sourceUrl: "https://cellphones.com.vn/dich-vu-khach-hang-doanh-nghiep",
    tone: "blue",
    stats: [
      ["B2B", "Mua số lượng lớn"],
      ["VAT", "Hỗ trợ chứng từ"],
      ["Dự án", "Giao hàng linh hoạt"],
    ],
    tabs: ["Lợi ích", "Sản phẩm", "Quy trình", "Liên hệ"],
    highlights: [
      "Báo giá theo nhu cầu doanh nghiệp",
      "Tư vấn cấu hình thiết bị cho đội nhóm",
      "Hỗ trợ xuất hóa đơn và giao hàng dự án",
    ],
    sections: [
      {
        title: "Dịch vụ B2B",
        items: [
          "Tư vấn thiết bị cho văn phòng, trường học, doanh nghiệp.",
          "Báo giá số lượng theo ngành hàng.",
          "Hỗ trợ giao nhiều điểm hoặc theo lịch triển khai.",
        ],
      },
    ],
    form: {
      title: "Gửi yêu cầu doanh nghiệp",
      fields: [
        "Tên công ty",
        "Người liên hệ",
        "Số điện thoại",
        "Nhu cầu mua hàng",
      ],
      button: "Gửi yêu cầu",
    },
  }),
  "/danh-sach-khuyen-mai": makeFooterLandingProfile({
    title: "Danh sách khuyến mãi",
    eyebrow: "Ưu đãi thanh toán",
    description:
      "Trang danh sách ưu đãi thanh toán theo ngân hàng, thẻ, ví điện tử, mua trước trả sau và chương trình đối tác.",
    sourceUrl: "https://cellphones.com.vn/danh-sach-khuyen-mai",
    tone: "promo",
    stats: [
      ["Ngân hàng", "Ưu đãi thẻ"],
      ["Ví điện tử", "Voucher/hoàn tiền"],
      ["Trả sau", "Mua trước trả sau"],
    ],
    tabs: ["Ưu đãi thanh toán", "Ngân hàng", "Ví điện tử", "Mua trước trả sau"],
    highlights: [
      "Ưu đãi thanh toán thay đổi theo thời điểm",
      "Cần kiểm tra điều kiện từng ngân hàng/ví điện tử",
      "Một số mã chỉ áp dụng trên app hoặc khi thanh toán online",
    ],
    sections: [
      {
        title: "Nhóm ưu đãi",
        items: [
          "Mở thẻ và nhận ưu đãi.",
          "Thanh toán QR/thẻ/ví điện tử.",
          "Mua trước trả sau hoặc trả góp theo kỳ hạn.",
        ],
      },
    ],
  }),
  "/tos": makeFooterLandingProfile({
    title: "Quy chế hoạt động website",
    description:
      "Trang quy chế hoạt động của website thương mại điện tử CellphoneS, gồm quy định chung, quy trình giao dịch, bảo hành, đổi trả và bảo mật.",
    sourceUrl: "https://cellphones.com.vn/tos",
    stats: [
      ["TMĐT", "Quy chế website"],
      ["Giao dịch", "Quy trình mua bán"],
      ["Bảo mật", "Thông tin cá nhân"],
    ],
    tabs: [
      "Quy định chung",
      "Quy trình giao dịch",
      "Bảo hành",
      "Đổi trả",
      "Bảo mật",
    ],
    highlights: [
      "Quy định quyền và trách nhiệm của khách hàng, website và đơn vị bán hàng",
      "Mô tả luồng đặt hàng, xác nhận, thanh toán, giao nhận",
      "Tích hợp các chính sách bảo hành, đổi trả và bảo mật",
    ],
    sections: [
      {
        title: "Nội dung chính",
        items: [
          "Quy định chung khi sử dụng website.",
          "Quy trình đặt hàng và xử lý giao dịch.",
          "Chính sách bảo hành, đổi trả, hủy giao dịch và bảo mật dữ liệu.",
        ],
      },
    ],
  }),
  "/tos?part=privacy-policy": makeFooterLandingProfile({
    title: "Chính sách bảo mật thông tin cá nhân",
    description:
      "Trang bảo mật thông tin cá nhân mô phỏng phần privacy-policy trong quy chế hoạt động của CellphoneS.",
    sourceUrl: "https://cellphones.com.vn/tos?part=privacy-policy",
    stats: [
      ["Tài khoản", "Thông tin đăng nhập"],
      ["Đơn hàng", "Thông tin giao nhận"],
      ["CSKH", "Dữ liệu hỗ trợ"],
    ],
    tabs: ["Thu thập", "Mục đích", "Lưu trữ", "Chia sẻ", "Quyền khách hàng"],
    highlights: [
      "Dữ liệu dùng để xác thực tài khoản, xử lý đơn hàng và chăm sóc khách hàng",
      "Thông tin thanh toán/giao nhận cần được bảo vệ và chỉ dùng đúng mục đích",
      "Khách hàng có thể yêu cầu cập nhật thông tin theo quy trình hỗ trợ",
    ],
    sections: [
      {
        title: "Nhóm dữ liệu thường dùng",
        items: [
          "Thông tin tài khoản và liên hệ.",
          "Thông tin đơn hàng, giao nhận, bảo hành.",
          "Lịch sử tương tác hỗ trợ, đánh giá, hỏi đáp.",
        ],
      },
    ],
  }),
  "/chinh-sach-bao-hanh": makeFooterLandingProfile({
    title: "Chính sách bảo hành và đổi trả sản phẩm",
    eyebrow: "Bảo hành",
    description:
      "Trang chính sách bảo hành, đổi trả sản phẩm tại CellphoneS với nhóm bảo hành hãng, 1 đổi 1, sửa chữa và hỗ trợ sau bán hàng.",
    sourceUrl: "https://cellphones.com.vn/chinh-sach-bao-hanh",
    tone: "blue",
    stats: [
      ["Bảo hành hãng", "Theo thương hiệu"],
      ["1 đổi 1", "Theo điều kiện"],
      ["CSKH", "Hỗ trợ sau bán"],
    ],
    tabs: ["Bảo hành", "Đổi trả", "Sửa chữa", "FAQ"],
    highlights: [
      "Chính sách bảo hành phụ thuộc từng sản phẩm và thương hiệu",
      "Khách hàng cần thông tin mua hàng/IMEI/Serial khi gửi bảo hành",
      "Một số sản phẩm có chính sách đổi mới riêng trong thời gian đầu",
    ],
    sections: [
      {
        title: "Quy trình bảo hành",
        items: [
          "Tiếp nhận sản phẩm và thông tin mua hàng.",
          "Kiểm tra điều kiện bảo hành/đổi trả.",
          "Cập nhật phương án xử lý cho khách hàng.",
        ],
      },
    ],
  }),
  "/lien-he-hop-tac": makeFooterLandingProfile({
    title: "Liên hệ hợp tác cùng CellphoneS",
    eyebrow: "Hợp tác kinh doanh",
    description:
      "Trang tiếp nhận hợp tác kinh doanh, cung ứng, truyền thông, dịch vụ và đối tác triển khai.",
    sourceUrl: "https://cellphones.com.vn/lien-he-hop-tac",
    stats: [
      ["Supplier", "Nhà cung cấp"],
      ["Media", "Truyền thông"],
      ["Service", "Dịch vụ"],
    ],
    highlights: [
      "Tiếp nhận thông tin nhà cung cấp sản phẩm/dịch vụ",
      "Hỗ trợ đề xuất hợp tác truyền thông hoặc chiến dịch thương mại",
      "Phân loại yêu cầu để chuyển đúng bộ phận phụ trách",
    ],
    form: {
      title: "Thông tin hợp tác",
      fields: [
        "Tên đơn vị",
        "Email liên hệ",
        "Số điện thoại",
        "Nội dung hợp tác",
      ],
      button: "Gửi thông tin",
    },
  }),
  "/tuyen-dung": makeFooterLandingProfile({
    title: "Tuyển dụng CellphoneS",
    eyebrow: "Careers",
    description:
      "Trang tuyển dụng local cho các vị trí bán hàng, kỹ thuật, vận hành, marketing và công nghệ.",
    sourceUrl: "https://tuyendung.cellphones.com.vn/",
    tone: "promo",
    stats: [
      ["Retail", "Bán hàng"],
      ["Tech", "Kỹ thuật"],
      ["Back office", "V运行"],
    ],
    highlights: [
      "Ứng tuyển vị trí cửa hàng và văn phòng",
      "Nộp thông tin liên hệ nhanh",
      "Theo dõi vị trí mới trên trang tuyển dụng gốc",
    ],
    form: {
      title: "Ứng tuyển nhanh",
      fields: ["Họ và tên", "Số điện thoại", "Email", "Vị trí quan tâm"],
      button: "Gửi hồ sơ",
    },
  }),
  "/bieu-phi-bao-hanh-mo-rong": makeFooterLandingProfile({
    title: "Dịch vụ bảo hành mở rộng",
    eyebrow: "Gói bảo vệ toàn diện",
    description:
      "Trang dịch vụ bảo hành mở rộng, bảo vệ rơi vỡ, vào nước, gia hạn bảo hành và hỗ trợ sửa chữa theo gói.",
    sourceUrl: "https://cellphones.com.vn/bieu-phi-bao-hanh-mo-rong",
    tone: "blue",
    stats: [
      ["Gia hạn", "Kéo dài bảo hành"],
      ["Rơi vỡ", "Hỗ trợ sửa chữa"],
      ["Gói bảo vệ", "Theo sản phẩm"],
    ],
    tabs: ["Điện thoại", "Laptop", "Tablet", "Đồng hồ", "Phụ kiện"],
    highlights: [
      "Gói dịch vụ tùy theo ngành hàng và giá trị sản phẩm",
      "Quyền lợi, phí và điều kiện được hiển thị trước khi mua",
      "Khách nên đọc kỹ phạm vi bảo vệ và trường hợp loại trừ",
    ],
    table: [
      ["Gia hạn bảo hành", "Kéo dài thời gian bảo hành theo gói"],
      ["Rơi vỡ/vào nước", "Hỗ trợ chi phí sửa chữa theo điều kiện"],
      ["Bảo vệ màn hình", "Áp dụng cho một số nhóm điện thoại/tablet"],
    ],
  }),
};

footerLandingProfiles["/chinh-sach/mua-hang-va-thanh-toan-online"] =
  footerLandingProfiles["/chinh-sach-giao-hang"];
footerLandingProfiles["/chinh-sach/mua-hang-tra-gop-bang-the-tin-dung"] =
  footerLandingProfiles[
    "/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones"
  ];
footerLandingProfiles["/chinh-sach/chinh-sach-doi-tra"] =
  footerLandingProfiles["/tos?part=refund-policy"];
footerLandingProfiles["/chinh-sach-bao-mat"] =
  footerLandingProfiles["/tos?part=privacy-policy"];
footerLandingProfiles["/chinh-sach/chinh-sach-bao-mat-thong-tin-ca-nhan"] =
  footerLandingProfiles["/tos?part=privacy-policy"];
footerLandingProfiles["/chinh-sach/chinh-sach-bao-hanh"] =
  footerLandingProfiles["/chinh-sach-bao-hanh"];
footerLandingProfiles["/chinh-sach/quy-che-hoat-dong"] =
  footerLandingProfiles["/tos"];
footerLandingProfiles["/dich-vu/khach-hang-doanh-nghiep-b2b"] =
  footerLandingProfiles["/dich-vu-khach-hang-doanh-nghiep"];

const getFooterLandingKey = (page) => {
  const part = page.params?.get?.("part") || "";
  return part ? `${page.path}?part=${part}` : page.path;
};

const knownPhoneBrands = {
  apple: "apple",
  iphone: "apple",
  samsung: "samsung",
  xiaomi: "xiaomi",
  redmi: "xiaomi",
  poco: "xiaomi",
  oppo: "oppo",
  realme: "realme",
  oneplus: "oneplus",
  honor: "honor",
  tecno: "tecno",
  nubia: "nubia",
  sony: "sony",
  nokia: "nokia",
  nothing: "nothing",
  masstel: "masstel",
  itel: "itel",
  huawei: "huawei",
  meizu: "meizu",
  infinix: "infinix",
  vivo: "vivo",
  tcl: "tcl",
  benco: "benco",
  asus: "asus",
};

const phoneBrandOrder = [
  "Apple",
  "Samsung",
  "Oppo",
  "Xiaomi",
  "Tecno",
  "Honor",
  "Nubia",
  "Sony",
  "Nokia",
  "Infinix",
  "Nothing",
  "Masstel",
  "Realme",
  "Itel",
  "Huawei",
  "Meizu",
  "Vivo",
  "OnePlus",
  "TCL",
  "benco",
  "ASUS",
];

const knownTabletBrands = {
  ipad: "apple",
  apple: "apple",
  samsung: "samsung",
  xiaomi: "xiaomi",
  redmi: "xiaomi",
  poco: "xiaomi",
  huawei: "huawei",
  lenovo: "lenovo",
  teclast: "teclast",
  nubia: "nubia",
  honor: "honor",
  oppo: "oppo",
};

const tabletBrandRoutes = {
  apple: "/tablet/ipad.html",
  samsung: "/tablet/samsung.html",
  xiaomi: "/tablet/xiaomi.html",
  huawei: "/tablet/huawei.html",
  lenovo: "/tablet/lenovo.html",
  teclast: "/tablet/teclast.html",
  nubia: "/tablet/nubia.html",
  honor: "/tablet/honor.html",
  oppo: "/tablet/oppo.html",
};

const tabletBannerBase =
  "https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/";

const tabletCategoryBanners = [
  {
    name: "iPad Air M4",
    brand: "apple",
    href: "/apple-ipad-air-m4-11-inch-128gb-wifi.html",
    image: `${tabletBannerBase}595x100_iPadAirM4_07_2026.png`,
  },
  {
    name: "Máy đọc sách Onyx BOOX",
    brand: "boox",
    href: "/tablet/may-doc-sach.html?brand=boox",
    image: `${tabletBannerBase}Onyx-boox-Cate.png`,
  },
  {
    name: "Ưu đãi iPad Back to School",
    brand: "apple",
    href: "/tablet/ipad.html",
    image: `${tabletBannerBase}Cate_iPad_B2S_1.png`,
  },
  {
    name: "Xiaomi Redmi Pad 2",
    brand: "xiaomi",
    href: "/may-tinh-bang-xiaomi-redmi-pad-2-wifi.html",
    image: `${tabletBannerBase}xiaomi-redmi-pad-2-9-cate.png`,
  },
  {
    name: "Máy tính bảng Samsung Galaxy Tab",
    brand: "samsung",
    href: "/tablet/samsung.html",
    image: `${tabletBannerBase}Cate_MTBSamsung.png`,
  },
  {
    name: "Samsung Galaxy Tab ưu đãi học sinh sinh viên",
    brand: "samsung",
    href: "/tablet/samsung.html",
    image: `${tabletBannerBase}Cate_MTBSamsung.png`,
  },
  {
    name: "Dùng thử iPad A16",
    brand: "apple",
    href: "/ipad-a16-11-inch.html",
    image: `${tabletBannerBase}595x100_PadA16_072026.png`,
  },
  {
    name: "iPad A16 mua kèm bút",
    brand: "apple",
    href: "/ipad-a16-11-inch.html",
    image: `${tabletBannerBase}595x100_iPadA16Muakembut_07_2026.png`,
  },
  {
    name: "Máy tính bảng Lenovo",
    brand: "lenovo",
    href: "/tablet/lenovo.html",
    image: `${tabletBannerBase}Cate_MTB_Lenovo.png`,
  },
  {
    name: "Lenovo Idea Tab Pro Gen 2",
    brand: "lenovo",
    href: "/may-tinh-bang-lenovo-idea-tab-pro-gen-2-zahd0452vn-kem-but-ban-phim.html",
    image: `${tabletBannerBase}LenovoTabGen2v_cate.png`,
  },
  {
    name: "Máy đọc sách Kindle",
    brand: "kindle",
    href: "/tablet/may-doc-sach.html?brand=kindle",
    image: `${tabletBannerBase}Kindle_Cate.png`,
  },
  {
    name: "Bàn phím bao da Logitech cho iPad",
    brand: "apple",
    href: buildSearchPath("Bàn phím bao da Logitech cho iPad"),
    image: `${tabletBannerBase}mua-kem-ipad-bao-da-cate.jpg`,
  },
  {
    name: "Lenovo Legion Tab Gen 5",
    brand: "lenovo",
    href: "/may-tinh-bang-lenovo-legion-tab-gen-5-12gb-256gb-zah20030vn.html",
    image: `${tabletBannerBase}LenovotabGen5_cate.png`,
  },
  {
    name: "Xiaomi Redmi Pad 2 4G",
    brand: "xiaomi",
    href: "/may-tinh-bang-xiaomi-redmi-pad-2-9-7-inch-4g.html",
    image: `${tabletBannerBase}xiaomi-redmi-pad-2-9-cate.png`,
  },
];

const tabletCategoryBannerTracks = [
  tabletCategoryBanners.filter((_, index) => index % 2 === 0),
  tabletCategoryBanners.filter((_, index) => index % 2 === 1),
];

const tabletBrandLandingProfiles = {
  apple: {
    title: "iPad",
    bannerIndexes: [2, 11, 0, 6, 7],
    showVoucher: true,
    series: [
      ["IPAD PRO", "iPad Pro"],
      ["IPAD AIR", "iPad Air"],
      ["IPAD MINI", "iPad Mini"],
      ["IPAD A16", "iPad A16"],
    ],
  },
  samsung: {
    title: "Máy tính bảng Samsung Galaxy Tab",
    bannerIndexes: [4, 5],
    series: [
      ["SAMSUNG GALAXY TAB S11 SERIES", "Samsung Galaxy Tab S11"],
      ["SAMSUNG GALAXY TAB S10 SERIES", "Samsung Galaxy Tab S10"],
      ["SAMSUNG GALAXY TAB S9 SERIES", "Samsung Galaxy Tab S9"],
    ],
  },
  xiaomi: {
    title: "Máy tính bảng Xiaomi Mi Pad",
    bannerIndexes: [3, 13],
    showWeekendSale: true,
    series: [],
  },
  huawei: { title: "Máy tính bảng Huawei", series: [] },
  lenovo: {
    title: "Máy tính bảng Lenovo",
    bannerIndexes: [9, 12, 8],
    series: [
      ["LENOVO IDEA TAB SERIES", "Lenovo Idea Tab"],
      ["LENOVO TAB", "Lenovo Tab"],
    ],
  },
  teclast: { title: "Máy tính bảng Teclast", series: [] },
  nubia: { title: "Máy tính bảng Nubia", series: [] },
  honor: { title: "Máy tính bảng HONOR", series: [] },
  oppo: { title: "Máy tính bảng OPPO", series: [] },
};

const tabletNeedLandingProfiles = {
  "/bo-loc/may-tinh-bang-cho-tre-em": {
    title: "Máy tính bảng cho trẻ em học tập, giải trí bảo vệ mắt",
    usage: "Cho trẻ em",
    bannerIndexes: [2, 9, 0, 8],
  },
  "/tablet/ai.html": {
    title: "Máy tính bảng AI",
    breadcrumbLabel: "Máy tính bảng AI",
    special: "AI tích integration",
    standalone: true,
    criteria: "ai",
    preserveScopeOnClear: true,
  },
  "/tablet/may-doc-sach.html": {
    title: "Máy đọc sách",
    breadcrumbLabel: "Máy đọc sách",
    q: "Máy đọc sách",
    bannerIndexes: [10, 1],
    standalone: true,
    criteria: "reader",
    brandPills: [
      { label: "Kindle", value: "kindle", className: "kindle" },
      { label: "BOOX", value: "boox", className: "boox" },
    ],
    preserveScopeOnClear: true,
  },
};

const phoneCategoryBanners = [
  {
    name: "Ưu đãi điện thoại Z8",
    brand: "",
    href: buildCategoryPath("Điện thoại", {
      brand: "samsung",
      q: "Samsung Galaxy Z",
      keyword: "Samsung Galaxy gập mới",
      title: "Samsung Galaxy gập mới",
      sort: "latest",
    }),
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cate-z8.png",
  },
  {
    name: "iPhone 17 Pro Max",
    brand: "apple",
    href: "/iphone-17-pro-max.html",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/595x100_iPhone17ProMax_07_2026.png",
  },
  {
    name: "Samsung Galaxy S26 Ultra",
    brand: "samsung",
    href: "/dien-thoai-samsung-galaxy-s26-ultra.html",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cates26ggg.png",
  },
  {
    name: "Điện thoại Samsung",
    brand: "samsung",
    href: buildCategoryPath("Điện thoại", {
      brand: "samsung",
      keyword: "Điện thoại Samsung",
      title: "Điện thoại Samsung",
      sort: "latest",
    }),
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cate_dt_samsung.png",
  },
  {
    name: "OPPO Reno16 F",
    brand: "oppo",
    href: "/dien-thoai-oppo-reno16-f.html",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/OppoReno16F_cate_open.png",
  },
  {
    name: "Điện thoại Xiaomi",
    brand: "xiaomi",
    href: buildCategoryPath("Điện thoại", {
      brand: "xiaomi",
      keyword: "Điện thoại Xiaomi",
      title: "Điện thoại Xiaomi",
      sort: "latest",
    }),
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cate-dt-xiaomi.png",
  },
  {
    name: "Xiaomi 17T",
    brand: "xiaomi",
    href: "/dien-thoai-xiaomi-17t.html",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/xiaomi-17t-cate-0726.png",
  },
  {
    name: "Xiaomi Redmi A7",
    brand: "xiaomi",
    href: "/dien-thoai-xiaomi-redmi-a7.html",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/cate_RedmiA7.jpg",
  },
  {
    name: "HONOR 600 5G",
    brand: "honor",
    href: "/dien-thoai-honor-600.html",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/cate_Honor600_opensale.jpg",
  },
  {
    name: "Nubia Neo 5 Series",
    brand: "nubia",
    href: "/dien-thoai-nubia-neo-5-5g.html",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/cate_nubianeo5series.jpg",
  },
  {
    name: "iPhone 17",
    brand: "apple",
    href: "/mobile/apple/iphone-17.html",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/595x100_iPhone%2017_07_2026.png",
  },
];

const phoneCategoryBannerTracks = [
  phoneCategoryBanners.filter((_, index) => index % 2 === 0),
  phoneCategoryBanners.filter((_, index) => index % 2 === 1),
];

const phoneBrandLandingProfiles = {
  samsung: {
    title: "Điện thoại Samsung Galaxy",
    bannerIndexes: [2, 3],
    showWeekendSale: true,
    series: [
      ["GALAXY S", "Samsung Galaxy S"],
      ["GALAXY A", "Samsung Galaxy A"],
      ["GALAXY M", "Samsung Galaxy M"],
      ["GALAXY Z", "Samsung Galaxy Z"],
      ["GALAXY Z7 SERIES", "Samsung Galaxy Z7"],
      ["GALAXY S25 SERIES", "Samsung Galaxy S25"],
      ["GALAXY S26 SERIES", "Samsung Galaxy S26"],
    ],
  },
  xiaomi: {
    title: "Điện thoại Xiaomi",
    bannerIndexes: [5, 7, 6],
    showWeekendSale: true,
    series: [
      ["XIAOMI 17 SERIES", "Xiaomi 17"],
      ["XIAOMI 15 SERIES", "Xiaomi 15"],
      ["XIAOMI 14 SERIES", "Xiaomi 14"],
      ["XIAOMI 13 SERIES", "Xiaomi 13"],
      ["XIAOMI 12 SERIES", "Xiaomi 12"],
      ["NOTE 15 SERIES", "Note 15"],
      ["NOTE 14 SERIES", "Note 14"],
      ["NOTE 13 SERIES", "Note 13"],
      ["NOTE 12 SERIES", "Note 12"],
      ["NOTE 11 SERIES", "Note 11"],
      ["REDMI SERIES", "Redmi"],
      ["POCO SERIES", "POCO"],
    ],
  },
  oppo: {
    title: "Điện thoại OPPO",
    series: [
      ["A SERIES", "OPPO A"],
      ["FIND X SERIES", "OPPO Find X"],
      ["FIND N SERIES", "OPPO Find N"],
      ["RENO SERIES", "OPPO Reno"],
    ],
  },
  tecno: {
    title: "Điện thoại Tecno",
    series: [
      ["POVA", "Tecno Pova"],
      ["SPARK", "Tecno Spark"],
      ["CAMON", "Tecno Camon"],
      ["PHANTOM", "Tecno Phantom"],
    ],
  },
  nubia: {
    title: "Điện thoại Nubia",
    series: [
      ["ZTE", "ZTE"],
      ["NUBIA", "Nubia"],
      ["NUBIA REDMAGIC", "Nubia RedMagic"],
    ],
  },
  vivo: {
    title: "Điện thoại vivo",
    series: [
      ["Y SERIES", "vivo Y"],
      ["V SERIES", "vivo V"],
      ["X SERIES", "vivo X"],
    ],
  },
};

const resetPhoneListing = {
  q: "",
  segment: "",
  filter: "",
  facet: "",
  inStock: "",
  priceMin: "",
  priceMax: "",
  ram: "",
  storage: "",
  screenSize: "",
  usage: "",
  display: "",
  camera: "",
  refreshRate: "",
  special: "",
  nfc: "",
  network: "",
  chipset: "",
  cpu: "",
  gpu: "",
  resolution: "",
  phoneType: "",
  audioFeature: "",
  audioConnection: "",
  audioUsage: "",
  audioType: "",
  audioPower: "",
  audioDesign: "",
  audioLine: "",
  audioTransmission: "",
  sort: "latest",
};

const iPhoneSeries = [
  { label: "IPHONE 17 SERIES", q: "iPhone 17" },
  { label: "IPHONE AIR", q: "iPhone Air" },
  { label: "IPHONE 16 SERIES", q: "iPhone 16" },
  { label: "IPHONE 15 SERIES", q: "iPhone 15" },
  { label: "IPHONE 14 SERIES", q: "iPhone 14" },
  { label: "IPHONE 13 SERIES", q: "iPhone 13" },
];

const filterParamByFacet = {
  all: "",
  brand: "brand",
  price: "priceMin",
  storage: "storage",
  ram: "ram",
  "screen-size": "screenSize",
  screenSize: "screenSize",
  usage: "usage",
  display: "display",
  camera: "camera",
  "refresh-rate": "refreshRate",
  refreshRate: "refreshRate",
  special: "special",
  nfc: "nfc",
  network: "network",
  chipset: "chipset",
  cpu: "cpu",
  gpu: "gpu",
  resolution: "resolution",
  "phone-type": "phoneType",
  phoneType: "phoneType",
  "product-type": "productType",
  productType: "productType",
  "audio-feature": "audioFeature",
  audioFeature: "audioFeature",
  "audio-connection": "audioConnection",
  audioConnection: "audioConnection",
  "audio-usage": "audioUsage",
  audioUsage: "audioUsage",
  "audio-type": "audioType",
  audioType: "audioType",
  "audio-power": "audioPower",
  audioPower: "audioPower",
  "audio-design": "audioDesign",
  audioDesign: "audioDesign",
  "audio-line": "audioLine",
  audioLine: "audioLine",
  "audio-transmission": "audioTransmission",
  audioTransmission: "audioTransmission",
};

const makeCriterion = (id, label, icon, extra = {}) => ({
  id,
  label,
  icon,
  dropdown: Boolean(extra.dropdown),
  ...extra,
});

const commonCategoryCriteria = [
  makeCriterion("all", "Bộ lọc", "filter"),
  makeCriterion("in-stock", "Sẵn hàng", "truck", {
    filter: "in-stock",
    inStock: true,
  }),
  makeCriterion("new", "Hàng mới về", "new", { filter: "new", sort: "latest" }),
  makeCriterion("price", "Xem theo giá", "price", {
    filter: "price",
    dropdown: true,
  }),
];

const phoneCategoryCriteria = [
  ...commonCategoryCriteria,
  makeCriterion("brand", "Hãng sản xuất", "brand", {
    facet: "brand",
    dropdown: true,
  }),
  makeCriterion("storage", "Bộ nhớ trong", "storage", {
    facet: "storage",
    dropdown: true,
  }),
  makeCriterion("ram", "Dung lượng RAM", "ram", {
    facet: "ram",
    dropdown: true,
  }),
  makeCriterion("screen-size", "Kích thước màn hình", "screenSize", {
    facet: "screen-size",
    dropdown: true,
  }),
  makeCriterion("usage", "Nhu cầu sử dụng", "usage", {
    facet: "usage",
    dropdown: true,
  }),
  makeCriterion("display", "Kiểu màn hình", "display", {
    facet: "display",
    dropdown: true,
  }),
  makeCriterion("camera", "Tính năng camera", "camera", {
    facet: "camera",
    dropdown: true,
  }),
  makeCriterion("refresh-rate", "Tần số quét", "refresh", {
    facet: "refresh-rate",
    dropdown: true,
  }),
  makeCriterion("special", "Tính năng đặc biệt", "special", {
    facet: "special",
    dropdown: true,
  }),
  makeCriterion("network", "Kết nối mạng", "network", {
    facet: "network",
    dropdown: true,
  }),
  makeCriterion("chipset", "Chip xử lý", "chipset", {
    facet: "chipset",
    dropdown: true,
  }),
  makeCriterion("phone-type", "Loại điện thoại", "phoneType", {
    facet: "phone-type",
    dropdown: true,
  }),
];

const tabletCategoryCriteria = [
  ...commonCategoryCriteria,
  makeCriterion("brand", "Hãng sản xuất", "brand", {
    facet: "brand",
    dropdown: true,
  }),
  makeCriterion("storage", "Bộ nhớ trong", "storage", {
    facet: "storage",
    dropdown: true,
  }),
  makeCriterion("ram", "Dung lượng RAM", "ram", {
    facet: "ram",
    dropdown: true,
  }),
  makeCriterion("screen-size", "Kích thước màn hình", "screenSize", {
    facet: "screen-size",
    dropdown: true,
  }),
  makeCriterion("usage", "Nhu cầu sử dụng", "usage", {
    facet: "usage",
    dropdown: true,
  }),
  makeCriterion("phone-type", "Hệ điều hành", "phoneType", {
    facet: "phone-type",
    dropdown: true,
  }),
  makeCriterion("chipset", "Chip xử lý", "chipset", {
    facet: "chipset",
    dropdown: true,
  }),
  makeCriterion("special", "Tính năng đặc biệt", "special", {
    facet: "special",
    dropdown: true,
  }),
];

const laptopCategoryCriteria = [
  ...commonCategoryCriteria,
  makeCriterion("brand", "Hãng sản xuất", "brand", {
    facet: "brand",
    dropdown: true,
  }),
  makeCriterion("cpu", "CPU", "chipset", { facet: "cpu", dropdown: true }),
  makeCriterion("ram", "Dung lượng RAM", "ram", {
    facet: "ram",
    dropdown: true,
  }),
  makeCriterion("storage", "Ổ cứng", "storage", {
    facet: "storage",
    dropdown: true,
  }),
  makeCriterion("gpu", "Card đồ họa", "gpu", { facet: "gpu", dropdown: true }),
  makeCriterion("screen-size", "Kích thước màn hình", "screenSize", {
    facet: "screen-size",
    dropdown: true,
  }),
  makeCriterion("resolution", "Độ phân giải", "display", {
    facet: "resolution",
    dropdown: true,
  }),
  makeCriterion("usage", "Nhu cầu sử dụng", "usage", {
    facet: "usage",
    dropdown: true,
  }),
  makeCriterion("special", "Tính năng đặc biệt", "special", {
    facet: "special",
    dropdown: true,
  }),
];

const pcCategoryCriteria = [
  ...commonCategoryCriteria,
  makeCriterion("brand", "Hãng sản xuất", "brand", {
    facet: "brand",
    dropdown: true,
  }),
  makeCriterion("product-type", "Loại PC", "phoneType", {
    facet: "product-type",
    dropdown: true,
  }),
  makeCriterion("usage", "Nhu cầu sử dụng", "usage", {
    facet: "usage",
    dropdown: true,
  }),
  makeCriterion("cpu", "CPU", "chipset", { facet: "cpu", dropdown: true }),
  makeCriterion("ram", "Dung lượng RAM", "ram", {
    facet: "ram",
    dropdown: true,
  }),
  makeCriterion("storage", "Ổ cứng", "storage", {
    facet: "storage",
    dropdown: true,
  }),
  makeCriterion("gpu", "Card đồ họa", "gpu", {
    facet: "gpu",
    dropdown: true,
  }),
];

const monitorCategoryCriteria = [
  ...commonCategoryCriteria,
  makeCriterion("brand", "Hãng sản xuất", "brand", {
    facet: "brand",
    dropdown: true,
  }),
  makeCriterion("usage", "Nhu cầu sử dụng", "usage", {
    facet: "usage",
    dropdown: true,
  }),
  makeCriterion("screen-size", "Kích thước", "screenSize", {
    facet: "screen-size",
    dropdown: true,
  }),
  makeCriterion("resolution", "Độ phân giải", "display", {
    facet: "resolution",
    dropdown: true,
  }),
  makeCriterion("refresh-rate", "Tần số quét", "refresh", {
    facet: "refresh-rate",
    dropdown: true,
  }),
  makeCriterion("display", "Tấm nền", "display", {
    facet: "display",
    dropdown: true,
  }),
  makeCriterion("special", "Tính năng màn hình", "special", {
    facet: "special",
    dropdown: true,
  }),
];

const componentCategoryCriteria = [
  ...commonCategoryCriteria,
  makeCriterion("brand", "Hãng sản xuất", "brand", {
    facet: "brand",
    dropdown: true,
  }),
  makeCriterion("product-type", "Loại linh kiện", "phoneType", {
    facet: "product-type",
    dropdown: true,
  }),
  makeCriterion("cpu", "Dòng CPU", "chipset", {
    facet: "cpu",
    dropdown: true,
  }),
  makeCriterion("ram", "Dung lượng RAM", "ram", {
    facet: "ram",
    dropdown: true,
  }),
  makeCriterion("storage", "Dung lượng lưu trữ", "storage", {
    facet: "storage",
    dropdown: true,
  }),
  makeCriterion("gpu", "Dòng card màn hình", "gpu", {
    facet: "gpu",
    dropdown: true,
  }),
];

const printerCategoryCriteria = [
  ...commonCategoryCriteria,
  makeCriterion("brand", "Hãng sản xuất", "brand", {
    facet: "brand",
    dropdown: true,
  }),
  makeCriterion("product-type", "Loại máy in", "phoneType", {
    facet: "product-type",
    dropdown: true,
  }),
  makeCriterion("usage", "Nhu cầu sử dụng", "usage", {
    facet: "usage",
    dropdown: true,
  }),
  makeCriterion("network", "Kết nối", "network", {
    facet: "network",
    dropdown: true,
  }),
  makeCriterion("special", "Chức năng", "special", {
    facet: "special",
    dropdown: true,
  }),
];

const audioCategoryCriteria = [
  ...commonCategoryCriteria,
  makeCriterion("brand", "Hãng sản xuất", "brand", {
    facet: "brand",
    dropdown: true,
  }),
  makeCriterion("audio-type", "Loại sản phẩm", "audioType", {
    facet: "audio-type",
    dropdown: true,
  }),
  makeCriterion("audio-connection", "Kiểu kết nối", "network", {
    facet: "audio-connection",
    dropdown: true,
  }),
  makeCriterion("audio-feature", "Tính năng", "special", {
    facet: "audio-feature",
    dropdown: true,
  }),
  makeCriterion("audio-usage", "Nhu cầu sử dụng", "usage", {
    facet: "audio-usage",
    dropdown: true,
  }),
  makeCriterion("audio-design", "Thiết kế", "audioType", {
    facet: "audio-design",
    dropdown: true,
  }),
  makeCriterion("audio-power", "Công suất", "power", {
    facet: "audio-power",
    dropdown: true,
  }),
];

const optionGroup = (title, param, values) => ({
  title,
  param,
  options: values.map((value) =>
    typeof value === "string" ? { label: value, value } : value,
  ),
});

const detailedFilterGroups = {
  price: [
    {
      title: "Khoảng giá",
      options: [
        { label: "Dưới 2 triệu", priceMax: "2000000" },
        { label: "Từ 2 - 5 triệu", priceMin: "2000000", priceMax: "5000000" },
        { label: "Từ 5 - 10 triệu", priceMin: "5000000", priceMax: "10000000" },
        {
          label: "Từ 10 - 15 triệu",
          priceMin: "10000000",
          priceMax: "15000000",
        },
        {
          label: "Từ 15 - 20 triệu",
          priceMin: "15000000",
          priceMax: "20000000",
        },
        { label: "Trên 20 triệu", priceMin: "20000000" },
      ],
    },
  ],
  brand: [
    optionGroup(
      "Hãng sản xuất",
      "brand",
      PHONE_BRANDS.map((brand) => ({
        label: brand.name,
        value:
          knownPhoneBrands[String(brand.name || "").toLowerCase()] ||
          String(brand.name || "").toLowerCase(),
      })),
    ),
  ],
  storage: [
    optionGroup("Dung lượng lưu trữ", "storage", [
      "32GB",
      "64GB",
      "128GB",
      "256GB",
      "512GB",
      "1TB",
      "2TB",
    ]),
  ],
  ram: [
    optionGroup("Dung lượng RAM", "ram", [
      "2GB",
      "3GB",
      "4GB",
      "6GB",
      "8GB",
      "12GB",
      "16GB",
      "18GB",
      "24GB",
      "32GB",
      "64GB",
    ]),
  ],
  "screen-size": [
    optionGroup("Kích thước màn hình", "screenSize", [
      "Dưới 6 inch",
      "6 - 6.4 inch",
      "6.5 - 6.7 inch",
      "Trên 6.7 inch",
      "13 inch",
      "14 inch",
      "15.6 inch",
      "16 inch",
    ]),
  ],
  usage: [
    optionGroup("Nhu cầu sử dụng", "usage", [
      "Học tập - văn phòng",
      "Chơi game",
      "Đồ họa - thiết kế",
      "Chụp ảnh",
      "Pin lâu",
      "Mỏng nhẹ",
      "Cao cấp - sang trọng",
    ]),
  ],
  display: [
    optionGroup("Công nghệ màn hình", "display", [
      "LCD",
      "IPS LCD",
      "OLED",
      "AMOLED",
      "Super AMOLED",
      "Mini LED",
    ]),
  ],
  camera: [
    optionGroup("Tính năng camera", "camera", [
      "Chống rung quang học OIS",
      "Camera góc siêu rộng",
      "Camera tele",
      "Quay video 4K",
      "Quay video 8K",
    ]),
  ],
  "refresh-rate": [
    optionGroup("Tần số quét", "refreshRate", [
      "60Hz",
      "90Hz",
      "120Hz",
      "144Hz",
      "165Hz",
      "240Hz",
    ]),
  ],
  special: [
    optionGroup("Tính năng đặc biệt", "special", [
      "AI tích hợp",
      "Chống nước",
      "Sạc nhanh",
      "Sạc không dây",
      "NFC",
      "Màn hình gập",
      "Bảo mật vân tay",
    ]),
  ],
  nfc: [
    optionGroup("NFC", "nfc", [
      { label: "Có NFC", value: "true" },
      { label: "Không NFC", value: "false" },
    ]),
  ],
  network: [
    optionGroup("Kết nối mạng", "network", ["4G", "5G", "Wi-Fi 6", "Wi-Fi 7"]),
  ],
  chipset: [
    optionGroup("Chip xử lý", "chipset", [
      { label: "Apple A Series", value: "apple-a" },
      { label: "Apple M Series", value: "apple-m" },
      { label: "Snapdragon", value: "snapdragon" },
      { label: "MediaTek Dimensity", value: "dimensity" },
      { label: "MediaTek Helio", value: "helio" },
      { label: "Exynos", value: "exynos" },
      { label: "Google Tensor", value: "google-tensor" },
      { label: "Kirin", value: "kirin" },
      { label: "Unisoc", value: "unisoc" },
    ]),
  ],
  cpu: [
    optionGroup("Bộ vi xử lý", "cpu", [
      "Intel Core i3",
      "Intel Core i5",
      "Intel Core i7",
      "Intel Core Ultra 5",
      "Intel Core Ultra 7",
      "AMD Ryzen 5",
      "AMD Ryzen 7",
      "Apple M Series",
    ]),
  ],
  gpu: [
    optionGroup("Card đồ họa", "gpu", [
      "Đồ họa tích hợp",
      "NVIDIA GeForce RTX 3050",
      "NVIDIA GeForce RTX 4050",
      "NVIDIA GeForce RTX 4060",
      "NVIDIA GeForce RTX 4070",
      "AMD Radeon",
    ]),
  ],
  resolution: [
    optionGroup("Độ phân giải", "resolution", [
      "Full HD",
      "Full HD+",
      "2K",
      "2.5K",
      "3K",
      "4K",
    ]),
  ],
  "phone-type": [
    optionGroup("Loại sản phẩm / hệ điều hành", "phoneType", [
      "Android",
      "iOS",
      "Điện thoại gập",
      "Điện thoại phổ thông",
    ]),
  ],
  "product-type": [
    optionGroup("Loại sản phẩm", "productType", [
      "PC Gaming",
      "PC Văn phòng",
      "PC đồ họa",
      "PC AI",
      "CPU",
      "Mainboard",
      "RAM",
      "Ổ cứng SSD",
      "Ổ cứng HDD",
      "Card màn hình",
      "Nguồn máy tính",
      "Tản nhiệt",
      "Case máy tính",
      "Máy in laser",
      "Máy in phun",
      "Máy in đa năng",
    ]),
  ],
  "audio-feature": [
    optionGroup("Tính năng âm thanh", "audioFeature", [
      "Chống ồn chủ động ANC",
      "Xuyên âm",
      "Âm thanh không gian",
      "Kháng nước",
      "Micro đàm thoại",
    ]),
  ],
  "audio-connection": [
    optionGroup("Kiểu kết nối", "audioConnection", [
      "Bluetooth",
      "Có dây",
      "USB-C",
      "3.5mm",
      "Wi-Fi",
    ]),
  ],
  "audio-usage": [
    optionGroup("Nhu cầu sử dụng", "audioUsage", [
      "Nghe nhạc",
      "Chơi game",
      "Thể thao",
      "Hội họp",
      "Karaoke",
    ]),
  ],
  "audio-type": [
    optionGroup("Loại thiết bị âm thanh", "audioType", [
      "Bluetooth",
      "Có dây",
      "Chụp tai",
      "Nhét tai",
      "Loa Bluetooth",
      "Soundbar",
      "Micro",
      "Micro thu âm",
    ]),
  ],
  "audio-power": [
    optionGroup("Công suất", "audioPower", [
      "Dưới 10W",
      "10 - 30W",
      "30 - 100W",
      "Trên 100W",
    ]),
  ],
  "audio-design": [
    optionGroup("Thiết kế", "audioDesign", [
      "In-ear",
      "On-ear",
      "Over-ear",
      "True Wireless",
      "Di động",
      "Để bàn",
    ]),
  ],
  "audio-line": [
    optionGroup("Dòng sản phẩm", "audioLine", [
      "AirPods",
      "Galaxy Buds",
      "Sony WH",
      "JBL",
      "Marshall",
    ]),
  ],
  "audio-transmission": [
    optionGroup("Chuẩn truyền âm", "audioTransmission", [
      "SBC",
      "AAC",
      "aptX",
      "LDAC",
      "Lossless",
    ]),
  ],
};

const sortOptions = [
  { label: "Phổ biến", sort: "latest", icon: "popular" },
  {
    label: "Khuyến mãi HOT",
    sort: "hot_deal",
    icon: "hot",
    filter: "hot-deal",
  },
  { label: "Giá Thấp - Cao", sort: "price_asc", icon: "priceLow" },
  { label: "Giá Cao - Thấp", sort: "price_desc", icon: "priceHigh" },
];

const listingParamKeys = [
  "brand",
  "q",
  "keyword",
  "segment",
  "sort",
  "title",
  "filter",
  "facet",
  "inStock",
  "priceMin",
  "priceMax",
  "ram",
  "storage",
  "screenSize",
  "usage",
  "display",
  "camera",
  "refreshRate",
  "special",
  "nfc",
  "network",
  "chipset",
  "cpu",
  "gpu",
  "resolution",
  "phoneType",
  "productType",
  "audioFeature",
  "audioConnection",
  "audioUsage",
  "audioType",
  "audioPower",
  "audioDesign",
  "audioLine",
  "audioTransmission",
];

const setUrlParam = (params, key, value) => {
  const text = String(value ?? "").trim();
  if (text) params.set(key, text);
  else params.delete(key);
};

const applyListingParams = (path, category, page, overrides = {}) => {
  const url = new URL(path || "/", "https://cellphones.local");
  setUrlParam(
    url.searchParams,
    "category",
    Object.prototype.hasOwnProperty.call(overrides, "category")
      ? overrides.category
      : category,
  );
  listingParamKeys.forEach((key) => {
    setUrlParam(url.searchParams, key, getOverrideValue(overrides, page, key));
  });
  return `${url.pathname}${url.search}${url.hash}`;
};

const buildCategoryControlPath = (page, overrides = {}) => {
  const category =
    overrides.category ||
    getApiCategory(page) ||
    page.category ||
    page.keyword ||
    "Sản phẩm";
  const inferredBrand =
    page.brand ||
    (page.root === "category"
      ? getBrandFromText(page.keyword || page.title || page.slug)
      : "");
  const mergedOverrides = {
    ...overrides,
    brand: Object.prototype.hasOwnProperty.call(overrides, "brand")
      ? overrides.brand
      : inferredBrand,
  };
  const initialPath = buildCategoryPath(category, {
    category,
    brand: mergedOverrides.brand,
    q: getOverrideValue(mergedOverrides, page, "q"),
    keyword: getOverrideValue(mergedOverrides, page, "keyword"),
    segment: getOverrideValue(mergedOverrides, page, "segment"),
    sort: getOverrideValue(mergedOverrides, page, "sort"),
    title: getOverrideValue(mergedOverrides, page, "title"),
    filter: getOverrideValue(mergedOverrides, page, "filter"),
    facet: getOverrideValue(mergedOverrides, page, "facet"),
    inStock: getOverrideValue(mergedOverrides, page, "inStock"),
    priceMin: getOverrideValue(mergedOverrides, page, "priceMin"),
    priceMax: getOverrideValue(mergedOverrides, page, "priceMax"),
  });
  return applyListingParams(initialPath, category, page, mergedOverrides);
};

const buildListingControlPath = (page, overrides = {}, basePath = "") => {
  const category =
    overrides.category ||
    getApiCategory(page) ||
    page.category ||
    page.keyword ||
    "Sản phẩm";
  if (!basePath) return buildCategoryControlPath(page, overrides);
  return applyListingParams(basePath, category, page, overrides);
};

const getBrandBannerTracks = (profile = {}, banners = phoneCategoryBanners) => {
  const source = Array.isArray(banners) ? banners : [];
  const indexes = Array.isArray(profile.bannerIndexes)
    ? profile.bannerIndexes
    : [];
  let selected = indexes.map((index) => source[index]).filter(Boolean);
  if (!selected.length && profile.brand) {
    selected = source.filter(
      (banner) =>
        normalizeLabel(banner.brand) === normalizeLabel(profile.brand),
    );
  }
  if (!selected.length) selected = source;
  return [
    selected.filter((_, index) => index % 2 === 0),
    selected.filter((_, index) => index % 2 === 1),
  ].filter((track) => track.length > 0);
};

function PhoneBannerCarousel(props) {
  return <CategoryBannerCarousel {...props} />;
}

const isTabletNeedActive = (page = {}, item = {}) => {
  if (item.href && page.path === item.href) return true;
  if (item.usage && normalizeLabel(page.usage) === normalizeLabel(item.usage))
    return true;
  if (
    item.special &&
    normalizeLabel(page.special) === normalizeLabel(item.special)
  )
    return true;
  if (item.q && normalizeLabel(page.q) === normalizeLabel(item.q)) return true;
  return false;
};

const buildTabletNeedPath = (page, item = {}) => {
  if (item.href) return item.href;
  return buildListingControlPath(page, {
    ...resetPhoneListing,
    category: "Máy tính bảng",
    brand: "",
    q: item.q || "",
    usage: item.usage || "",
    special: item.special || "",
    keyword: item.label || "Máy tính bảng",
    title: item.label || "Máy tính bảng",
  });
};

const normalizeCriteria = (items = []) =>
  items.filter(Boolean).map((item, index) => {
    if (typeof item === "string") {
      const id = normalizeLabel(item).replace(/\s+/g, "-");
      return makeCriterion(id || `criterion-${index}`, item, "filter");
    }
    const id = item.id || item.facet || item.filter || `criterion-${index}`;
    const hasGroups = Boolean(
      detailedFilterGroups[id] || detailedFilterGroups[item.facet],
    );
    return { ...item, id, dropdown: item.dropdown ?? hasGroups };
  });

const getCategoryCriteriaForPage = (page = {}, apiCategory = "") => {
  const audioProfile = getAudioLandingProfile(page);
  if (audioProfile) {
    const profileCriteria = getAudioCategoryCriteriaForProfile(audioProfile);
    if (Array.isArray(profileCriteria) && profileCriteria.length)
      return normalizeCriteria(profileCriteria);
    return audioCategoryCriteria;
  }

  const key = normalizeLabel(apiCategory || getApiCategory(page));
  if (key === "may tinh bang" || key.includes("tablet"))
    return tabletCategoryCriteria;
  if (key === "laptop" || key.includes("macbook"))
    return laptopCategoryCriteria;
  if (key === "pc" || key.includes("may tinh de ban"))
    return pcCategoryCriteria;
  if (key.includes("man hinh")) return monitorCategoryCriteria;
  if (key.includes("linh kien")) return componentCategoryCriteria;
  if (key.includes("may in")) return printerCategoryCriteria;
  if (key === "dien thoai" || key.includes("smartphone"))
    return phoneCategoryCriteria;
  return phoneCategoryCriteria;
};

function ChipIcon({ name }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
  };

  switch (name) {
    case "filter":
      return (
        <svg {...common}>
          <path d="M4 5h16M7 12h10M10 19h4" />
        </svg>
      );
    case "truck":
      return (
        <svg {...common}>
          <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
        </svg>
      );
    case "new":
      return (
        <svg {...common}>
          <path d="M12 3v18M17 8l-5-5-5 5M5 21h14" />
        </svg>
      );
    case "price":
      return (
        <svg {...common}>
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "storage":
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 7h6M9 11h6M9 15h3" />
        </svg>
      );
    case "ram":
      return (
        <svg {...common}>
          <rect x="4" y="7" width="16" height="10" rx="2" />
          <path d="M8 3v4M12 3v4M16 3v4M8 17v4M12 17v4M16 17v4" />
        </svg>
      );
    case "screenSize":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case "usage":
      return (
        <svg {...common}>
          <path d="M12 3 4 7v6c0 5 3.5 7.5 8 8 4.5-.5 8-3 8-8V7zM9 12l2 2 4-5" />
        </svg>
      );
    case "display":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="12" rx="2" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      );
    case "camera":
      return (
        <svg {...common}>
          <path d="M6 7h3l1.5-2h3L15 7h3a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8V4m0 4h4M4 13a8 8 0 0 0 14.5 4.5L20 16v4m0-4h-4" />
        </svg>
      );
    case "hot":
      return (
        <svg {...common}>
          <path d="M12 21c4 0 7-2.7 7-6.6 0-2.3-1-4.2-3-5.9.2 2.5-1.3 3.4-1.3 3.4C15 8.4 12.4 5.5 9.7 3 10 7.1 5 8.7 5 14.4 5 18.3 8 21 12 21z" />
        </svg>
      );
    case "priceLow":
      return (
        <svg {...common}>
          <path d="M6 6h12M6 12h9M6 18h6M18 14l-3 3-3-3" />
        </svg>
      );
    case "priceHigh":
      return (
        <svg {...common}>
          <path d="M6 6h6M6 12h9M6 18h12M15 10l3-3 3 3" />
        </svg>
      );
    case "brand":
      return (
        <svg {...common}>
          <path d="M20 13 13 20 4 11V4h7z" />
          <circle cx="8.5" cy="8.5" r="1.5" />
        </svg>
      );
    case "network":
      return (
        <svg {...common}>
          <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01" />
        </svg>
      );
    case "chipset":
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <path d="M9 1v5M15 1v5M9 18v5M15 18v5M1 9h5M1 15h5M18 9h5M18 15h5" />
        </svg>
      );
    case "gpu":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <circle cx="10" cy="12" r="3" />
          <path d="M21 10h2v4h-2M5 18v3M9 18v3" />
        </svg>
      );
    case "phoneType":
    case "audioType":
      return (
        <svg {...common}>
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <path d="M10 5h4M11 18h2" />
        </svg>
      );
    case "power":
      return (
        <svg {...common}>
          <path d="m13 2-8 12h7l-1 8 8-12h-7z" />
        </svg>
      );
    case "special":
      return (
        <svg {...common}>
          <path d="m12 3 2.4 5 5.6.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.6-.8z" />
        </svg>
      );
    case "popular":
    default:
      return (
        <svg {...common}>
          <path d="m12 3 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7z" />
        </svg>
      );
  }
}

const getInfoBreadcrumbItems = (page = {}) => {
  if (Array.isArray(page.breadcrumbs) && page.breadcrumbs.length) {
    return page.breadcrumbs.map((item, index) => ({
      id: item.id || `${item.label || item.title || "breadcrumb"}-${index}`,
      label: item.label || item.title || String(item),
      href: item.href || "#",
    }));
  }

  const items = [];
  const category = getApiCategory(page);
  const currentLabel = page.title || page.keyword || category || "Thông tin";
  if (
    page.root === "category" &&
    category &&
    normalizeLabel(currentLabel) !== normalizeLabel(category)
  ) {
    items.push({
      id: `category-${normalizeLabel(category)}`,
      label: category,
      href: buildCategoryPath(category, {
        keyword: category,
        title: category,
        sort: "latest",
      }),
    });
  }
  items.push({
    id: `current-${normalizeLabel(currentLabel) || "page"}`,
    label: currentLabel,
    href: page.path || "#",
  });
  return items;
};

function InfoForm({ form }) {
  if (!form) return null;
  const fields = Array.isArray(form.fields) ? form.fields : [];
  return (
    <form
      className="info-local-form"
      onSubmit={(event) => event.preventDefault()}
    >
      <h3>{form.title}</h3>
      {fields.map((field, index) => {
        const normalizedField =
          typeof field === "string"
            ? { label: field, placeholder: field }
            : field;
        const fieldKey =
          normalizedField.label ||
          normalizedField.placeholder ||
          `field-${index}`;
        return (
          <label key={fieldKey}>
            <span>{normalizedField.label || normalizedField.placeholder}</span>
            {normalizedField.textarea ? (
              <textarea placeholder={normalizedField.placeholder} rows={4} />
            ) : (
              <input
                type={normalizedField.type || "text"}
                placeholder={normalizedField.placeholder}
              />
            )}
          </label>
        );
      })}
      {form.helper && <p>{form.helper}</p>}
      <button type="submit">{form.button || "Gửi thông tin"}</button>
    </form>
  );
}

function InfoSection({ section }) {
  return (
    <section className="info-section-card">
      <h2>{section.title}</h2>
      {section.body && <p>{section.body}</p>}
      {section.bullets?.length > 0 && (
        <ul className="info-bullet-list">
          {section.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {section.steps?.length > 0 && (
        <ol className="info-step-list">
          {section.steps.map((item, index) => (
            <li key={item}>
              <span>{index + 1}</span>
              <p>{item}</p>
            </li>
          ))}
        </ol>
      )}
      {section.cards?.length > 0 && (
        <div className="info-mini-card-grid">
          {section.cards.map((card) => (
            <article className="info-mini-card" key={card.title}>
              <strong>{card.title}</strong>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
      )}
      {section.table?.length > 0 && (
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
  const currentPart = page.params?.get?.("part") || "";
  const currentHref = currentPart
    ? `${page.path}?part=${currentPart}`
    : page.path;
  return (
    <div className="info-clone-layout">
      <aside className="info-clone-sidebar" aria-label="Menu nội dung footer">
        {infoNavigationGroups.map((group) => (
          <nav key={group.title}>
            <h2>{group.title}</h2>
            {group.links.map(([label, href]) => (
              <a
                className={
                  href === currentHref || href === page.path ? "active" : ""
                }
                href={href}
                key={href}
              >
                {label}
              </a>
            ))}
          </nav>
        ))}
      </aside>
      <main className="info-clone-main">
        <article
          className={`info-clone-hero info-clone-hero-${content.tone || "red"}`}
        >
          <div>
            <span>{content.eyebrow || page.eyebrow}</span>
            <h2>{content.title || page.title}</h2>
            <p>{content.description || page.description}</p>
            {content.badges?.length > 0 && (
              <div className="info-route-badges">
                {content.badges.map((badge) => (
                  <em key={badge}>{badge}</em>
                ))}
              </div>
            )}
          </div>
          <div className="info-clone-badge" aria-hidden="true">
            S
          </div>
        </article>
        {content.stats?.length > 0 && (
          <div className="info-kpi-grid">
            {content.stats.map((stat) => (
              <div
                className="info-kpi-card"
                key={`${stat.value}-${stat.label}`}
              >
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        )}
        {content.sections?.map((section) => (
          <InfoSection section={section} key={section.title} />
        ))}
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
            <span>{card.cta || "Xem thêm"} ›</span>
          </a>
        ))}
      </aside>
    </div>
  );
}

function FooterLandingPage({ page, profile }) {
  const currentPart = page.params?.get?.("part") || "";
  const currentHref = currentPart
    ? `${page.path}?part=${currentPart}`
    : page.path;
  return (
    <section
      className={`footer-landing-page footer-landing-${profile.tone || "red"}`}
    >
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
              {profile.cta?.href && (
                <a href={profile.cta.href}>
                  {profile.cta.label || "Xem chi tiết"}
                </a>
              )}
            </div>
          </div>
          <div className="footer-landing-brand-card" aria-hidden="true">
            <strong>cellphone</strong>
            <span>S</span>
          </div>
        </article>
        {profile.tabs?.length > 0 && (
          <div className="footer-landing-tabs" aria-label="Mục nội dung">
            {profile.tabs.map((tab, index) => (
              <a href={`#footer-section-${index + 1}`} key={tab}>
                {tab}
              </a>
            ))}
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
                  {profile.highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            )}
            {profile.sections?.map((section, sectionIndex) => (
              <section
                className="footer-landing-card"
                key={section.title}
                id={`footer-section-${sectionIndex + 1}`}
              >
                <h2>{section.title}</h2>
                <div className="footer-landing-step-list">
                  {(section.items || []).map((item, index) => (
                    <div key={item}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
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
                <InfoForm form={profile.form} />
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
                    <a
                      className={
                        href === currentHref || href === page.path
                          ? "active"
                          : ""
                      }
                      href={href}
                      key={href}
                    >
                      {label}
                    </a>
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

const phoneNeedItems = [
  {
    label: "Điện thoại chơi game",
    segment: "game",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Web/icon/mobile-gamning.png",
  },
  {
    label: "Điện thoại pin trâu",
    segment: "pin",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Web/icon/mobile-pin.png",
  },
  {
    label: "Điện thoại 5G",
    segment: "5g",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Web/icon/mobile-5g_1.png",
  },
  {
    label: "Điện thoại chụp ảnh đẹp",
    segment: "camera",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Web/icon/mobile-chup-anh.png",
  },
  {
    label: "Điện thoại gập",
    segment: "gap",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Web/icon/mobile-gap_1.png",
  },
  {
    label: "Điện thoại AI",
    segment: "ai",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/dien-thoai-ai-icon-cate.png",
  },
  {
    label: "Điện thoại phổ thông",
    segment: "popular",
    image:
      "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/dien-thoai-pho-thong-icon-cate.png",
  },
];

const tabletNeedItems = [
  {
    label: "Cho trẻ em",
    usage: "Cho trẻ em",
    href: "/bo-loc/may-tinh-bang-cho-tre-em",
    image:
      "https://cdn2.cellphones.com.vn/x/media/catalog/product/m/a/may-doc-sach-kindle-paperwhite-5-kids-16gb_1_.png",
  },
  {
    label: "Chơi game",
    usage: "Chơi game",
    image:
      "https://cdn2.cellphones.com.vn/x/media/catalog/product/m/a/may-tinh-bang-xiaomi-poco-pad-x1-4.jpg",
  },
  {
    label: "Đồ họa - Sáng tạo",
    usage: "Đồ họa - thiết kế",
    image:
      "https://cdn2.cellphones.com.vn/x/media/catalog/product/l/e/lenovo-yoga-tab-tb710-4_1.jpg",
  },
  {
    label: "Học tập - văn phòng",
    usage: "Học tập - văn phòng",
    image:
      "https://cdn2.cellphones.com.vn/x/media/catalog/product/i/m/image_1562.png",
  },
  {
    label: "Máy tính bảng AI",
    special: "AI tích hợp",
    href: "/tablet/ai.html",
    image:
      "https://cdn2.cellphones.com.vn/x/media/catalog/product/h/o/honnor-pad-10.jpg",
  },
  {
    label: "Máy đọc sách",
    q: "Máy đọc sách",
    href: "/tablet/may-doc-sach.html",
    image:
      "https://cdn2.cellphones.com.vn/x/media/catalog/product/m/a/may-doc-sach-kindle-new-2024-gen-11-16gb-khong-quang-cao.png",
  },
];

const phoneFaqs = [
  [
    "Có nên mua điện thoại trả góp không? Lợi ích và rủi ro?",
    "Mua trả góp giúp chia nhỏ chi phí và sở hữu máy sớm hơn. Bạn nên so sánh tổng số tiền phải trả, phí chuyển đổi, lãi suất và chọn kỳ hạn phù hợp với thu nhập để tránh áp lực thanh toán.",
  ],
  [
    "Nên mua iPhone hay điện thoại Android? Ưu nhược điểm của từng loại?",
    "iPhone nổi bật với hệ sinh thái đồng bộ, cập nhật lâu dài và trải nghiệm ổn định. Android đa dạng mẫu mã, mức giá và khả năng tùy biến; lựa chọn phù hợp phụ thuộc ngân sách và hệ sinh thái bạn đang dùng.",
  ],
  [
    'Điện thoại nào có pin "trâu" nhất, dùng được lâu nhất?',
    "Hãy ưu tiên máy có pin từ 5.000 mAh, chip tiết kiệm điện và màn hình tối ưu. Thời lượng thực tế còn phụ thuộc độ sáng, tần số quét, sóng di động và thói quen chơi game hoặc quay video.",
  ],
  [
    "Điện thoại nào chơi game mượt nhất hiện nay?",
    "Một chiếc máy chơi game tốt cần chip hiệu năng cao, RAM đủ lớn, tản nhiệt ổn định, màn hình tần số quét cao và pin lớn. Bộ lọc Nhu cầu sử dụng sẽ giúp bạn thu hẹp danh sách nhanh hơn.",
  ],
];

const categorySupportProfiles = {
  phone: {
    label: "điện thoại",
    newsPattern: /điện thoại|smartphone|honor|xiaomi|iphone|android/i,
    faqs: phoneFaqs,
    answers: [
      {
        author: "Minh Anh",
        question:
          "Điện thoại tầm trung cần bao nhiêu RAM để dùng ổn định lâu dài?",
        answer:
          "Với nhu cầu phổ thông, 8GB RAM là mức cân bằng tốt. Nếu thường xuyên chơi game hoặc chỉnh sửa video, bạn nên ưu tiên 12GB RAM và bộ nhớ từ 256GB.",
      },
      {
        author: "Hoàng Nam",
        question: "Mua điện thoại có cần ưu tiên sạc nhanh không?",
        answer:
          "Sạc nhanh hữu ích khi bạn thường xuyên di chuyển. Tuy nhiên, hãy cân nhắc đồng thời dung lượng pin, khả năng tối ưu điện năng và bộ sạc chính hãng tương thích.",
      },
    ],
  },
  tablet: {
    label: "máy tính bảng",
    newsPattern: /máy tính bảng|tablet|ipad|galaxy tab|matepad|pad/i,
    faqs: [
      [
        "Máy tính bảng học tập cần bao nhiêu RAM?",
        "Nhu cầu học trực tuyến, đọc tài liệu và làm việc văn phòng nên chọn tối thiểu 6GB RAM. Với đa nhiệm, đồ họa hoặc chơi game, mức 8GB đến 12GB sẽ ổn định hơn.",
      ],
      [
        "Nên chọn máy tính bảng Wi-Fi hay có 4G/5G?",
        "Bản Wi-Fi phù hợp khi chủ yếu dùng tại nhà hoặc trường học. Bản 4G/5G linh hoạt hơn khi thường xuyên di chuyển nhưng có giá cao hơn và cần thêm chi phí dữ liệu di động.",
      ],
      [
        "Kích thước màn hình tablet nào phù hợp?",
        "Màn hình 8 đến 9 inch gọn nhẹ; 10 đến 11 inch cân bằng giữa giải trí và học tập; từ 12 inch phù hợp làm việc, vẽ và sử dụng kèm bàn phím.",
      ],
      [
        "Máy tính bảng cho trẻ em cần lưu ý gì?",
        "Nên ưu tiên màn hình có chế độ bảo vệ mắt, thời lượng pin tốt, thân máy bền và tính năng kiểm soát nội dung hoặc thời gian sử dụng của phụ huynh.",
      ],
    ],
    answers: [
      {
        author: "Thu Hà",
        question: "Tablet 4GB RAM còn phù hợp cho học online không?",
        answer:
          "Máy 4GB RAM vẫn đáp ứng học online và đọc tài liệu cơ bản. Nếu muốn dùng lâu dài, mở nhiều ứng dụng hoặc chia đôi màn hình, bạn nên chọn từ 6GB RAM.",
      },
      {
        author: "Gia Bảo",
        question: "Có nên mua thêm bút và bàn phím cho máy tính bảng?",
        answer:
          "Bút phù hợp ghi chú và vẽ; bàn phím hữu ích khi soạn thảo dài. Bạn nên kiểm tra đúng chuẩn kết nối và danh sách thiết bị tương thích trước khi mua.",
      },
    ],
  },
  laptop: {
    label: "laptop",
    newsPattern: /laptop|macbook|notebook|intel|amd|windows/i,
    faqs: [
      [
        "Laptop văn phòng nên chọn cấu hình nào?",
        "Bạn nên ưu tiên Core i5 hoặc Ryzen 5, RAM từ 16GB và SSD từ 512GB để làm việc đa nhiệm ổn định trong nhiều năm.",
      ],
      [
        "Laptop học sinh, sinh viên có cần card đồ họa rời?",
        "Các ngành văn phòng, kinh tế hoặc học trực tuyến không bắt buộc GPU rời. Đồ họa, kiến trúc, dựng phim và game nên chọn GPU phù hợp với phần mềm sử dụng.",
      ],
      [
        "Nên chọn màn hình laptop 14 inch hay 16 inch?",
        "Màn hình 14 inch dễ mang theo; 15.6 đến 16 inch cho không gian làm việc rộng hơn. Hãy cân đối thêm trọng lượng, độ phân giải và thời lượng pin.",
      ],
      [
        "Laptop có nâng cấp RAM và SSD được không?",
        "Khả năng nâng cấp phụ thuộc từng model. Bạn nên xem thông số khe cắm, dung lượng tối đa và điều kiện bảo hành trước khi nâng cấp.",
      ],
    ],
    answers: [
      {
        author: "Quốc Huy",
        question: "RAM 8GB có đủ dùng laptop văn phòng không?",
        answer:
          "RAM 8GB đủ cho tác vụ nhẹ, nhưng 16GB sẽ thoải mái hơn khi mở nhiều tab trình duyệt, họp trực tuyến và sử dụng bộ ứng dụng văn phòng cùng lúc.",
      },
      {
        author: "Ngọc Linh",
        question: "Nên ưu tiên CPU hay màn hình khi mua laptop học tập?",
        answer:
          "Hãy chọn CPU đủ cho ngành học trước, sau đó ưu tiên màn hình IPS độ phân giải Full HD trở lên để đọc tài liệu lâu và làm việc dễ chịu hơn.",
      },
    ],
  },
  pc: {
    label: "PC và màn hình",
    newsPattern: /pc|máy tính|màn hình|monitor|gaming|gpu|cpu/i,
    faqs: [
      [
        "Nên mua PC đồng bộ hay tự chọn linh kiện?",
        "PC đồng bộ dễ bảo hành và cài đặt; máy tự chọn linh kiện linh hoạt hơn về hiệu năng và khả năng nâng cấp. Lựa chọn phụ thuộc kinh nghiệm và nhu cầu sử dụng.",
      ],
      [
        "PC văn phòng cần bao nhiêu RAM và SSD?",
        "Cấu hình phổ biến nên có tối thiểu 16GB RAM và SSD 512GB để khởi động nhanh, chạy đa nhiệm và lưu trữ tài liệu thuận tiện.",
      ],
      [
        "Chọn màn hình bao nhiêu Hz là hợp lý?",
        "Màn hình 60 đến 75Hz phù hợp văn phòng; 100 đến 165Hz cho chuyển động mượt và chơi game; nhu cầu thi đấu có thể cân nhắc tần số cao hơn.",
      ],
      [
        "Màn hình có cần tương thích với card đồ họa không?",
        "Bạn cần kiểm tra cổng HDMI hoặc DisplayPort, độ phân giải và tần số quét tối đa mà card đồ họa có thể xuất để khai thác đúng khả năng màn hình.",
      ],
    ],
    answers: [
      {
        author: "Đức Long",
        question: "PC không có card đồ họa rời có dùng được không?",
        answer:
          "PC dùng đồ họa tích hợp vẫn đáp ứng văn phòng, học tập và giải trí nhẹ. Game nặng, dựng hình hoặc xử lý video nên có card đồ họa rời.",
      },
      {
        author: "Thanh Tùng",
        question: "Màn hình 2K có cần card đồ họa mạnh không?",
        answer:
          "Làm việc và xem nội dung 2K không đòi hỏi GPU quá mạnh. Nếu chơi game 2K ở tần số quét cao, bạn cần card đồ họa đủ hiệu năng cho trò chơi và mức FPS mong muốn.",
      },
    ],
  },
  accessory: {
    label: "phụ kiện và thiết bị âm thanh",
    newsPattern: /phụ kiện|tai nghe|loa|đồng hồ|sạc|cáp|airpods/i,
    faqs: [
      [
        "Làm sao chọn phụ kiện tương thích với thiết bị?",
        "Hãy kiểm tra model, chuẩn cổng kết nối, công suất, kích thước và danh sách thiết bị được nhà sản xuất hỗ trợ trước khi đặt mua.",
      ],
      [
        "Có nên dùng sạc và cáp công suất cao hơn?",
        "Thiết bị chỉ nhận công suất trong giới hạn hỗ trợ. Bạn có thể dùng bộ sạc công suất cao hơn nếu sản phẩm đạt chuẩn an toàn và hỗ trợ đúng giao thức sạc.",
      ],
      [
        "Tai nghe Bluetooth cần chú ý thông số nào?",
        "Bạn nên quan tâm độ vừa vặn, thời lượng pin, codec, khả năng chống ồn, độ trễ và hệ sinh thái thiết bị đang sử dụng.",
      ],
    ],
    answers: [
      {
        author: "Phương Vy",
        question:
          "Củ sạc USB-C có dùng chung cho điện thoại và tablet được không?",
        answer:
          "Có thể nếu bộ sạc hỗ trợ đúng chuẩn PD hoặc giao thức của thiết bị. Công suất thực tế sẽ được thiết bị tự thương lượng trong giới hạn an toàn.",
      },
      {
        author: "Tuấn Kiệt",
        question: "Tai nghe chống ồn có phù hợp để gọi điện không?",
        answer:
          "Có, nhưng chất lượng cuộc gọi còn phụ thuộc hệ thống micro và thuật toán lọc tiếng gió. Bạn nên xem thêm thông số micro và đánh giá sử dụng thực tế.",
      },
    ],
  },
  appliance: {
    label: "điện máy và gia dụng",
    newsPattern: /điện máy|gia dụng|tivi|tủ lạnh|máy giặt|máy lạnh|robot/i,
    faqs: [
      [
        "Nên chọn thiết bị gia dụng theo công suất hay diện tích?",
        "Bạn nên dựa trên diện tích phòng, số người sử dụng và tần suất vận hành, sau đó mới so sánh công suất và mức tiêu thụ điện.",
      ],
      [
        "Sản phẩm Inverter có tiết kiệm điện hơn không?",
        "Công nghệ Inverter giúp thiết bị duy trì công suất ổn định và thường tiết kiệm điện khi sử dụng trong thời gian dài, nhưng hiệu quả còn phụ thuộc thói quen dùng.",
      ],
      [
        "Cần lưu ý gì về lắp đặt và bảo hành?",
        "Hãy kiểm tra kích thước, nguồn điện, vị trí lắp đặt, phí vận chuyển và điều kiện bảo hành tại khu vực trước khi mua thiết bị cỡ lớn.",
      ],
    ],
    answers: [
      {
        author: "Hải Yến",
        question: "Gia đình bốn người nên chọn tủ lạnh dung tích bao nhiêu?",
        answer:
          "Thông thường dung tích khoảng 300 đến 450 lít là phù hợp. Gia đình có thói quen trữ thực phẩm nhiều có thể chọn dung tích lớn hơn.",
      },
      {
        author: "Văn Khánh",
        question: "Máy lạnh bao nhiêu HP phù hợp phòng ngủ?",
        answer:
          "Phòng dưới khoảng 15m² thường phù hợp máy 1HP; phòng 15 đến 20m² có thể chọn 1.5HP. Nắng, trần cao và số người dùng cũng ảnh hưởng công suất cần thiết.",
      },
    ],
  },
};

const normalizeLabel = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

const getBrandFromText = (value = "") => {
  const key = normalizeLabel(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const words = key.split(/\s+/).filter(Boolean);
  const direct = words.find((word) => knownPhoneBrands[word]);
  if (direct) return knownPhoneBrands[direct];
  const joined = words.join(" ");
  if (joined.includes("iphone") || joined.includes("apple")) return "apple";
  if (joined.includes("galaxy") || joined.includes("samsung")) return "samsung";
  if (
    joined.includes("redmi") ||
    joined.includes("poco") ||
    joined.includes("xiaomi")
  )
    return "xiaomi";
  return "";
};

const getTabletBrandFromText = (value = "") => {
  const key = normalizeLabel(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const words = key.split(/\s+/).filter(Boolean);
  const direct = words.find((word) => knownTabletBrands[word]);
  if (direct) return knownTabletBrands[direct];
  const joined = words.join(" ");
  if (joined.includes("ipad") || joined.includes("apple")) return "apple";
  if (joined.includes("galaxy tab") || joined.includes("samsung"))
    return "samsung";
  if (
    joined.includes("redmi pad") ||
    joined.includes("poco pad") ||
    joined.includes("xiaomi")
  )
    return "xiaomi";
  return "";
};

const getApiCategory = (page) => {
  const category = page.category || "";
  const key = normalizeLabel(category);
  if (key.includes("dien thoai")) return "Điện thoại";
  if (key.includes("tablet") || key.includes("may tinh bang"))
    return "Máy tính bảng";
  if (
    !page.categoryParam &&
    getBrandFromText(page.title || page.keyword || page.slug)
  )
    return "Điện thoại";
  return category;
};

const isPhoneLandingPage = (page = {}) => {
  const keyword = normalizeLabel(page.keyword || "");
  return (
    page.root === "category" &&
    getApiCategory(page) === "Điện thoại" &&
    !page.brand &&
    !page.q &&
    !page.segment &&
    (!keyword || keyword === "dien thoai")
  );
};

const isTabletLandingPage = (page = {}) => {
  const keyword = normalizeLabel(page.keyword || "");
  return (
    page.root === "category" &&
    getApiCategory(page) === "Máy tính bảng" &&
    !page.brand &&
    (page.path === "/tablet.html" ||
      (!page.q &&
        !page.segment &&
        (!keyword || keyword === "may tinh bang" || keyword === "tablet")))
  );
};

const getPhoneBrandLandingProfile = (page = {}) => {
  if (
    page.root !== "category" ||
    normalizeLabel(getApiCategory(page)) !== "dien thoai"
  )
    return null;
  const brandSource = page.brand || page.keyword || page.title || page.slug;
  const brand = getBrandFromText(brandSource) || normalizeLabel(brandSource);
  const profile = phoneBrandLandingProfiles[brand];
  return profile ? { ...profile, brand } : null;
};

const getTabletBrandLandingProfile = (page = {}) => {
  if (
    page.root !== "category" ||
    normalizeLabel(getApiCategory(page)) !== "may tinh bang"
  )
    return null;
  const brandSource = page.brand || page.keyword || page.title || page.slug;
  const brand =
    getTabletBrandFromText(brandSource) || normalizeLabel(brandSource);
  const profile = tabletBrandLandingProfiles[brand];
  return profile ? { ...profile, brand } : null;
};

const getTabletNeedLandingProfile = (page = {}) =>
  tabletNeedLandingProfiles[page.path] || null;
const getLaptopNeedLandingProfile = (page = {}) =>
  laptopNeedLandingProfiles[page.path] || null;

const getLaptopBrandLandingProfile = (page = {}) => {
  if (
    page.root !== "category" ||
    normalizeLabel(getApiCategory(page)) !== "laptop"
  )
    return null;
  const brandSource = page.brand || page.keyword || page.title || page.slug;
  const brand =
    getLaptopBrandFromText(brandSource) || normalizeLabel(brandSource);
  const profile = laptopBrandLandingProfiles[brand];
  return profile ? { ...profile, brand } : null;
};

const isLaptopLandingPage = (page = {}) => {
  const keyword = normalizeLabel(page.keyword || "");
  return (
    page.root === "category" &&
    normalizeLabel(getApiCategory(page)) === "laptop" &&
    (page.path === "/laptop.html" ||
      Boolean(getLaptopNeedLandingProfile(page)) ||
      Boolean(getLaptopBrandLandingProfile(page)) ||
      (!page.brand &&
        !page.q &&
        !page.segment &&
        (!keyword || keyword === "laptop")))
  );
};

const getCategorySupportProfile = (page = {}) => {
  const context = normalizeLabel(
    [
      getApiCategory(page),
      page.category,
      page.categoryParam,
      page.keyword,
      page.title,
    ]
      .filter(Boolean)
      .join(" "),
  );
  let profileKey = "";
  if (
    context.includes("may tinh bang") ||
    context.includes("tablet") ||
    context.includes("ipad")
  )
    profileKey = "tablet";
  else if (
    context.includes("dien thoai") ||
    context.includes("smartphone") ||
    context.includes("iphone")
  )
    profileKey = "phone";
  else if (
    context.includes("laptop") ||
    context.includes("macbook") ||
    context.includes("notebook")
  )
    profileKey = "laptop";
  else if (
    context.includes("pc") ||
    context.includes("man hinh") ||
    context.includes("may tinh de ban")
  )
    profileKey = "pc";
  else if (
    context.includes("phu kien") ||
    context.includes("tai nghe") ||
    context.includes("loa") ||
    context.includes("dong ho") ||
    context.includes("am thanh")
  )
    profileKey = "accessory";
  else if (
    context.includes("dien may") ||
    context.includes("gia dung") ||
    context.includes("tivi") ||
    context.includes("tu lanh") ||
    context.includes("may giat") ||
    context.includes("may lanh")
  )
    profileKey = "appliance";

  const baseProfile = categorySupportProfiles[profileKey];
  const fallbackLabel =
    page.title || getApiCategory(page) || "sản phẩm công nghệ";
  const fallbackProfile = {
    label: fallbackLabel,
    newsPattern: /công nghệ|sản phẩm|thiết bị|mua sắm/i,
    faqs: [
      [
        `Nên chọn ${fallbackLabel} theo tiêu chí nào?`,
        "Bạn nên bắt đầu từ nhu cầu sử dụng, ngân sách, thông số quan trọng và chính sách bảo hành, sau đó dùng bộ lọc để so sánh các sản phẩm phù hợp.",
      ],
      [
        `Mua ${fallbackLabel} online cần lưu ý gì?`,
        "Hãy kiểm tra tình trạng còn hàng, phiên bản, phụ kiện đi kèm, thời gian giao dự kiến và điều kiện đổi trả trước khi đặt hàng.",
      ],
      [
        `Có hỗ trợ trả góp cho ${fallbackLabel} không?`,
        "Tùy sản phẩm và chương trình đang áp dụng, bạn có thể chọn trả góp qua công ty tài chính hoặc thẻ tín dụng. Hãy xem tổng chi phí trước khi xác nhận.",
      ],
    ],
    answers: [
      {
        author: "Khánh An",
        question: `Làm sao biết ${fallbackLabel} còn hàng tại cửa hàng gần tôi?`,
        answer:
          "Bạn có thể chọn khu vực và dùng bộ lọc Sẵn hàng. Kết quả tồn kho được lấy từ hệ thống dữ liệu sản phẩm và nên được xác nhận lại trước khi đến cửa hàng.",
      },
      {
        author: "Bảo Trâm",
        question:
          "Sản phẩm mua online có được bảo hành như mua tại cửa hàng không?",
        answer:
          "Sản phẩm chính hãng vẫn áp dụng chính sách bảo hành tương ứng. Bạn nên giữ hóa đơn và kiểm tra điều kiện của từng hãng hoặc từng ngành hàng.",
      },
    ],
  };
  const profile = baseProfile || fallbackProfile;
  const brandProfile =
    getPhoneBrandLandingProfile(page) ||
    getTabletBrandLandingProfile(page) ||
    getLaptopNeedLandingProfile(page);
  const subject =
    brandProfile?.title ||
    (page.brand
      ? `${profile.label} ${page.title || page.brand}`
      : profile.label);
  return { ...profile, subject };
};

const prioritizeChildTabletProducts = (products = []) => {
  const preferredMatchers = [
    /lenovo idea tab pro gen 2/i,
    /xiaomi redmi pad 2 9\.7 inch.*4gb 64gb/i,
    /huawei matepad se 11 inch.*8gb 128gb/i,
    /honor pad 10/i,
    /samsung galaxy tab a11/i,
  ];
  const selected = [];
  const used = new Set();
  preferredMatchers.forEach((matcher) => {
    const match = products.find(
      (product, index) => !used.has(index) && matcher.test(product.name || ""),
    );
    if (!match) return;
    const index = products.indexOf(match);
    used.add(index);
    selected.push(match);
  });
  return [...selected, ...products.filter((_, index) => !used.has(index))];
};

const getOverrideValue = (overrides, page, key) =>
  Object.prototype.hasOwnProperty.call(overrides, key)
    ? overrides[key]
    : page[key];
const FILTER_VALUE_SEPARATOR = "|";
const parseFilterValues = (value = "") => [
  ...new Set(
    String(value || "")
      .split(FILTER_VALUE_SEPARATOR)
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];
const isSameFilterValue = (left = "", right = "") =>
  normalizeLabel(left) === normalizeLabel(right);
const includesFilterValue = (activeValue = "", candidate = "") =>
  parseFilterValues(activeValue).some((value) =>
    isSameFilterValue(value, candidate),
  );

const toggleFilterValue = (activeValue = "", candidate = "") => {
  const values = parseFilterValues(activeValue);
  const existingIndex = values.findIndex((value) =>
    isSameFilterValue(value, candidate),
  );
  if (existingIndex >= 0) values.splice(existingIndex, 1);
  else if (String(candidate || "").trim())
    values.push(String(candidate).trim());
  return values.join(FILTER_VALUE_SEPARATOR);
};

const getActiveDetailedValue = (page, item = {}) => {
  if (item.id === "price") {
    if (!page.priceMin && !page.priceMax) return "";

    const activeOption = getDetailedFilterGroups(item, page)
      .flatMap((group) => group.options || [])
      .find(
        (option) =>
          String(page.priceMin || "") === String(option.priceMin || "") &&
          String(page.priceMax || "") === String(option.priceMax || ""),
      );

    return activeOption?.label || "Khoảng giá đã chọn";
  }
  const paramKey = filterParamByFacet[item.facet || item.id];
  const activeValue = paramKey ? page[paramKey] || "" : "";
  if (!activeValue) return "";
  const activeValues = parseFilterValues(activeValue);
  if (activeValues.length > 1) return `${activeValues.length} lựa chọn`;
  const activeOption = getDetailedFilterGroups(item, page)
    .flatMap((group) => group.options || [])
    .find((option) =>
      isSameFilterValue(option.value || option.label || "", activeValues[0]),
    );
  return activeOption?.label || activeValues[0];
};

const getDetailedFilterGroups = (item = {}, page = {}) => {
  const audioProfile = getAudioLandingProfile(page);
  if (audioProfile) {
    const audioGroup =
      audioFilterGroups[item.id] || audioFilterGroups[item.facet];
    if (typeof audioGroup === "function") return audioGroup(audioProfile);
    if (audioGroup) return audioGroup;
  }

  const groups =
    detailedFilterGroups[item.id] || detailedFilterGroups[item.facet] || [];
  const isTabletPage = normalizeLabel(getApiCategory(page)) === "may tinh bang";
  const isLaptopPage = normalizeLabel(getApiCategory(page)) === "laptop";
  const isPhonePage = normalizeLabel(getApiCategory(page)) === "dien thoai";
  const categoryKey = normalizeLabel(getApiCategory(page));
  const isPcPage = categoryKey === "pc" || categoryKey.includes("may tinh de ban");
  const isMonitorPage = categoryKey.includes("man hinh");
  const isComponentPage = categoryKey.includes("linh kien");
  const isPrinterPage = categoryKey.includes("may in");

  if (
    (isPcPage || isMonitorPage || isComponentPage || isPrinterPage) &&
    item.id === "brand"
  ) {
    const brandNames = isMonitorPage
      ? ["ASUS", "LG", "Samsung", "MSI", "Xiaomi", "Dell", "AOC", "Gigabyte", "Acer", "Philips", "ViewSonic", "Lenovo"]
      : isPrinterPage
        ? ["HP", "Brother", "Canon", "Epson", "HPRT"]
        : ["ASUS", "Intel", "MSI", "Samsung", "Gigabyte", "ASRock", "Kingston", "DeepCool", "Corsair", "Adata", "Western Digital", "Seagate", "Transcend"];
    return [
      {
        title: "Hãng sản xuất",
        param: "brand",
        options: brandNames.map((value) => ({
          label: value,
          value: normalizeLabel(value),
        })),
      },
    ];
  }

  if ((isPcPage || isMonitorPage || isPrinterPage) && item.id === "usage") {
    const values = isMonitorPage
      ? ["Gaming", "Văn phòng", "Đồ họa - thiết kế", "Lập trình", "Màn hình di động"]
      : isPrinterPage
        ? ["Gia đình", "Văn phòng", "In ảnh", "In hóa đơn"]
        : ["Chơi game", "Học tập - văn phòng", "Đồ họa - thiết kế", "AI tích hợp"];
    return [
      {
        title: "Nhu cầu sử dụng",
        param: "usage",
        options: values.map((value) => ({ label: value, value })),
      },
    ];
  }

  if (isMonitorPage && item.id === "screen-size") {
    return [
      {
        title: "Kích thước màn hình",
        param: "screenSize",
        options: ["Dưới 24 inch", "24 inch", "27 inch", "32 inch", "Trên 32 inch"].map(
          (value) => ({ label: value, value }),
        ),
      },
    ];
  }

  if (isMonitorPage && item.id === "display") {
    return [
      {
        title: "Tấm nền",
        param: "display",
        options: ["IPS", "VA", "OLED", "Mini LED", "TN"].map((value) => ({
          label: value,
          value,
        })),
      },
    ];
  }

  if (item.id === "product-type") {
    const values = isPcPage
      ? ["PC Gaming", "PC Văn phòng", "PC đồ họa", "PC AI", "Máy tính đồng bộ", "All in One"]
      : isPrinterPage
        ? ["Máy in laser", "Máy in phun", "Máy in đa năng", "Máy in hóa đơn"]
        : ["CPU", "Mainboard", "RAM", "Ổ cứng SSD", "Ổ cứng HDD", "Card màn hình", "Nguồn máy tính", "Tản nhiệt", "Case máy tính"];
    return [
      {
        title: "Loại sản phẩm",
        param: "productType",
        options: values.map((value) => ({ label: value, value })),
      },
    ];
  }

  if (isPhonePage && item.id === "screen-size") return groups.slice(0, 1);
  if (isLaptopPage && item.id === "brand") {
    return [
      {
        title: "Hãng sản xuất",
        param: "brand",
        options: laptopBrandOrder
          .map((name) => LAPTOP_BRANDS.find((brand) => brand.name === name))
          .filter(Boolean)
          .map((brand) => ({
            label: brand.name,
            value:
              getLaptopBrandFromText(brand.name) || normalizeLabel(brand.name),
          })),
      },
    ];
  }
  if (isLaptopPage && item.id === "usage") {
    return [
      {
        title: "Nhu cầu sử dụng",
        param: "usage",
        options: [
          "Học tập - văn phòng",
          "Cao cấp - sang trọng",
          "Mỏng nhẹ",
          "Chơi game",
          "Đồ họa - thiết kế",
          "Sáng tạo nội dung",
        ].map((value) => ({ label: value, value })),
      },
    ];
  }
  if (isLaptopPage && item.id === "screen-size") {
    return [
      {
        title: "Kích thước màn hình laptop",
        param: "screenSize",
        options: ["13 inch", "14 inch", "15.6 inch", "16 inch"].map(
          (value) => ({ label: value, value }),
        ),
      },
    ];
  }
  if (isLaptopPage && item.id === "special") {
    return [
      {
        title: "Tính năng và công nghệ AI",
        param: "special",
        options: [
          ...[
            "Wi-Fi 6",
            "Wi-Fi 7",
            "Intel Evo",
            "Bảo mật vân tay",
            "Xoay gập 360 độ",
          ].map((value) => ({ label: value, value })),
          { label: "Màn hình cảm ứng", value: "Cảm ứng" },
          ...[
            "Nhận diện khuôn mặt",
            "Màn hình OLED",
            "MUX Switch",
            "Copilot",
            "Copilot+ PC",
            "Apple Intelligence",
          ].map((value) => ({ label: value, value })),
        ],
      },
    ];
  }
  if (isTabletPage && item.id === "brand") {
    const isReaderPage = page.path === "/tablet/may-doc-sach.html";
    const options = isReaderPage
      ? [
          { label: "Kindle", value: "kindle" },
          { label: "BOOX", value: "boox" },
        ]
      : TABLET_BRANDS.map((brand) => ({
          label: brand.name,
          value:
            getTabletBrandFromText(brand.name) || normalizeLabel(brand.name),
        }));
    return [{ title: "Hãng sản xuất", param: "brand", options }];
  }
  if (isTabletPage && item.id === "screen-size") {
    return [
      {
        title: "Kích thước màn hình máy tính bảng",
        param: "screenSize",
        options: [
          "8 inch",
          "9 inch",
          "10 inch",
          "11 inch",
          "12 inch",
          "13 inch",
        ].map((value) => ({ label: value, value })),
      },
    ];
  }
  if (isTabletPage && item.id === "usage") {
    return [
      {
        title: "Nhu cầu sử dụng",
        param: "usage",
        options: [
          "Học tập - văn phòng",
          "Giải trí",
          "Đồ họa - thiết kế",
          "Chơi game",
          "Cho trẻ em",
        ].map((value) => ({ label: value, value })),
      },
    ];
  }
  if (isTabletPage && item.id === "phone-type") {
    return [
      {
        title: "Hệ điều hành",
        param: "phoneType",
        options: ["iPadOS", "Android", "HarmonyOS"].map((value) => ({
          label: value,
          value,
        })),
      },
    ];
  }
  if (isTabletPage && item.id === "chipset") {
    return [
      {
        title: "Chip xử lý",
        param: "chipset",
        options: [
          { label: "Apple M Series", value: "apple-m" },
          { label: "Apple A Series", value: "apple-a" },
          { label: "Snapdragon", value: "snapdragon" },
          { label: "MediaTek Dimensity", value: "dimensity" },
          { label: "MediaTek Helio", value: "helio" },
          { label: "Exynos", value: "exynos" },
          { label: "Kirin", value: "kirin" },
          { label: "Unisoc", value: "unisoc" },
        ],
      },
    ];
  }
  if (item.id !== "chipset") return groups;

  const brand =
    page.brand || getBrandFromText(page.keyword || page.title || page.slug);
  const allowedChipsetsByBrand = {
    apple: ["apple-a"],
    samsung: ["snapdragon", "exynos"],
    google: ["google-tensor"],
    huawei: ["kirin", "snapdragon"],
  };
  const allowed = allowedChipsetsByBrand[normalizeLabel(brand)];
  if (!allowed) return groups;
  return groups.map((group) => ({
    ...group,
    options: group.options.filter((option) => allowed.includes(option.value)),
  }));
};

const buildDetailedFilterPath = (page, item = {}, group = {}, option = {}) => {
  const paramKey = group.param || filterParamByFacet[item.facet || item.id];
  const optionValue = option.value || option.label || "";

  const baseOverrides = {
    filter: page.filter,
    facet: "",
    sort: item.sort || page.sort || "latest",
    q: page.q,
  };
  const optionOverrides = option.overrides || {};
  const overrides = { ...baseOverrides, ...optionOverrides };

  if (paramKey)
    overrides[paramKey] = toggleFilterValue(page[paramKey], optionValue);
  if (option.q) overrides.q = option.q;
  if (option.priceMin || option.priceMax) {
    overrides.filter = page.filter || "price";
    overrides.facet = "";
    overrides.priceMin = option.priceMin || "";
    overrides.priceMax = option.priceMax || "";
  }
  return buildListingControlPath(page, overrides);
};

const isDetailedOptionActive = (page, group = {}, option = {}) => {
  if (option.priceMin || option.priceMax) {
    return (
      String(page.priceMin || "") === String(option.priceMin || "") &&
      String(page.priceMax || "") === String(option.priceMax || "")
    );
  }
  const paramKey = group.param;
  if (!paramKey) {
    return Object.entries(option.overrides || {}).every(
      ([key, value]) => String(page[key] || "") === String(value || ""),
    );
  }
  return includesFilterValue(
    page[paramKey],
    option.value || option.label || "",
  );
};

const clearDetailedFilterPath = (page, item = {}) => {
  const paramKey = filterParamByFacet[item.facet || item.id];
  return buildListingControlPath(page, {
    brand: item.id === "all" || paramKey === "brand" ? "" : page.brand,
    filter: item.id === "all" ? "" : page.filter,
    facet:
      item.id === "all" || item.id === "price" || item.facet ? "" : page.facet,
    priceMin: item.id === "all" || item.id === "price" ? "" : page.priceMin,
    priceMax: item.id === "all" || item.id === "price" ? "" : page.priceMax,
    ram: item.id === "all" || paramKey === "ram" ? "" : page.ram,
    storage: item.id === "all" || paramKey === "storage" ? "" : page.storage,
    screenSize:
      item.id === "all" || paramKey === "screenSize" ? "" : page.screenSize,
    usage: item.id === "all" || paramKey === "usage" ? "" : page.usage,
    display: item.id === "all" || paramKey === "display" ? "" : page.display,
    camera: item.id === "all" || paramKey === "camera" ? "" : page.camera,
    refreshRate:
      item.id === "all" || paramKey === "refreshRate" ? "" : page.refreshRate,
    special: item.id === "all" || paramKey === "special" ? "" : page.special,
    nfc: item.id === "all" || paramKey === "nfc" ? "" : page.nfc,
    network: item.id === "all" || paramKey === "network" ? "" : page.network,
    chipset: item.id === "all" || paramKey === "chipset" ? "" : page.chipset,
    cpu: item.id === "all" || paramKey === "cpu" ? "" : page.cpu,
    gpu: item.id === "all" || paramKey === "gpu" ? "" : page.gpu,
    resolution:
      item.id === "all" || paramKey === "resolution" ? "" : page.resolution,
    phoneType:
      item.id === "all" || paramKey === "phoneType" ? "" : page.phoneType,
    productType:
      item.id === "all" || paramKey === "productType"
        ? ""
        : page.productType,
    audioFeature:
      item.id === "all" || paramKey === "audioFeature" ? "" : page.audioFeature,
    audioConnection:
      item.id === "all" || paramKey === "audioConnection"
        ? ""
        : page.audioConnection,
    audioUsage:
      item.id === "all" || paramKey === "audioUsage" ? "" : page.audioUsage,
    audioType:
      item.id === "all" || paramKey === "audioType" ? "" : page.audioType,
    audioPower:
      item.id === "all" || paramKey === "audioPower" ? "" : page.audioPower,
    audioDesign:
      item.id === "all" || paramKey === "audioDesign" ? "" : page.audioDesign,
    audioLine:
      item.id === "all" || paramKey === "audioLine" ? "" : page.audioLine,
    audioTransmission:
      item.id === "all" || paramKey === "audioTransmission"
        ? ""
        : page.audioTransmission,
    q: item.id === "all" || paramKey === "q" ? "" : page.q,
  });
};

function InstallmentLandingPage() {
  const { products, loading } = useApiProducts(
    {
      category: "Điện thoại",
      include: "details",
      displayLimit: 10,
      fetchLimit: 60,
      sort: "hot_deal",
      inStock: true,
    },
    [],
  );

  return (
    <section className="installment-clone-page">
      <nav className="installment-sticky-tabs" aria-label="Menu trả góp">
        <div className="container installment-sticky-tabs-inner">
          {installmentAnchors.map(([id, label]) => (
            <a href={`#${id}`} key={id}>
              {label}
            </a>
          ))}
        </div>
      </nav>

      <div className="container installment-container">
        <header className="installment-title-row">
          <h1>
            Mua điện thoại trả góp 0% - 0 trả trước - 0 phí tại CellphoneS
          </h1>
        </header>

        <div className="installment-hero-grid" id="installment-program">
          <div className="installment-hero-left">
            <blockquote>
              Trả góp là phương thức mua sắm giúp chia nhỏ khoản thanh toán theo
              kỳ hạn, giảm áp lực tài chính khi mua sản phẩm công nghệ.
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
                    {method.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
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
            <p>
              Ưu đãi dành cho khách hàng sinh viên khi mua sắm sản phẩm công
              nghệ tại CellphoneS.
            </p>
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
            <a href="/category/dien-thoai?keyword=Điện thoại&category=Điện thoại&sort=hot_deal">
              Xem tất cả
            </a>
          </div>

          <div className="installment-category-tabs">
            {["Điện thoại", "Laptop", "Máy tính bảng", "Tivi", "Hàng cũ"].map(
              (item) => (
                <button
                  type="button"
                  className={item === "Điện thoại" ? "active" : ""}
                  key={item}
                >
                  {item}
                </button>
              ),
            )}
          </div>

          <div className="installment-brand-row">
            {installmentBrandFilters.map((brand, index) => (
              <button
                type="button"
                className={index === 0 ? "active" : ""}
                key={brand}
              >
                {brand}
              </button>
            ))}
          </div>

          <div className="installment-sort-row">
            <strong>Sắp xếp theo:</strong>
            {[
              "Phổ biến",
              "Khuyến mãi HOT",
              "Giá Thấp - Cao",
              "Giá Cao - Thấp",
            ].map((item, index) => (
              <button
                type="button"
                className={index === 0 ? "active" : ""}
                key={item}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="installment-product-grid" aria-busy={loading}>
            {loading ? (
              Array.from({ length: 10 }).map((_, index) => (
                <ProductCardSkeleton key={`installment-skeleton-${index}`} />
              ))
            ) : products.length ? (
              products.map((product) => (
                <ProductCard
                  product={product}
                  key={product.id || product.slug || product.name}
                />
              ))
            ) : (
              <div className="info-empty-result">
                Chưa có sản phẩm ưu đãi trả góp phù hợp.
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function PhoneCategoryIntro({ page }) {
  const orderedBrands = phoneBrandOrder
    .map((name) => PHONE_BRANDS.find((brand) => brand.name === name))
    .filter(Boolean);
  return (
    <section
      className="phone-category-intro"
      aria-labelledby="phone-category-title"
    >
      <PhoneBannerCarousel
        page={page}
        tracks={phoneCategoryBannerTracks}
        label="Khuyến mãi điện thoại nổi bật"
      />
      <h1 id="phone-category-title">Điện thoại</h1>
      <div
        className="phone-category-brand-grid"
        aria-label="Chọn thương hiệu điện thoại"
      >
        {orderedBrands.map((brand) => {
          const brandKey =
            knownPhoneBrands[normalizeLabel(brand.name)] ||
            normalizeLabel(brand.name);
          return (
            <a
              className="phone-category-brand-card"
              href={
                brandKey === "apple"
                  ? "/mobile/apple.html"
                  : buildListingControlPath(page, {
                      ...resetPhoneListing,
                      category: "Điện thoại",
                      brand: brandKey,
                      keyword: `Điện thoại ${brand.name}`,
                      title: `Điện thoại ${brand.name}`,
                    })
              }
              aria-label={`Xem điện thoại ${brand.name}`}
              key={brand.name}
            >
              <SafeBrandImage src={brand.logo} alt={brand.name} />
            </a>
          );
        })}
      </div>
      <h2>Chọn theo nhu cầu</h2>
      <div className="phone-category-needs-grid">
        {phoneNeedItems.map((item) => (
          <a
            className="phone-category-need-card"
            href={buildCategoryControlPath(page, {
              ...resetPhoneListing,
              category: "Điện thoại",
              brand: "",
              segment: item.segment,
              keyword: item.label,
              title: item.label,
            })}
            key={item.segment}
          >
            <img src={item.image} alt="" loading="lazy" />
            <span>{item.label}</span>
          </a>
        ))}
      </div>
      <PhoneWeekendSale />
    </section>
  );
}

function TabletCategoryIntro({ page, landingProfile = null }) {
  const bannerTracks = landingProfile
    ? getBrandBannerTracks(landingProfile, tabletCategoryBanners)
    : tabletCategoryBannerTracks;
  const title = landingProfile?.title || "Máy tính bảng giá rẻ";
  return (
    <section
      className="phone-category-intro tablet-category-intro"
      aria-labelledby="tablet-category-title"
    >
      <PhoneBannerCarousel
        page={page}
        tracks={bannerTracks}
        label="Khuyến mãi máy tính bảng nổi bật"
        category="Máy tính bảng"
      />
      <h1 id="tablet-category-title">{title}</h1>
      <div
        className="phone-category-brand-grid tablet-category-brand-grid"
        aria-label="Chọn thương hiệu máy tính bảng"
      >
        {TABLET_BRANDS.map((brand) => {
          const brandKey =
            getTabletBrandFromText(brand.name) || normalizeLabel(brand.name);
          return (
            <a
              className="phone-category-brand-card tablet-category-brand-card"
              href={
                tabletBrandRoutes[brandKey] ||
                buildCategoryControlPath(page, {
                  ...resetPhoneListing,
                  category: "Máy tính bảng",
                  brand: brandKey,
                  keyword: brand.name,
                  title: brand.name,
                })
              }
              aria-label={`Xem máy tính bảng ${brand.name}`}
              key={brand.name}
            >
              <SafeBrandImage src={brand.logo} alt={brand.name} />
            </a>
          );
        })}
      </div>
      <h2>Chọn theo nhu cầu</h2>
      <div className="phone-category-needs-grid tablet-category-needs-grid">
        {tabletNeedItems.map((item) => (
          <a
            className={`phone-category-need-card tablet-category-need-card ${isTabletNeedActive(page, item) ? "active" : ""}`}
            href={buildTabletNeedPath(page, item)}
            key={item.label}
          >
            <img src={item.image} alt="" loading="lazy" />
            <span>{item.label}</span>
          </a>
        ))}
      </div>
      <PhoneWeekendSale category="Máy tính bảng" />
    </section>
  );
}

function TabletNeedLandingIntro({ page, profile }) {
  const bannerTracks = getBrandBannerTracks(profile, tabletCategoryBanners);
  const brandPills = profile.brandPills || [];
  return (
    <section
      className={`tablet-need-standalone-intro ${bannerTracks.length >= 2 ? "has-banners" : "no-banners"}`}
      aria-labelledby="tablet-need-standalone-title"
    >
      {bannerTracks.length >= 2 && (
        <PhoneBannerCarousel
          page={page}
          tracks={bannerTracks}
          label={`Khuyến mãi ${profile.title}`}
          category="Máy tính bảng"
        />
      )}
      <h1 id="tablet-need-standalone-title">{profile.title}</h1>
      {brandPills.length > 0 && (
        <div
          className="tablet-reader-brand-pills"
          aria-label="Chọn hãng máy đọc sách"
        >
          {brandPills.map((item) => {
            const isActive =
              normalizeLabel(page.brand) === normalizeLabel(item.value);
            return (
              <a
                href={buildListingControlPath(page, {
                  brand: item.value,
                  filter: "",
                  facet: "",
                  sort: "latest",
                })}
                className={`${item.className || ""} ${isActive ? "active" : ""}`.trim()}
                aria-current={isActive ? "page" : undefined}
                key={item.value}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TabletVoucher() {
  return (
    <div className="category-voucher-card tablet-category-voucher-card">
      <strong>Ưu đãi &amp; voucher</strong>
      <div className="category-voucher-ticket">
        <span>Giảm 5%</span>
        <p>Voucher 5% tối đa 1 triệu cho sản phẩm iPad có hiển thị ưu đãi.</p>
        <button type="button">Thu thập</button>
      </div>
    </div>
  );
}

function TabletBrandIntro({ page, profile }) {
  const bannerTracks = getBrandBannerTracks(profile, tabletCategoryBanners);
  const series = profile.series || [];
  return (
    <section
      className={`phone-brand-intro tablet-brand-intro ${bannerTracks.length >= 2 ? "has-banners" : "no-banners"}`}
      aria-labelledby={`tablet-brand-title-${profile.brand}`}
    >
      {bannerTracks.length >= 2 && (
        <PhoneBannerCarousel
          page={page}
          tracks={bannerTracks}
          label={`Khuyến mãi ${profile.title}`}
          category="Máy tính bảng"
        />
      )}
      <h1 id={`tablet-brand-title-${profile.brand}`}>{profile.title}</h1>
      {series.length > 0 && (
        <div
          className="category-series-pills phone-brand-series-pills tablet-brand-series-pills"
          aria-label={`Dòng ${profile.title}`}
        >
          {series.map(([label, query]) => {
            const isActive = normalizeLabel(page.q) === normalizeLabel(query);
            return (
              <a
                href={buildListingControlPath(page, {
                  ...resetPhoneListing,
                  category: "Máy tính bảng",
                  brand: profile.brand,
                  q: query,
                  keyword: label,
                  title: profile.title,
                })}
                className={`category-series-pill ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                key={label}
              >
                {label}
              </a>
            );
          })}
        </div>
      )}
      {profile.showVoucher && <TabletVoucher />}
      {profile.showWeekendSale && (
        <PhoneWeekendSale category="Máy tính bảng" brand={profile.brand} />
      )}
    </section>
  );
}

function PhoneBrandIntro({ page, profile }) {
  const bannerTracks = getBrandBannerTracks(profile);
  return (
    <section
      className={`phone-brand-intro ${bannerTracks.length >= 2 ? "has-banners" : "no-banners"}`}
      aria-labelledby={`phone-brand-title-${profile.brand}`}
    >
      {bannerTracks.length >= 2 && (
        <PhoneBannerCarousel
          page={page}
          tracks={bannerTracks}
          label={`Khuyến mãi điện thoại ${profile.title}`}
        />
      )}
      <h1 id={`phone-brand-title-${profile.brand}`}>{profile.title}</h1>
      <div
        className="category-series-pills phone-brand-series-pills"
        aria-label={`Dòng ${profile.title}`}
      >
        {profile.series.map(([label, query]) => {
          const isActive = normalizeLabel(page.q) === normalizeLabel(query);
          return (
            <a
              href={buildListingControlPath(page, {
                ...resetPhoneListing,
                category: "Điện thoại",
                brand: profile.brand,
                q: query,
                keyword: label,
                title: profile.title,
              })}
              className={`category-series-pill ${isActive ? "active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              key={label}
            >
              {label}
            </a>
          );
        })}
      </div>
      {profile.showWeekendSale && <PhoneWeekendSale brand={profile.brand} />}
    </section>
  );
}

function CategorySupportFooter({ page }) {
  const [questionDraft, setQuestionDraft] = useState("");
  const [submittedQuestions, setSubmittedQuestions] = useState([]);
  const supportProfile = getCategorySupportProfile(page);
  const matchedNews = techNews.filter((article) =>
    supportProfile.newsPattern.test(article.title),
  );
  const categoryNews = matchedNews.slice(0, 3);
  const handleQuestionSubmit = (event) => {
    event.preventDefault();
    const question = questionDraft.trim();
    if (!question) return;
    setSubmittedQuestions((items) => [
      { id: `${Date.now()}-${question}`, question },
      ...items,
    ]);
    setQuestionDraft("");
  };
  return (
    <section
      className="phone-category-footer"
      aria-label={`Thông tin tư vấn ${supportProfile.subject}`}
    >
      <div
        className={`phone-category-bottom-grid ${categoryNews.length ? "" : "single-column"}`}
      >
        <section
          className="phone-category-faq"
          aria-labelledby="category-support-faq-title"
        >
          <h2>Câu hỏi thường gặp</h2>
          <div className="phone-category-faq-list">
            {supportProfile.faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        {categoryNews.length > 0 && (
          <aside
            className="phone-category-news"
            aria-labelledby="category-support-news-title"
          >
            <div className="phone-category-news-head">
              <h2>Tin tức {supportProfile.label}</h2>
              <a href="/tin-tuc/tin-cong-nghe">Xem tất cả</a>
            </div>
            <div className="phone-category-news-list">
              {categoryNews.map((article) => (
                <a href={`/tin-tuc/${article.id}`} key={article.id}>
                  <img src={article.thumbnail} alt="" loading="lazy" />
                  <span>{article.title}</span>
                </a>
              ))}
            </div>
          </aside>
        )}
      </div>
      <section
        className="phone-category-qa"
        aria-labelledby="category-support-qa-title"
      >
        <h2>Hỏi và đáp</h2>
        <div className="phone-category-qa-inner">
          <img
            className="phone-category-qa-mascot"
            src="https://cdn2.cellphones.com.vn/insecure/rs:fill:160:0/q:90/plain/https://cellphones.com.vn/media/wysiwyg/ant-hello-2025.png"
            alt="Linh vật CellphoneS"
            loading="lazy"
          />
          <div className="phone-category-qa-copy">
            <h3>Hãy đặt câu hỏi cho chúng tôi</h3>
            <p>
              CellphoneS sẽ phản hồi trong vòng 1 giờ. Nếu Quý khách gửi câu hỏi
              sau 22h, chúng tôi sẽ trả lời vào sáng hôm sau.
            </p>
            <p>Vui lòng đặt câu hỏi để nhận được cập nhật mới nhất.</p>
            <form
              className="phone-category-question-form"
              onSubmit={handleQuestionSubmit}
            >
              <label className="sr-only" htmlFor="category-support-question">
                Câu hỏi của bạn
              </label>
              <input
                id="category-support-question"
                value={questionDraft}
                onChange={(event) => setQuestionDraft(event.target.value)}
                placeholder="Viết câu hỏi của bạn tại đây"
                maxLength={500}
                required
              />
              <button type="submit">Gửi câu hỏi ➤</button>
            </form>
          </div>
        </div>
        <div className="phone-category-submitted-questions phone-category-answered-questions">
          {supportProfile.answers.map((item) => (
            <article key={item.question}>
              <span>{item.author.charAt(0).toUpperCase()}</span>
              <div>
                <strong>{item.author}</strong>
                <small>Đã mua hàng</small>
                <p>{item.question}</p>
                <div className="category-answer-reply">
                  <div>
                    <strong>CellphoneS</strong>
                    <small>Đã trả lời</small>
                  </div>
                  <p>{item.answer}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
        {submittedQuestions.length > 0 && (
          <div
            className="phone-category-submitted-questions"
            aria-live="polite"
          >
            {submittedQuestions.map((item) => (
              <article key={item.id}>
                <span>B</span>
                <div>
                  <strong>Bạn</strong>
                  <small>Vừa xong</small>
                  <p>{item.question}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function ListingContent({ page }) {
  const apiCategory = getApiCategory(page);
  const isCategoryPage = page.root === "category";
  const normalizedApiCategory = normalizeLabel(apiCategory);
  const computerCategoryType =
    normalizedApiCategory === "pc" || normalizedApiCategory.includes("may tinh de ban")
      ? "pc"
      : normalizedApiCategory.includes("man hinh")
        ? "monitor"
        : normalizedApiCategory.includes("linh kien")
          ? "components"
          : normalizedApiCategory.includes("may in")
            ? "printer"
            : "";
  const isPhoneLanding = isPhoneLandingPage(page);
  const audioLandingProfile = getAudioLandingProfile(page);
  const isAudioLanding = Boolean(audioLandingProfile);
  const tabletNeedLandingProfile = getTabletNeedLandingProfile(page);
  const isTabletLanding =
    isTabletLandingPage(page) || Boolean(tabletNeedLandingProfile);
  const isStandaloneTabletNeedPage = Boolean(
    tabletNeedLandingProfile?.standalone,
  );
  const isChildTabletNeedPage =
    normalizeLabel(tabletNeedLandingProfile?.usage) === "cho tre em";
  const laptopNeedLandingProfile = getLaptopNeedLandingProfile(page);
  const laptopBrandLandingProfile = getLaptopBrandLandingProfile(page);
  const laptopLandingProfile =
    laptopBrandLandingProfile || laptopNeedLandingProfile;
  const isLaptopLanding = isLaptopLandingPage(page);
  const isLaptopAiPage = Boolean(laptopNeedLandingProfile?.aiLanding);
  const laptopIntroBannerTracks = laptopBrandLandingProfile
    ? getBrandBannerTracks(laptopBrandLandingProfile, laptopCategoryBanners)
    : laptopNeedLandingProfile
      ? getBrandBannerTracks(laptopNeedLandingProfile, laptopCategoryBanners)
      : laptopCategoryBannerTracks;
  const categoryBrandSource =
    page.brand || page.keyword || page.title || page.slug;
  const brandFromText =
    apiCategory === "Máy tính bảng"
      ? getTabletBrandFromText(categoryBrandSource)
      : apiCategory === "Laptop"
        ? getLaptopBrandFromText(categoryBrandSource)
        : getBrandFromText(categoryBrandSource);
  const effectiveBrand = isCategoryPage ? page.brand || brandFromText : "";
  const phoneBrandProfile = getPhoneBrandLandingProfile(page);
  const tabletBrandProfile = getTabletBrandLandingProfile(page);
  const activeFilter =
    page.facet || page.filter || (page.inStock === "true" ? "in-stock" : "all");
  const listingCriteria = getCategoryCriteriaForPage(page, apiCategory);
  const isIphonePage =
    isCategoryPage &&
    apiCategory === "Điện thoại" &&
    (effectiveBrand === "apple" ||
      normalizeLabel(page.title).includes("iphone") ||
      normalizeLabel(page.keyword).includes("iphone"));
  const [visibleLimit, setVisibleLimit] = useState(CATEGORY_INITIAL_LIMIT);
  const [openFilterId, setOpenFilterId] = useState("");

  const query = {
    include: "details",
    displayLimit: visibleLimit,
    fetchLimit: Math.min(
      CATEGORY_MAX_LIMIT,
      Math.max(visibleLimit + CATEGORY_LOAD_MORE_STEP, visibleLimit * 2),
    ),
    sort: page.sort || "latest",
  };
  if (page.inStock === "true" || page.inStock === true) query.inStock = "true";
  if (page.inStock === "false" || page.inStock === false)
    query.inStock = "false";
  if (isCategoryPage && apiCategory) query.category = apiCategory;
  if (isCategoryPage && effectiveBrand) query.brand = effectiveBrand;
  if (page.q) query.q = page.q;
  if (!isCategoryPage && page.keyword) query.q = page.keyword;
  if (page.segment) query.segment = page.segment;
  if (page.filter) query.filter = page.filter;
  if (page.facet) query.facet = page.facet;
  if (page.priceMin) query.priceMin = page.priceMin;
  if (page.priceMax) query.priceMax = page.priceMax;
  if (page.ram) query.ram = page.ram;
  if (page.storage) query.storage = page.storage;
  if (page.screenSize) query.screenSize = page.screenSize;
  if (page.usage) query.usage = page.usage;
  if (page.display) query.display = page.display;
  if (page.camera) query.camera = page.camera;
  if (page.refreshRate) query.refreshRate = page.refreshRate;
  if (page.special) query.special = page.special;
  if (page.nfc) query.nfc = page.nfc;
  if (page.network) query.network = page.network;
  if (page.chipset) query.chipset = page.chipset;
  if (page.cpu) query.cpu = page.cpu;
  if (page.gpu) query.gpu = page.gpu;
  if (page.resolution) query.resolution = page.resolution;
  if (page.phoneType) query.phoneType = page.phoneType;
  if (page.productType) query.productType = page.productType;
  if (page.audioFeature) query.audioFeature = page.audioFeature;
  if (page.audioConnection) query.audioConnection = page.audioConnection;
  if (page.audioUsage) query.audioUsage = page.audioUsage;
  if (page.audioType) query.audioType = page.audioType;
  if (page.audioPower) query.audioPower = page.audioPower;
  if (page.audioDesign) query.audioDesign = page.audioDesign;
  if (page.audioLine) query.audioLine = page.audioLine;
  if (page.audioTransmission) query.audioTransmission = page.audioTransmission;

  const { products, loading } = useApiProducts(query, []);
  const listingProducts = useMemo(
    () =>
      isChildTabletNeedPage
        ? prioritizeChildTabletProducts(products)
        : products,
    [products, isChildTabletNeedPage],
  );
  const canLoadMore =
    !loading &&
    products.length >= visibleLimit &&
    visibleLimit < CATEGORY_MAX_LIMIT;
  const handleLoadMoreProducts = () =>
    setVisibleLimit((value) =>
      Math.min(value + CATEGORY_LOAD_MORE_STEP, CATEGORY_MAX_LIMIT),
    );
  const scopedNeedProfile =
    tabletNeedLandingProfile || laptopNeedLandingProfile;
  const isScopedBaseFilterValue = (paramKey, value) =>
    Boolean(
      scopedNeedProfile?.[paramKey] &&
      normalizeLabel(value) === normalizeLabel(scopedNeedProfile[paramKey]),
    );
  const hasAnyDetailedFilter = Boolean(
    page.brand ||
    page.filter ||
    page.facet ||
    page.inStock === "true" ||
    page.priceMin ||
    page.priceMax ||
    page.ram ||
    page.storage ||
    page.screenSize ||
    (page.usage && !isScopedBaseFilterValue("usage", page.usage)) ||
    page.display ||
    page.camera ||
    page.refreshRate ||
    (page.special && !isScopedBaseFilterValue("special", page.special)) ||
    page.nfc ||
    page.network ||
    page.chipset ||
    page.cpu ||
    page.gpu ||
    page.resolution ||
    page.phoneType ||
    page.productType ||
    page.audioFeature ||
    page.audioConnection ||
    page.audioUsage ||
    page.audioType ||
    page.audioPower ||
    page.audioDesign ||
    page.audioLine ||
    page.audioTransmission ||
    (page.q && !isScopedBaseFilterValue("q", page.q)),
  );

  return (
    <section
      className={`info-listing-panel ${isCategoryPage ? "category-listing-panel" : ""} ${isStandaloneTabletNeedPage ? "standalone-tablet-need-listing" : ""} ${isLaptopLanding ? "laptop-category-listing-panel" : ""} ${isLaptopAiPage ? "laptop-ai-listing-panel" : ""} ${isAudioLanding ? "audio-category-listing-panel" : ""}`}
    >
      {isPhoneLanding && <PhoneCategoryIntro page={page} />}
      {isAudioLanding && (
        <AudioLandingIntro page={page} profile={audioLandingProfile} />
      )}
      {phoneBrandProfile && (
        <PhoneBrandIntro page={page} profile={phoneBrandProfile} />
      )}
      {isTabletLanding && !isStandaloneTabletNeedPage && (
        <TabletCategoryIntro
          page={page}
          landingProfile={tabletNeedLandingProfile}
        />
      )}
      {isStandaloneTabletNeedPage && (
        <TabletNeedLandingIntro
          page={page}
          profile={tabletNeedLandingProfile}
        />
      )}
      {tabletBrandProfile && (
        <TabletBrandIntro page={page} profile={tabletBrandProfile} />
      )}
      {isLaptopLanding && !isLaptopAiPage && (
        <LaptopCategoryIntro
          page={page}
          profile={laptopLandingProfile}
          bannerTracks={laptopIntroBannerTracks}
          BannerCarousel={PhoneBannerCarousel}
          buildBrandHref={(brandKey) =>
            laptopBrandRoutes[brandKey] ||
            buildCategoryPath("Laptop", {
              brand: brandKey,
              keyword: `Laptop ${brandKey}`,
              title: `Laptop ${brandKey}`,
            })
          }
          buildSeriesHref={(query, label) =>
            buildListingControlPath(page, {
              ...resetPhoneListing,
              category: "Laptop",
              brand: laptopBrandLandingProfile?.brand || page.brand,
              q: query,
              keyword: label,
              title: laptopBrandLandingProfile?.title || page.title,
            })
          }
        />
      )}
      {isLaptopAiPage && <LaptopAiLandingIntro />}
      {computerCategoryType && (
        <ComputerCategoryIntro
          type={computerCategoryType}
          page={page}
          buildNeedHref={(key, value, label) =>
            buildListingControlPath(page, {
              [key]: value,
              keyword: label,
              title: page.title || apiCategory,
              sort: "latest",
            })
          }
        />
      )}

      {isCategoryPage && (
        <div
          className={`category-listing-controls ${isPhoneLanding || isTabletLanding || isLaptopLanding || isAudioLanding ? "phone-category-listing-controls" : ""} ${phoneBrandProfile || tabletBrandProfile || laptopBrandLandingProfile ? "phone-brand-listing-controls" : ""} ${isStandaloneTabletNeedPage ? "standalone-tablet-need-controls" : ""} ${isLaptopLanding ? "laptop-category-listing-controls" : ""} ${isLaptopAiPage ? "laptop-ai-listing-controls" : ""} ${isAudioLanding ? "audio-category-listing-controls" : ""}`}
        >
          {isIphonePage && (
            <>
              <div className="category-series-pills" aria-label="Dòng iPhone">
                {iPhoneSeries.map((item) => (
                  <a
                    href={
                      item.q === "iPhone 17"
                        ? "/mobile/apple/iphone-17.html"
                        : buildListingControlPath(
                            page,
                            {
                              category: "Điện thoại",
                              brand: "apple",
                              q: item.q,
                              keyword: item.label,
                              title: "iPhone",
                              filter: "",
                              facet: "",
                            },
                            page.path.startsWith("/mobile/apple")
                              ? "/mobile/apple.html"
                              : "",
                          )
                    }
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
              {listingCriteria.map((item) => {
                const criterionParam =
                  filterParamByFacet[item.facet || item.id];
                const isBaseProfileCriterion = isScopedBaseFilterValue(
                  criterionParam,
                  criterionParam ? page[criterionParam] : "",
                );
                const detailedValue = isBaseProfileCriterion
                  ? ""
                  : getActiveDetailedValue(page, item);
                const isActive =
                  item.id === "all"
                    ? !hasAnyDetailedFilter
                    : item.id === "in-stock"
                      ? page.inStock === "true"
                      : item.id === "new"
                        ? page.filter === "new"
                        : Boolean(detailedValue) ||
                          activeFilter ===
                            (item.facet || item.filter || item.id);
                const href =
                  item.id === "all"
                    ? buildListingControlPath(page, {
                        filter: "",
                        facet: "",
                        brand: "",
                        inStock: "",
                        priceMin: "",
                        priceMax: "",
                        ram: "",
                        storage: "",
                        screenSize: "",
                        usage: "",
                        display: "",
                        camera: "",
                        refreshRate: "",
                        special: "",
                        nfc: "",
                        network: "",
                        chipset: "",
                        cpu: "",
                        gpu: "",
                        resolution: "",
                        phoneType: "",
                        productType: "",
                        audioFeature: "",
                        audioConnection: "",
                        audioUsage: "",
                        audioType: "",
                        audioPower: "",
                        audioDesign: "",
                        audioLine: "",
                        audioTransmission: "",
                        q: "",
                        sort: "latest",
                      })
                    : buildListingControlPath(page, {
                        filter:
                          item.id === "in-stock"
                            ? page.filter
                            : item.id === "new" && page.filter === "new"
                              ? ""
                              : item.filter || item.id,
                        facet: item.facet || "",
                        inStock:
                          item.id === "in-stock"
                            ? page.inStock === "true"
                              ? ""
                              : "true"
                            : page.inStock,
                        sort: item.sort || page.sort || "latest",
                        q: page.q,
                      });
                const groups = getDetailedFilterGroups(item, page);
                const hasDropdown = item.dropdown && groups.length > 0;
                const showCriterionIcon =
                  !isStandaloneTabletNeedPage ||
                  ["all", "in-stock", "new", "price"].includes(item.id);

                if (!hasDropdown)
                  return (
                    <a
                      href={href}
                      data-preserve-scroll="true"
                      className={isActive ? "active" : ""}
                      key={item.id}
                    >
                      {showCriterionIcon && (
                        <span className="category-chip-icon">
                          <ChipIcon name={item.icon} />
                        </span>
                      )}
                      {item.label}
                    </a>
                  );

                return (
                  <div className="category-filter-chip-wrap" key={item.id}>
                    <button
                      type="button"
                      className={`category-filter-trigger ${isActive ? "active" : ""}`}
                      aria-expanded={openFilterId === item.id}
                      onClick={() =>
                        setOpenFilterId((value) =>
                          value === item.id ? "" : item.id,
                        )
                      }
                    >
                      {showCriterionIcon && (
                        <span className="category-chip-icon">
                          <ChipIcon name={item.icon} />
                        </span>
                      )}
                      <span>{detailedValue || item.label}</span>
                      <span className="category-chip-caret">⌄</span>
                    </button>
                    {openFilterId === item.id && (
                      <div className="category-filter-dropdown">
                        <div className="category-filter-dropdown-head">
                          <strong>{item.label}</strong>
                          <a
                            href={clearDetailedFilterPath(page, item)}
                            data-preserve-scroll="true"
                          >
                            Xóa lọc
                          </a>
                        </div>
                        {groups.map((group) => (
                          <section key={group.title}>
                            <h3>{group.title}</h3>
                            <div className="category-filter-option-grid">
                              {group.options.map((option) => (
                                <a
                                  key={`${group.title}-${option.label}`}
                                  href={buildDetailedFilterPath(
                                    page,
                                    item,
                                    group,
                                    option,
                                  )}
                                  data-preserve-scroll="true"
                                  aria-pressed={isDetailedOptionActive(
                                    page,
                                    group,
                                    option,
                                  )}
                                  className={[
                                    isDetailedOptionActive(page, group, option)
                                      ? "active"
                                      : "",
                                    option.logo ? "brand-logo-option" : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                >
                                  {option.logo ? (
                                    <SafeBrandImage
                                      src={option.logo}
                                      alt={option.label}
                                    />
                                  ) : (
                                    option.label
                                  )}
                                </a>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {tabletNeedLandingProfile && page.usage && (
            <section className="category-active-filter-summary">
              <h2>Đang lọc theo</h2>
              <div className="category-active-filter-content">
                <span className="category-active-filter-pill">
                  Nhu cầu sử dụng:<strong>{page.usage}</strong>
                  <a href="/tablet.html">×</a>
                </span>
                <a className="category-clear-all-filters" href="/tablet.html">
                  Bỏ chọn tất cả
                </a>
              </div>
            </section>
          )}
          <div className="category-sort-row" aria-label="Sắp xếp theo">
            <h2>Sắp xếp theo</h2>
            <div className="category-sort-chips">
              {sortOptions.map((item) => {
                const isActive =
                  page.sort === item.sort ||
                  (!page.sort && item.sort === "latest");
                return (
                  <a
                    href={buildListingControlPath(page, {
                      sort: item.sort,
                      filter: item.filter || page.filter,
                    })}
                    data-preserve-scroll="true"
                    className={isActive ? "active" : ""}
                    key={item.label}
                  >
                    <span className="category-chip-icon">
                      <ChipIcon name={item.icon} />
                    </span>
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!isStandaloneTabletNeedPage && (
        <div
          className="info-listing-head"
          id={isLaptopAiPage ? "laptop-ai-other-products" : undefined}
        >
          <h2>
            {isLaptopAiPage
              ? "Sản phẩm Laptop AI khác"
              : isCategoryPage
                ? "Danh sách sản phẩm"
                : "Sản phẩm phù hợp"}
          </h2>
          <a
            href={
              isChildTabletNeedPage
                ? "/tablet.html"
                : isCategoryPage
                  ? buildListingControlPath(page, {
                      filter: "",
                      facet: "",
                      brand: "",
                      q: "",
                      inStock: "",
                      priceMin: "",
                      priceMax: "",
                      ram: "",
                      storage: "",
                      screenSize: "",
                      usage: "",
                      display: "",
                      camera: "",
                      refreshRate: "",
                      special: "",
                      nfc: "",
                      network: "",
                      chipset: "",
                      cpu: "",
                      gpu: "",
                      resolution: "",
                      phoneType: "",
                      productType: "",
                      audioFeature: "",
                      audioConnection: "",
                      audioUsage: "",
                      audioType: "",
                      audioPower: "",
                      audioDesign: "",
                      audioLine: "",
                      audioTransmission: "",
                      sort: "latest",
                    })
                  : buildSearchPath(page.keyword)
            }
          >
            Làm mới kết quả
          </a>
        </div>
      )}
      <div className="info-product-grid" aria-busy={loading}>
        {loading ? (
          Array.from({ length: 8 }).map((_, index) => (
            <ProductCardSkeleton key={`info-skeleton-${index}`} />
          ))
        ) : listingProducts.length ? (
          listingProducts.map((product) => (
            <ProductCard
              product={product}
              key={product.id || product.slug || product.name}
            />
          ))
        ) : (
          <div className="info-empty-result">
            Chưa có sản phẩm khớp chính xác. Bạn có thể thử từ khóa khác hoặc
            quay lại trang chủ.
          </div>
        )}
      </div>

      {!loading && products.length > 0 && (
        <div className="info-load-more-wrap">
          <span>Đang hiển thị {products.length} sản phẩm</span>
          {canLoadMore ? (
            <button type="button" onClick={handleLoadMoreProducts}>
              Xem thêm {CATEGORY_LOAD_MORE_STEP} sản phẩm
            </button>
          ) : visibleLimit >= CATEGORY_MAX_LIMIT ? (
            <small>
              Đã đạt giới hạn hiển thị {CATEGORY_MAX_LIMIT} sản phẩm. Dùng bộ
              lọc để thu hẹp kết quả.
            </small>
          ) : (
            <small>Đã hiển thị hết sản phẩm phù hợp.</small>
          )}
        </div>
      )}
      {isLaptopAiPage && <LaptopAiFeatureSections />}
      {isCategoryPage && <CategorySupportFooter page={page} />}
    </section>
  );
}

export default function InfoPage({
  pathname = window.location.pathname,
  search = window.location.search,
  onGoHome,
}) {
  const page = useMemo(
    () => buildInfoPageModel(pathname, search),
    [pathname, search],
  );
  const breadcrumbItems = useMemo(() => getInfoBreadcrumbItems(page), [page]);
  const footerLandingKey = getFooterLandingKey(page);
  const footerLandingProfile = footerLandingProfiles[footerLandingKey];
  const phoneLanding = isPhoneLandingPage(page);
  const phoneBrandLanding = getPhoneBrandLandingProfile(page);
  const tabletNeedLanding = getTabletNeedLandingProfile(page);
  const tabletLanding = isTabletLandingPage(page) || Boolean(tabletNeedLanding);
  const tabletBrandLanding = getTabletBrandLandingProfile(page);
  const laptopLanding = isLaptopLandingPage(page);
  const laptopBrandLanding = getLaptopBrandLandingProfile(page);
  const laptopAiLanding = Boolean(getLaptopNeedLandingProfile(page)?.aiLanding);
  const audioLanding = getAudioLandingProfile(page);

  if (page.path === "/tra-gop") return <InstallmentLandingPage />;
  if (footerLandingProfile)
    return <FooterLandingPage page={page} profile={footerLandingProfile} />;

  return (
    <section
      className={`info-page ${phoneLanding ? "phone-landing-page" : ""} ${phoneBrandLanding ? "phone-brand-landing-page" : ""} ${tabletLanding ? "tablet-landing-page" : ""} ${tabletBrandLanding ? "tablet-brand-landing-page" : ""} ${laptopLanding ? "laptop-landing-page" : ""} ${laptopBrandLanding ? "laptop-brand-landing-page" : ""} ${laptopAiLanding ? "laptop-ai-page" : ""} ${audioLanding ? "audio-landing-page" : ""}`}
    >
      <div className="container">
        <nav className="info-breadcrumb" aria-label="Breadcrumb">
          <a
            href="/"
            onClick={(event) => {
              if (!onGoHome) return;
              event.preventDefault();
              onGoHome();
            }}
          >
            Trang chủ
          </a>
          {breadcrumbItems.map((item, index) => {
            const isCurrent = index === breadcrumbItems.length - 1;
            return (
              <span className="info-breadcrumb-node" key={item.id}>
                <span aria-hidden="true">/</span>
                {isCurrent ? (
                  <strong>{item.label}</strong>
                ) : (
                  <a href={item.href}>{item.label}</a>
                )}
              </span>
            );
          })}
        </nav>
        {!phoneLanding &&
          !phoneBrandLanding &&
          !tabletLanding &&
          !tabletBrandLanding &&
          !laptopLanding &&
          !audioLanding && (
            <header
              className={`info-hero-card ${page.root === "category" ? "category-title-card" : ""}`}
            >
              {page.root !== "category" && <span>{page.eyebrow}</span>}
              <h1>{page.title}</h1>
              {page.root !== "category" && <p>{page.description}</p>}
            </header>
          )}
        {page.isListing ? (
          <ListingContent key={`${pathname}${search}`} page={page} />
        ) : (
          <InfoContent page={page} />
        )}
        {!page.isListing &&
          !phoneLanding &&
          !phoneBrandLanding &&
          !tabletLanding &&
          !tabletBrandLanding &&
          !laptopLanding &&
          !audioLanding && (
            <div className="info-support-grid">
              {supportCards.map((card) => (
                <a
                  href={card.href}
                  className="info-support-card"
                  key={card.title}
                >
                  <strong>{card.title}</strong>
                  <p>{card.text}</p>
                  <span>{card.cta} ›</span>
                </a>
              ))}
            </div>
          )}
      </div>
    </section>
  );
}
