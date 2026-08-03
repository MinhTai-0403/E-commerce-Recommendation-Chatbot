export const createSiteSlug = (value = "") => {
  const normalized = String(value || "cellphones")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "cellphones";
};

export const buildSearchPath = (keyword = "") =>
  `/search?keyword=${encodeURIComponent(String(keyword || "").trim())}`;

const appendTruthyParam = (params, key, value) => {
  if (value === undefined || value === null) return;

  const text = String(value).trim();
  if (text) params.set(key, text);
};

export const buildCategoryPath = (category = "", options = {}) => {
  const params = new URLSearchParams();
  const categoryText = String(category || "").trim();
  const keyword = options.keyword ?? options.title ?? categoryText;

  appendTruthyParam(params, "keyword", keyword);
  appendTruthyParam(params, "category", options.category ?? categoryText);
  appendTruthyParam(params, "brand", options.brand);
  appendTruthyParam(params, "q", options.q);
  appendTruthyParam(params, "segment", options.segment);
  appendTruthyParam(params, "sort", options.sort);
  appendTruthyParam(params, "title", options.title);
  appendTruthyParam(params, "filter", options.filter);
  appendTruthyParam(params, "facet", options.facet);
  appendTruthyParam(params, "inStock", options.inStock);
  appendTruthyParam(params, "priceMin", options.priceMin);
  appendTruthyParam(params, "priceMax", options.priceMax);
  appendTruthyParam(params, "ram", options.ram);
  appendTruthyParam(params, "storage", options.storage);
  appendTruthyParam(params, "screenSize", options.screenSize);
  appendTruthyParam(params, "usage", options.usage);
  appendTruthyParam(params, "display", options.display);
  appendTruthyParam(params, "camera", options.camera);
  appendTruthyParam(params, "refreshRate", options.refreshRate);
  appendTruthyParam(params, "special", options.special);
  appendTruthyParam(params, "nfc", options.nfc);
  appendTruthyParam(params, "network", options.network);
  appendTruthyParam(params, "chipset", options.chipset);
  appendTruthyParam(params, "cpu", options.cpu);
  appendTruthyParam(params, "gpu", options.gpu);
  appendTruthyParam(params, "resolution", options.resolution);
  appendTruthyParam(params, "phoneType", options.phoneType);
  appendTruthyParam(params, "productType", options.productType);
  appendTruthyParam(params, "audioFeature", options.audioFeature);
  appendTruthyParam(params, "audioConnection", options.audioConnection);
  appendTruthyParam(params, "audioUsage", options.audioUsage);
  appendTruthyParam(params, "audioType", options.audioType);
  appendTruthyParam(params, "audioPower", options.audioPower);
  appendTruthyParam(params, "audioDesign", options.audioDesign);
  appendTruthyParam(params, "audioLine", options.audioLine);
  appendTruthyParam(params, "audioTransmission", options.audioTransmission);

  const query = params.toString();

  return `/category/${createSiteSlug(
    categoryText || keyword || "san-pham",
  )}${query ? `?${query}` : ""}`;
};

export const buildBrandCategoryPath = (category = "", brand = "", title = "") =>
  buildCategoryPath(category, {
    brand,
    keyword: title || brand,
    title: title || brand,
  });

export const buildInfoPath = (label = "", group = "info") =>
  `/${group}/${createSiteSlug(label)}`;

export const externalLinks = {
  app: "https://cellphones.com.vn/smember",
  android: "https://play.google.com/store/search?q=CellphoneS&c=apps",
  ios: "https://apps.apple.com/vn/search?term=cellphones",
  youtube: "https://www.youtube.com/@CellphoneS",
  facebook: "https://www.facebook.com/CellphoneSVietnam",
  instagram: "https://www.instagram.com/cellphones.official",
  tiktok: "https://www.tiktok.com/@cellphones.official",
  zalo: "https://zalo.me/cellphones",
  dienthoaivui: "https://dienthoaivui.com.vn",
  cares: "https://cares.vn",
  schannel: "https://www.youtube.com/@Schannel",
  sforum: "https://cellphones.com.vn/sforum",
  saleNotification: "https://online.gov.vn",
  dmca: "https://www.dmca.com/Protection/Status.aspx",
};

const normalizedIncludes = (value, keyword) =>
  createSiteSlug(value).includes(createSiteSlug(keyword));

export const AUDIO_CATEGORY_PATHS = Object.freeze({
  root: "/thiet-bi-am-thanh.html",

  headphones: "/thiet-bi-am-thanh/tai-nghe.html",

  speakers: "/thiet-bi-am-thanh/loa.html",

  recordingMicrophone: "/thiet-bi-am-thanh/micro-thu-am.html",

  microphone: "/thiet-bi-am-thanh/micro.html",

  turntable: "/thiet-bi-am-thanh/dia-than.html",

  airPods: "/thiet-bi-am-thanh/tai-nghe/apple.html",

  bluetoothHeadphones: "/thiet-bi-am-thanh/tai-nghe/tai-nghe-bluetooth.html",
});

export const getAudioCategoryPath = (label = "") => {
  const slug = createSiteSlug(label);

  if (slug === "am-thanh") {
    return AUDIO_CATEGORY_PATHS.root;
  }

  if (slug === "tai-nghe") {
    return AUDIO_CATEGORY_PATHS.headphones;
  }

  if (slug === "loa") {
    return AUDIO_CATEGORY_PATHS.speakers;
  }

  if (slug === "airpods") {
    return AUDIO_CATEGORY_PATHS.airPods;
  }

  if (slug === "bluetooth" || slug === "tai-nghe-bluetooth") {
    return AUDIO_CATEGORY_PATHS.bluetoothHeadphones;
  }

  if (
    [
      "mic-thu-am",
      "micro-thu-am",
      "mic-phong-thu",
      "mic-cai-ao",
      "mic-livestream",
    ].includes(slug) ||
    slug.startsWith("mic-phong-thu-") ||
    slug.startsWith("microphone-thu-am")
  ) {
    return AUDIO_CATEGORY_PATHS.recordingMicrophone;
  }

  if (["mic-khong-day", "micro-khong-day", "micro-karaoke"].includes(slug)) {
    return AUDIO_CATEGORY_PATHS.microphone;
  }

  if (slug === "dia-than") {
    return AUDIO_CATEGORY_PATHS.turntable;
  }

  return "";
};

const legacyCategoryRoutes = {
  [AUDIO_CATEGORY_PATHS.root]: {
    virtualPath: "/category/am-thanh",
    params: {
      keyword: "Âm thanh",
      category: "Âm thanh",
      title: "Âm thanh",
    },
  },

  [AUDIO_CATEGORY_PATHS.headphones]: {
    virtualPath: "/category/tai-nghe",
    params: {
      keyword: "Tai nghe",
      category: "Tai nghe",
      title: "Tai nghe",
    },
  },

  [AUDIO_CATEGORY_PATHS.speakers]: {
    virtualPath: "/category/loa",
    params: {
      keyword: "Loa",
      category: "Loa",
      title: "Loa",
    },
  },

  [AUDIO_CATEGORY_PATHS.recordingMicrophone]: {
    virtualPath: "/category/micro-thu-am",
    params: {
      keyword: "Micro thu âm",
      category: "Micro thu âm",
      title: "Micro thu âm",
    },
  },

  [AUDIO_CATEGORY_PATHS.microphone]: {
    virtualPath: "/category/micro-khong-day",
    params: {
      keyword: "Micro không dây Karaoke",
      category: "Micro không dây",
      title: "Micro không dây Karaoke",
    },
  },

  [AUDIO_CATEGORY_PATHS.turntable]: {
    virtualPath: "/category/dia-than",
    params: {
      keyword: "Đĩa than",
      category: "Đĩa than",
      title: "Đĩa than",
    },
  },

  [AUDIO_CATEGORY_PATHS.airPods]: {
    virtualPath: "/category/tai-nghe-airpods",
    params: {
      keyword: "Tai nghe AirPods",
      category: "Tai nghe",
      brand: "apple",
      title: "Tai nghe AirPods",
    },
  },

  [AUDIO_CATEGORY_PATHS.bluetoothHeadphones]: {
    virtualPath: "/category/tai-nghe-bluetooth",
    params: {
      keyword: "Tai nghe Bluetooth",
      category: "Tai nghe Bluetooth",
      title: "Tai nghe Bluetooth",
    },
  },

  "/laptop.html": {
    virtualPath: "/category/laptop",
    params: {
      keyword: "Laptop",
      category: "Laptop",
      title: "Laptop",
    },
  },

  "/may-tinh-de-ban.html": {
    virtualPath: "/category/pc",
    params: {
      keyword: "PC | Máy tính để bàn",
      category: "PC",
      title: "PC | Máy tính để bàn",
    },
  },

  "/man-hinh.html": {
    virtualPath: "/category/man-hinh",
    params: {
      keyword: "Màn hình",
      category: "Màn hình",
      title: "Màn hình máy tính",
    },
  },

  "/linh-kien.html": {
    virtualPath: "/category/linh-kien-may-tinh",
    params: {
      keyword: "Linh kiện máy tính",
      category: "Linh kiện máy tính",
      title: "Linh kiện máy tính",
    },
  },

  "/may-in.html": {
    virtualPath: "/category/may-in",
    params: {
      keyword: "Máy in",
      category: "Máy in",
      title: "Máy in",
    },
  },

  "/may-tinh-de-ban/build-pc.html": {
    virtualPath: "/category/build-pc",
    params: {
      keyword: "Build PC",
      category: "Linh kiện máy tính",
      title: "Build PC",
    },
  },

  "/laptop/mac.html": {
    virtualPath: "/category/laptop-macbook",
    params: {
      keyword: "Macbook",
      category: "Laptop",
      brand: "apple",
      title: "Macbook",
    },
  },

  "/laptop/asus.html": {
    virtualPath: "/category/laptop-asus",
    params: {
      keyword: "Laptop ASUS",
      category: "Laptop",
      brand: "asus",
      title: "Laptop ASUS",
    },
  },

  "/laptop/lenovo.html": {
    virtualPath: "/category/laptop-lenovo",
    params: {
      keyword: "Laptop Lenovo",
      category: "Laptop",
      brand: "lenovo",
      title: "Laptop Lenovo",
    },
  },

  "/laptop/msi.html": {
    virtualPath: "/category/laptop-msi",
    params: {
      keyword: "Laptop MSI",
      category: "Laptop",
      brand: "msi",
      title: "Laptop MSI",
    },
  },

  "/laptop/acer.html": {
    virtualPath: "/category/laptop-acer",
    params: {
      keyword: "Laptop Acer",
      category: "Laptop",
      brand: "acer",
      title: "Laptop Acer",
    },
  },

  "/laptop/hp.html": {
    virtualPath: "/category/laptop-hp",
    params: {
      keyword: "Laptop HP",
      category: "Laptop",
      brand: "hp",
      title: "Laptop HP",
    },
  },

  "/laptop/dell.html": {
    virtualPath: "/category/laptop-dell",
    params: {
      keyword: "Laptop Dell",
      category: "Laptop",
      brand: "dell",
      title: "Laptop Dell",
    },
  },

  "/laptop/gigabyte.html": {
    virtualPath: "/category/laptop-gigabyte",
    params: {
      keyword: "Laptop Gigabyte",
      category: "Laptop",
      brand: "gigabyte",
      title: "Laptop Gigabyte",
    },
  },

  "/laptop/lg.html": {
    virtualPath: "/category/laptop-lg",
    params: {
      keyword: "Laptop LG Gram",
      category: "Laptop",
      brand: "lg",
      title: "Laptop LG Gram",
    },
  },

  "/laptop/surface.html": {
    virtualPath: "/category/laptop-surface",
    params: {
      keyword: "Microsoft Surface",
      category: "Laptop",
      brand: "microsoft",
      title: "Microsoft Surface",
    },
  },

  "/laptop/samsung.html": {
    virtualPath: "/category/laptop-samsung",
    params: {
      keyword: "Laptop Samsung",
      category: "Laptop",
      brand: "samsung",
      title: "Laptop Samsung",
    },
  },

  "/laptop/masstel.html": {
    virtualPath: "/category/laptop-masstel",
    params: {
      keyword: "Laptop Masstel",
      category: "Laptop",
      brand: "masstel",
      title: "Laptop Masstel",
    },
  },

  "/laptop/van-phong.html": {
    virtualPath: "/category/laptop-van-phong",
    params: {
      keyword: "Laptop văn phòng",
      category: "Laptop",
      usage: "Học tập - văn phòng",
      title: "Laptop văn phòng",
    },
  },

  "/laptop/gaming.html": {
    virtualPath: "/category/laptop-gaming",
    params: {
      keyword: "Laptop Gaming",
      category: "Laptop",
      usage: "Chơi game",
      title: "Laptop Gaming",
    },
  },

  "/laptop/mong-nhe.html": {
    virtualPath: "/category/laptop-mong-nhe",
    params: {
      keyword: "Laptop mỏng nhẹ",
      category: "Laptop",
      usage: "Mỏng nhẹ",
      title: "Laptop mỏng nhẹ",
    },
  },

  "/laptop/do-hoa.html": {
    virtualPath: "/category/laptop-do-hoa",
    params: {
      keyword: "Laptop đồ họa",
      category: "Laptop",
      usage: "Đồ họa - thiết kế",
      title: "Laptop đồ họa",
    },
  },

  "/laptop/sinh-vien.html": {
    virtualPath: "/category/laptop-sinh-vien",
    params: {
      keyword: "Laptop cho sinh viên",
      category: "Laptop",
      usage: "Học tập - văn phòng",
      title: "Laptop cho sinh viên",
    },
  },

  "/laptop/cam-ung.html": {
    virtualPath: "/category/laptop-cam-ung",
    params: {
      keyword: "Laptop cảm ứng",
      category: "Laptop",
      special: "Cảm ứng",
      title: "Laptop cảm ứng",
    },
  },

  "/laptop/ai.html": {
    virtualPath: "/category/laptop-ai",
    params: {
      keyword: "Laptop AI",
      category: "Laptop",
      special: "AI tích hợp",
      title: "Laptop AI",
    },
  },

  "/tablet/ai.html": {
    virtualPath: "/category/may-tinh-bang-ai",
    params: {
      keyword: "Máy tính bảng AI",
      category: "Máy tính bảng",
      special: "AI tích hợp",
      title: "Máy tính bảng AI",
    },
  },

  "/tablet/may-doc-sach.html": {
    virtualPath: "/category/may-doc-sach",
    params: {
      keyword: "Máy đọc sách",
      category: "Máy tính bảng",
      q: "Máy đọc sách",
      title: "Máy đọc sách",
    },
  },

  "/bo-loc/may-tinh-bang-cho-tre-em": {
    virtualPath: "/category/may-tinh-bang-cho-tre-em",

    params: {
      keyword: "Máy tính bảng cho trẻ em học tập, giải trí bảo vệ mắt",

      category: "Máy tính bảng",

      usage: "Cho trẻ em",

      title: "Máy tính bảng cho trẻ em học tập, giải trí bảo vệ mắt",
    },
  },

  "/tablet.html": {
    virtualPath: "/category/may-tinh-bang",
    params: {
      keyword: "Máy tính bảng",
      category: "Máy tính bảng",
      title: "Máy tính bảng",
    },
  },

  "/tablet/ipad.html": {
    virtualPath: "/category/may-tinh-bang-ipad",
    params: {
      keyword: "iPad",
      category: "Máy tính bảng",
      brand: "apple",
      title: "iPad",
    },
  },

  "/tablet/samsung.html": {
    virtualPath: "/category/may-tinh-bang-samsung",

    params: {
      keyword: "Samsung",
      category: "Máy tính bảng",
      brand: "samsung",
      title: "Samsung",
    },
  },

  "/tablet/xiaomi.html": {
    virtualPath: "/category/may-tinh-bang-xiaomi",

    params: {
      keyword: "Xiaomi",
      category: "Máy tính bảng",
      brand: "xiaomi",
      title: "Xiaomi",
    },
  },

  "/tablet/huawei.html": {
    virtualPath: "/category/may-tinh-bang-huawei",

    params: {
      keyword: "Huawei",
      category: "Máy tính bảng",
      brand: "huawei",
      title: "Huawei",
    },
  },

  "/tablet/lenovo.html": {
    virtualPath: "/category/may-tinh-bang-lenovo",

    params: {
      keyword: "Lenovo",
      category: "Máy tính bảng",
      brand: "lenovo",
      title: "Lenovo",
    },
  },

  "/tablet/teclast.html": {
    virtualPath: "/category/may-tinh-bang-teclast",

    params: {
      keyword: "Teclast",
      category: "Máy tính bảng",
      brand: "teclast",
      title: "Teclast",
    },
  },

  "/tablet/nubia.html": {
    virtualPath: "/category/may-tinh-bang-nubia",

    params: {
      keyword: "Nubia",
      category: "Máy tính bảng",
      brand: "nubia",
      title: "Nubia",
    },
  },

  "/tablet/honor.html": {
    virtualPath: "/category/may-tinh-bang-honor",

    params: {
      keyword: "Honor",
      category: "Máy tính bảng",
      brand: "honor",
      title: "Honor",
    },
  },

  "/tablet/oppo.html": {
    virtualPath: "/category/may-tinh-bang-oppo",

    params: {
      keyword: "Oppo",
      category: "Máy tính bảng",
      brand: "oppo",
      title: "Oppo",
    },
  },

  "/mobile.html": {
    virtualPath: "/category/dien-thoai",

    params: {
      keyword: "Điện thoại",
      category: "Điện thoại",
      title: "Điện thoại",
    },
  },

  "/mobile/apple.html": {
    virtualPath: "/category/dien-thoai-apple",

    params: {
      keyword: "Apple",
      category: "Điện thoại",
      brand: "apple",
      title: "Apple",
    },
  },

  "/mobile/apple/iphone-17.html": {
    virtualPath: "/category/iphone-17",

    params: {
      keyword: "Điện thoại iPhone 17",
      category: "Điện thoại",
      brand: "apple",
      q: "iPhone 17",
      title: "Điện thoại iPhone 17",
    },
  },
};

const getLegacyCategoryRoute = (pathname = "") => {
  const cleaned = pathname.replace(/\/+$/g, "") || "/";

  return legacyCategoryRoutes[cleaned] || null;
};

export const directInfoRoutes = {
  "/chinh-sach/mua-hang-va-thanh-toan-online": "Mua hàng và thanh toán Online",

  "/chinh-sach/mua-hang-tra-gop": "Mua hàng trả góp",

  "/chinh-sach/mua-hang-tra-gop-bang-the-tin-dung":
    "Mua hàng trả góp bằng thẻ tín dụng",

  "/chinh-sach-giao-hang": "Chính sách giao hàng",

  "/tra-gop": "Mua hàng trả góp",

  "/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones":
    "Mua hàng trả góp bằng thẻ tín dụng",

  "/chinh-sach/chinh-sach-doi-tra": "Chính sách đổi trả",

  "/smember/tra-diem": "Tra điểm Smember",

  "/uu-dai-smember": "Xem ưu đãi Smember",

  "/smember/uu-dai": "Ưu đãi Smember",

  "/smember": "Smember",

  "/bao-hanh/tra-thong-tin-bao-hanh": "Tra thông tin bảo hành",

  "/hoa-don/tra-cuu-hoa-don-dien-tu": "Tra cứu hoá đơn điện tử",

  "/chinh-sach-bao-hanh": "Chính sách bảo hành",

  "/bao-hanh/apple": "Trung tâm bảo hành chính hãng",

  "/chinh-sach-khui-hop-apple": "Chính sách khui hộp sản phẩm Apple",

  "/vat-refund": "VAT Refund",

  "/dich-vu-khach-hang-doanh-nghiep": "Khách hàng doanh nghiệp (B2B)",

  "/dich-vu/khach-hang-doanh-nghiep-b2b": "Khách hàng doanh nghiệp (B2B)",

  "/danh-sach-khuyen-mai": "Ưu đãi thanh toán",

  "/khuyen-mai/uu-dai-thanh-toan": "Ưu đãi thanh toán",

  "/chinh-sach/quy-che-hoat-dong": "Quy chế hoạt động",

  "/chinh-sach-bao-mat": "Chính sách bảo mật thông tin cá nhân",

  "/chinh-sach/chinh-sach-bao-mat-thong-tin-ca-nhan":
    "Chính sách bảo mật thông tin cá nhân",

  "/chinh-sach/chinh-sach-bao-hanh": "Chính sách Bảo hành",

  "/lien-he-hop-tac": "Liên hệ hợp tác kinh doanh",

  "/bieu-phi-bao-hanh-mo-rong": "Dịch vụ bảo hành mở rộng",

  "/quy-dinh-ve-viec-sao-luu-du-lieu": "Quy định về việc sao lưu dữ liệu",

  "/quy-dinh-ve-hoa-don-khi-mua-hang-cellphones": "Thông tin hoá đơn mua hàng",

  "/download-app": "Tải ứng dụng CellphoneS",

  "/khuyen-mai/dang-ky-nhan-tin": "Đăng ký nhận tin khuyến mãi",

  "/tuyen-dung": "Tuyển dụng CellphoneS",

  "/he-thong-cua-hang": "Hệ thống cửa hàng CellphoneS",

  "/tra-cuu-don-hang": "Tra cứu đơn hàng",

  "/lien-he": "Liên hệ CellphoneS",

  "/dieu-khoan-su-dung": "Điều khoản sử dụng",

  "/tos": "Quy chế hoạt động",

  "/thanh-vien/dienthoaivui": "Điện Thoại Vui",

  "/thanh-vien/cares": "CareS",

  "/thanh-vien/schannel": "SChannel",

  "/thanh-vien/sforum": "Sforum",

  "/ket-noi/youtube": "YouTube CellphoneS",

  "/ket-noi/facebook": "Facebook CellphoneS",

  "/ket-noi/instagram": "Instagram CellphoneS",

  "/ket-noi/tiktok": "TikTok CellphoneS",

  "/ket-noi/zalo": "Zalo CellphoneS",
};

const directLabelRoutes = [
  {
    keywords: ["mua hang va thanh toan online", "chinh sach mua hang"],
    path: "/chinh-sach-giao-hang",
  },

  {
    keywords: [
      "mua hang tra gop bang the tin dung",
      "tra gop bang the tin dung",
    ],
    path: "/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones",
  },

  {
    keywords: ["mua hang tra gop", "tra gop"],
    path: "/tra-gop",
  },

  {
    keywords: ["chinh sach giao hang", "giao hang"],
    path: "/chinh-sach-giao-hang",
  },

  {
    keywords: ["chinh sach doi tra", "doi tra"],
    path: "/tos?part=refund-policy",
  },

  {
    keywords: ["tra diem smember"],
    path: "/smember/tra-diem",
  },

  {
    keywords: ["xem uu dai smember", "uu dai smember"],
    path: "/uu-dai-smember",
  },

  {
    keywords: ["tra thong tin bao hanh"],
    path: "/bao-hanh/tra-thong-tin-bao-hanh",
  },

  {
    keywords: [
      "trung tam bao hanh chinh hang",
      "danh sach trung tam bao hanh",
      "trung tam bao hanh uy quyen apple",
    ],
    path: "/bao-hanh/apple",
  },

  {
    keywords: ["chinh sach bao hanh"],
    path: "/chinh-sach-bao-hanh",
  },

  {
    keywords: ["tra cuu hoa don dien tu"],
    path: "/hoa-don/tra-cuu-hoa-don-dien-tu",
  },

  {
    keywords: ["thong tin hoa don mua hang"],
    path: "/quy-dinh-ve-hoa-don-khi-mua-hang-cellphones",
  },

  {
    keywords: ["quy dinh ve viec sao luu du lieu", "sao luu du lieu"],
    path: "/quy-dinh-ve-viec-sao-luu-du-lieu",
  },

  {
    keywords: ["chinh sach khui hop san pham apple", "khui hop san pham apple"],
    path: "/chinh-sach-khui-hop-apple",
  },

  {
    keywords: ["vat refund"],
    path: "/vat-refund",
  },

  {
    keywords: ["khach hang doanh nghiep", "b2b"],
    path: "/dich-vu-khach-hang-doanh-nghiep",
  },

  {
    keywords: ["uu dai thanh toan"],
    path: "/danh-sach-khuyen-mai",
  },

  {
    keywords: ["quy che hoat dong"],
    path: "/tos",
  },

  {
    keywords: ["bao mat thong tin ca nhan", "chinh sach bao mat"],
    path: "/tos?part=privacy-policy",
  },

  {
    keywords: ["lien he hop tac kinh doanh"],
    path: "/lien-he-hop-tac",
  },

  {
    keywords: ["dich vu bao hanh mo rong", "bao hanh mo rong"],
    path: "/bieu-phi-bao-hanh-mo-rong",
  },

  {
    keywords: ["dieu khoan su dung"],
    path: "/dieu-khoan-su-dung",
  },
];

const getDirectRouteForLabel = (text) => {
  const slug = createSiteSlug(text);

  const directMatch = directLabelRoutes.find((rule) =>
    rule.keywords.some((keyword) => slug.includes(createSiteSlug(keyword))),
  );

  return directMatch?.path || "";
};

export function getRouteForLabel(label = "", fallbackGroup = "info") {
  const text = String(label || "").trim();

  if (!text) {
    return "/";
  }

  const slug = createSiteSlug(text);

  const directRoute = getDirectRouteForLabel(text);

  if (directRoute) {
    return directRoute;
  }

  if (normalizedIncludes(text, "cua hang")) {
    return "/he-thong-cua-hang";
  }

  if (normalizedIncludes(text, "tra cuu don hang")) {
    return "/tra-cuu-don-hang";
  }

  if (normalizedIncludes(text, "lien he")) {
    return "/lien-he";
  }

  if (
    normalizedIncludes(text, "tai app") ||
    normalizedIncludes(text, "ung dung")
  ) {
    return "/download-app";
  }

  if (normalizedIncludes(text, "tuyen dung")) {
    return "/tuyen-dung";
  }

  if (normalizedIncludes(text, "uu dai smember")) {
    return "/smember/uu-dai";
  }

  if (normalizedIncludes(text, "tra diem smember")) {
    return "/smember/tra-diem";
  }

  if (normalizedIncludes(text, "bao hanh")) {
    return `/bao-hanh/${slug}`;
  }

  if (normalizedIncludes(text, "hoa don")) {
    return `/hoa-don/${slug}`;
  }

  if (
    normalizedIncludes(text, "chinh sach") ||
    normalizedIncludes(text, "mua hang") ||
    normalizedIncludes(text, "thanh toan") ||
    normalizedIncludes(text, "tra gop") ||
    normalizedIncludes(text, "giao hang") ||
    normalizedIncludes(text, "doi tra") ||
    normalizedIncludes(text, "vat") ||
    normalizedIncludes(text, "sao luu") ||
    normalizedIncludes(text, "khui hop")
  ) {
    return `/chinh-sach/${slug}`;
  }

  if (
    normalizedIncludes(text, "khuyen mai") ||
    normalizedIncludes(text, "voucher")
  ) {
    return `/khuyen-mai/${slug}`;
  }

  if (
    normalizedIncludes(text, "tin cong nghe") ||
    normalizedIncludes(text, "tin tuc")
  ) {
    return `/tin-tuc/${slug}`;
  }

  if (
    [
      "apple-pay",
      "vnpay",
      "momo",
      "onepay",
      "mpos",
      "kredivo",
      "zalopay",
      "fundiin",
    ].includes(slug)
  ) {
    return `/thanh-toan/${slug}`;
  }

  if (fallbackGroup === "category") {
    return buildCategoryPath(text);
  }

  if (fallbackGroup === "policy") {
    return `/chinh-sach/${slug}`;
  }

  if (fallbackGroup === "service") {
    return `/dich-vu/${slug}`;
  }

  if (fallbackGroup === "news") {
    return `/tin-tuc/${slug}`;
  }

  if (fallbackGroup === "promo") {
    return `/khuyen-mai/${slug}`;
  }

  if (fallbackGroup === "payment") {
    return `/thanh-toan/${slug}`;
  }

  return buildSearchPath(text);
}

export function getRouteForDeadAnchor(anchor) {
  const label = (
    anchor?.getAttribute("aria-label") ||
    anchor?.getAttribute("title") ||
    anchor?.textContent ||
    anchor?.querySelector("img")?.getAttribute("alt") ||
    ""
  ).trim();

  const className = anchor?.className ? String(anchor.className) : "";

  if (
    className.includes("category") ||
    className.includes("brand") ||
    className.includes("filter")
  ) {
    return getRouteForLabel(label, "category");
  }

  if (className.includes("promo")) {
    return getRouteForLabel(label, "promo");
  }

  if (className.includes("news")) {
    return getRouteForLabel(label, "news");
  }

  if (className.includes("payment")) {
    return getRouteForLabel(label, "payment");
  }

  if (className.includes("footer")) {
    return getRouteForLabel(label, "service");
  }

  return getRouteForLabel(label);
}

export function getInfoRouteKind(pathname = "") {
  const cleaned = pathname.replace(/\/+$/g, "") || "/";

  if (cleaned === "/") {
    return "";
  }

  if (
    getLegacyCategoryRoute(cleaned) ||
    directInfoRoutes[cleaned] ||
    cleaned === "/search" ||
    cleaned.startsWith("/category/") ||
    cleaned.startsWith("/chinh-sach/") ||
    cleaned.startsWith("/dich-vu/") ||
    cleaned.startsWith("/thanh-toan/") ||
    cleaned.startsWith("/tin-tuc/") ||
    cleaned.startsWith("/khuyen-mai/") ||
    cleaned.startsWith("/bao-hanh/") ||
    cleaned.startsWith("/hoa-don/") ||
    cleaned.startsWith("/smember/") ||
    cleaned.startsWith("/thanh-vien/") ||
    cleaned.startsWith("/ket-noi/") ||
    [
      "/he-thong-cua-hang",
      "/tra-cuu-don-hang",
      "/lien-he",
      "/download-app",
      "/tuyen-dung",
      "/stores",
      "/orders",
    ].includes(cleaned)
  ) {
    return "info";
  }

  return "";
}

export function buildInfoPageModel(pathname = "", search = "") {
  const legacyCategoryRoute = getLegacyCategoryRoute(pathname);

  if (legacyCategoryRoute) {
    const legacyParams = new URLSearchParams(search);

    Object.entries(legacyCategoryRoute.params).forEach(([key, value]) => {
      if (!legacyParams.has(key)) {
        legacyParams.set(key, value);
      }
    });

    return {
      ...buildInfoPageModel(
        legacyCategoryRoute.virtualPath,

        legacyParams.toString() ? `?${legacyParams.toString()}` : "",
      ),

      path: pathname.replace(/\/+$/g, "") || "/",
    };
  }

  const params = new URLSearchParams(search);

  const keyword = params.get("keyword") || "";

  const categoryParam = params.get("category") || "";

  const brand = params.get("brand") || "";

  const q = params.get("q") || "";

  const segment = params.get("segment") || "";

  const sort = params.get("sort") || "latest";

  const filter = params.get("filter") || "";

  const facet = params.get("facet") || "";

  const inStock = params.get("inStock") || "";

  const priceMin = params.get("priceMin") || "";

  const priceMax = params.get("priceMax") || "";

  const ram = params.get("ram") || "";

  const storage = params.get("storage") || "";

  const screenSize =
    params.get("screenSize") || params.get("screen_size") || "";

  const usage = params.get("usage") || "";

  const display = params.get("display") || "";

  const camera = params.get("camera") || "";

  const refreshRate =
    params.get("refreshRate") || params.get("refresh_rate") || "";

  const special = params.get("special") || "";

  const nfc = params.get("nfc") || "";

  const network = params.get("network") || "";

  const chipset = params.get("chipset") || "";

  const cpu = params.get("cpu") || "";

  const gpu = params.get("gpu") || "";

  const resolution = params.get("resolution") || "";

  const phoneType = params.get("phoneType") || params.get("phone_type") || "";

  const productType =
    params.get("productType") || params.get("product_type") || "";

  const audioFeature =
    params.get("audioFeature") || params.get("audio_feature") || "";

  const audioConnection =
    params.get("audioConnection") || params.get("audio_connection") || "";

  const audioUsage =
    params.get("audioUsage") || params.get("audio_usage") || "";

  const audioType = params.get("audioType") || params.get("audio_type") || "";

  const audioPower =
    params.get("audioPower") || params.get("audio_power") || "";

  const audioDesign =
    params.get("audioDesign") || params.get("audio_design") || "";

  const audioLine = params.get("audioLine") || params.get("audio_line") || "";

  const audioTransmission =
    params.get("audioTransmission") || params.get("audio_transmission") || "";

  const titleParam = params.get("title") || "";

  const segments = pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);

  const root = segments[0] || "info";

  const slug = segments[1] || createSiteSlug(keyword || root);

  const cleanedPath = pathname.replace(/\/+$/g, "") || "/";

  const tosPart = cleanedPath === "/tos" ? params.get("part") : "";

  const tosTitleByPart = {
    "refund-policy": "Chính sách đổi trả",

    "privacy-policy": "Chính sách bảo mật thông tin cá nhân",
  };

  const directTitle =
    tosTitleByPart[tosPart] || directInfoRoutes[cleanedPath] || "";

  const titleFromSlug = slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  const categoryTitle =
    titleParam ||
    keyword ||
    categoryParam ||
    titleFromSlug ||
    "Danh mục sản phẩm";

  const baseTitle =
    directTitle || keyword || titleParam || titleFromSlug || "CellphoneS";

  const isListing = root === "search" || root === "category";

  const titles = {
    search: `Kết quả tìm kiếm: ${keyword || q || "CellphoneS"}`,

    category: categoryTitle,

    "chinh-sach": baseTitle,

    "dich-vu": baseTitle,

    "thanh-toan": `Phương thức thanh toán ${baseTitle}`,

    "tin-tuc": baseTitle,

    "khuyen-mai": baseTitle,

    "bao-hanh": baseTitle,

    "hoa-don": baseTitle,

    smember: baseTitle,

    "thanh-vien": baseTitle,

    "ket-noi": baseTitle,

    "he-thong-cua-hang": "Hệ thống cửa hàng CellphoneS",

    stores: "Hệ thống cửa hàng CellphoneS",

    "tra-cuu-don-hang": "Tra cứu đơn hàng",

    orders: "Tra cứu đơn hàng",

    "lien-he": "Liên hệ CellphoneS",

    "download-app": "Tải ứng dụng CellphoneS",

    "tuyen-dung": "Tuyển dụng CellphoneS",
  };

  const title = directTitle || titles[root] || baseTitle;

  const listingCategory =
    root === "category" ? categoryParam || keyword || titleFromSlug : "";

  return {
    root,
    slug,
    path: cleanedPath,
    params,

    keyword: keyword || q || titleFromSlug,

    q,
    brand,
    categoryParam,
    category: listingCategory,
    segment,
    sort,
    filter,
    facet,
    inStock,
    priceMin,
    priceMax,
    ram,
    storage,
    screenSize,
    usage,
    display,
    camera,
    refreshRate,
    special,
    nfc,
    network,
    chipset,
    cpu,
    gpu,
    resolution,
    phoneType,
    productType,
    audioFeature,
    audioConnection,
    audioUsage,
    audioType,
    audioPower,
    audioDesign,
    audioLine,
    audioTransmission,

    isBrandCategory: root === "category" && Boolean(brand),

    isListing,

    title,

    eyebrow:
      root === "search" || root === "category"
        ? "Sản phẩm"
        : "Thông tin CellphoneS",

    description: isListing
      ? "Danh sách sản phẩm được lọc đúng theo danh mục, hãng và tiêu chí bạn chọn từ MongoDB/API."
      : "Trang nội dung nội bộ giúp mọi liên kết trên giao diện có điểm đến rõ ràng, có thể thay bằng bài viết/chính sách thật từ admin sau này.",
  };
}
