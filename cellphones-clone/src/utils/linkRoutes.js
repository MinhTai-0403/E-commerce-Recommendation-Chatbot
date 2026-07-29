import {
  getCategoryRouteModel,
  PUBLIC_EXTERNAL_LINKS,
  PUBLIC_ROUTES,
  resolvePublicRoute,
} from './routeRegistry';
import {
  getCategoryLandingPath,
  resolveCategoryLandingProfile,
} from '../data/categoryLandingProfiles';

export const createSiteSlug = (value = '') => {
  const normalized = String(value || 'cellphones')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'cellphones';
};

export const buildSearchPath = (keyword = '') => (
  `/catalogsearch/result?q=${encodeURIComponent(String(keyword || '').trim())}`
);

const appendTruthyParam = (params, key, value) => {
  const text = String(value || '').trim();
  if (text) params.set(key, text);
};

const catalogTopicRouteBySlug = {
  'micro-thu-am': '/thiet-bi-am-thanh/micro-thu-am.html',
  microphone: '/thiet-bi-am-thanh/micro-thu-am.html',
  'tai-nghe': '/thiet-bi-am-thanh/tai-nghe.html',
  'tai-nghe-bluetooth': '/thiet-bi-am-thanh/tai-nghe/tai-nghe-bluetooth.html',
  'tai-nghe-chup-tai': '/thiet-bi-am-thanh/tai-nghe/headphones.html',
  'tai-nghe-nhet-tai': '/thiet-bi-am-thanh/tai-nghe/tai-nghe-nhet-tai.html',
  'tai-nghe-co-day': '/thiet-bi-am-thanh/tai-nghe/co-day.html',
  'tai-nghe-gaming': '/thiet-bi-am-thanh/tai-nghe/gaming.html',
  'loa': '/thiet-bi-am-thanh/loa.html',
  'loa-bluetooth': '/thiet-bi-am-thanh/loa/loa-bluetooth.html',
  'loa-karaoke': '/thiet-bi-am-thanh/loa/loa-karaoke.html',
  'loa-keo': '/thiet-bi-am-thanh/loa/loa-keo.html',
  'loa-soundbar': '/thiet-bi-am-thanh/loa/loa-soundbar.html',
  'loa-vi-tinh': '/thiet-bi-am-thanh/loa/loa-vi-tinh.html',
  'thiet-bi-mang': '/phu-kien/thiet-bi-mang.html',
  'linh-kien-may-tinh': '/linh-kien.html',
  'gaming-gear': '/phu-kien/gaming-gear.html',
  'day-dong-ho-thong-minh': '/do-choi-cong-nghe/day-deo-dong-ho.html',
  camera: '/phu-kien/camera.html',
  'lam-dep': '/nha-thong-minh/suc-khoe-lam-dep.html',
  'suc-khoe-lam-dep': '/nha-thong-minh/suc-khoe-lam-dep.html',
  'may-in': '/may-in.html',
  'man-hinh-may-tinh': '/man-hinh.html',
  'tu-lanh': '/tu-lanh.html',
  'may-giat': '/may-giat.html',
  'may-lanh': '/may-lanh.html',
  'dieu-hoa': '/may-lanh.html',
  'dieu-hoa-may-lanh': '/may-lanh.html',
};

const catalogTopicRouteByCategory = {
  'tai-nghe:bluetooth': '/thiet-bi-am-thanh/tai-nghe/tai-nghe-bluetooth.html',
  'tai-nghe:co-day': '/thiet-bi-am-thanh/tai-nghe/co-day.html',
  'tai-nghe:chup-tai': '/thiet-bi-am-thanh/tai-nghe/headphones.html',
  'tai-nghe:nhet-tai': '/thiet-bi-am-thanh/tai-nghe/tai-nghe-nhet-tai.html',
  'tai-nghe:gaming': '/thiet-bi-am-thanh/tai-nghe/gaming.html',
  'tai-nghe:the-thao': '/thiet-bi-am-thanh/tai-nghe/the-thao.html',
  'tai-nghe:kiem-am': '/thiet-bi-am-thanh/tai-nghe/kiem-am.html',
  'tai-nghe:phien-dich': '/thiet-bi-am-thanh/tai-nghe/phien-dich.html',
  'loa:loa-bluetooth': '/thiet-bi-am-thanh/loa/loa-bluetooth.html',
  'loa:loa-karaoke': '/thiet-bi-am-thanh/loa/loa-karaoke.html',
  'loa:loa-keo': '/thiet-bi-am-thanh/loa/loa-keo.html',
  'loa:loa-soundbar': '/thiet-bi-am-thanh/loa/loa-soundbar.html',
  'loa:loa-vi-tinh': '/thiet-bi-am-thanh/loa/loa-vi-tinh.html',
  'linh-kien-may-tinh:cpu': '/linh-kien/cpu.html',
  'linh-kien-may-tinh:main': '/linh-kien/mainboard.html',
  'linh-kien-may-tinh:mainboard': '/linh-kien/mainboard.html',
  'linh-kien-may-tinh:ram': '/linh-kien/ram.html',
  'linh-kien-may-tinh:o-cung': '/linh-kien/o-cung.html',
  'linh-kien-may-tinh:nguon': '/linh-kien/nguon.html',
  'linh-kien-may-tinh:vga': '/linh-kien/vga.html',
  'linh-kien-may-tinh:tan-nhiet': '/linh-kien/tan-nhiet.html',
  'linh-kien-may-tinh:case': '/linh-kien/case.html',
  'thiet-bi-mang:thiet-bi-phat-song-wifi': '/phu-kien/thiet-bi-mang/thiet-bi-phat-wifi.html',
  'thiet-bi-mang:bo-phat-wifi-di-dong': '/phu-kien/thiet-bi-mang/bo-phat-wifi-di-dong.html',
  'thiet-bi-mang:bo-kich-song-wifi': '/phu-kien/thiet-bi-mang/bo-kich-song-wifi.html',
  'thiet-bi-mang:hub-switch': '/phu-kien/thiet-bi-mang/hub-switch.html',
  'thiet-bi-mang:usb-wifi': '/phu-kien/thiet-bi-mang/usb-wifi.html',
  'thiet-bi-mang:card-mang': '/phu-kien/thiet-bi-mang/card-mang.html',
  'gaming-gear:playstation': '/phu-kien/gaming-gear/may-choi-game.html',
  'gaming-gear:tay-cam-choi-game': '/phu-kien/gaming-gear/tay-cam.html',
};

export const buildCategoryPath = (category = '', options = {}) => {
  const params = new URLSearchParams();
  const categoryText = String(category || '').trim();
  const keyword = options.keyword ?? options.title ?? categoryText;
  const categorySlug = createSiteSlug(categoryText || keyword);
  const topicSlug = createSiteSlug(keyword);
  const directTopicPath = catalogTopicRouteByCategory[`${categorySlug}:${topicSlug}`]
    || catalogTopicRouteBySlug[topicSlug]
    || '';
  const canonicalRoute = PUBLIC_ROUTES.find((route) => (
    route.pageType === 'category'
    && [route.id, route.keyword, route.category, ...(route.aliases || [])]
      .some((value) => {
        const candidate = createSiteSlug(value);
        return candidate === categorySlug
          || candidate.includes(categorySlug)
          || categorySlug.includes(candidate);
      })
  ));
  const categoryLandingPath = options.brand
    ? getCategoryLandingPath(categoryText, options.brand)
    : '';

  if (!categoryLandingPath) appendTruthyParam(params, 'brand', options.brand);
  const redundantDirectQuery = directTopicPath
    && createSiteSlug(options.q) === topicSlug;
  if (!redundantDirectQuery) appendTruthyParam(params, 'q', options.q);
  appendTruthyParam(params, 'segment', options.segment);
  appendTruthyParam(params, 'series', options.series);
  appendTruthyParam(params, 'sort', options.sort);
  if (!categoryLandingPath && !directTopicPath) appendTruthyParam(params, 'title', options.title);
  appendTruthyParam(params, 'filter', options.filter);
  appendTruthyParam(params, 'facet', options.facet);
  appendTruthyParam(params, 'inStock', options.inStock);
  appendTruthyParam(params, 'priceMin', options.priceMin);
  appendTruthyParam(params, 'priceMax', options.priceMax);
  appendTruthyParam(params, 'ram', options.ram);
  appendTruthyParam(params, 'storage', options.storage);
  appendTruthyParam(params, 'screenSize', options.screenSize);
  appendTruthyParam(params, 'usage', options.usage);
  appendTruthyParam(params, 'display', options.display);
  appendTruthyParam(params, 'camera', options.camera);
  appendTruthyParam(params, 'refreshRate', options.refreshRate);
  appendTruthyParam(params, 'special', options.special);
  appendTruthyParam(params, 'chip', options.chip);
  appendTruthyParam(params, 'nfc', options.nfc);

  if (!canonicalRoute && !directTopicPath && !params.has('q')) appendTruthyParam(params, 'q', keyword);
  const query = params.toString();
  const basePath = categoryLandingPath || directTopicPath || canonicalRoute?.path || '/catalogsearch/result';
  return `${basePath}${query ? `?${query}` : ''}`;
};

export const buildBrandCategoryPath = (category = '', brand = '', title = '') => (
  buildCategoryPath(category, {
    brand,
    keyword: title || brand,
    title: title || brand,
  })
);

export const buildInfoPath = (label = '', group = 'info') => (
  `/${group}/${createSiteSlug(label)}`
);

export const externalLinks = {
  app: PUBLIC_EXTERNAL_LINKS.smember,
  android: PUBLIC_EXTERNAL_LINKS.android,
  ios: PUBLIC_EXTERNAL_LINKS.ios,
  youtube: 'https://www.youtube.com/@CellphoneS',
  facebook: 'https://www.facebook.com/CellphoneSVietnam',
  instagram: 'https://www.instagram.com/cellphones.official',
  tiktok: 'https://www.tiktok.com/@cellphones.official',
  zalo: 'https://zalo.me/cellphones',
  dienthoaivui: 'https://dienthoaivui.com.vn',
  cares: 'https://cares.vn',
  schannel: 'https://www.youtube.com/@Schannel',
  sforum: 'https://cellphones.com.vn/sforum',
  saleNotification: 'https://online.gov.vn',
  dmca: 'https://www.dmca.com/Protection/Status.aspx',
};

const normalizedIncludes = (value, keyword) => (
  createSiteSlug(value).includes(createSiteSlug(keyword))
);

export const directInfoRoutes = {
  '/chinh-sach/mua-hang-va-thanh-toan-online': 'Mua hàng và thanh toán Online',
  '/chinh-sach/mua-hang-tra-gop': 'Mua hàng trả góp',
  '/chinh-sach/mua-hang-tra-gop-bang-the-tin-dung': 'Mua hàng trả góp bằng thẻ tín dụng',
  '/chinh-sach-giao-hang': 'Chính sách giao hàng',
  '/tra-gop': 'Mua hàng trả góp',
  '/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones': 'Mua hàng trả góp bằng thẻ tín dụng',
  '/chinh-sach/chinh-sach-doi-tra': 'Chính sách đổi trả',
  '/smember/tra-diem': 'Tra điểm Smember',
  '/uu-dai-smember': 'Xem ưu đãi Smember',
  '/smember/uu-dai': 'Ưu đãi Smember',
  '/smember': 'Smember',
  '/bao-hanh/tra-thong-tin-bao-hanh': 'Tra thông tin bảo hành',
  '/hoa-don/tra-cuu-hoa-don-dien-tu': 'Tra cứu hoá đơn điện tử',
  '/chinh-sach-bao-hanh': 'Chính sách bảo hành',
  '/bao-hanh/apple': 'Trung tâm bảo hành chính hãng',
  '/chinh-sach-khui-hop-apple': 'Chính sách khui hộp sản phẩm Apple',
  '/vat-refund': 'VAT Refund',
  '/dich-vu-khach-hang-doanh-nghiep': 'Khách hàng doanh nghiệp (B2B)',
  '/dich-vu/khach-hang-doanh-nghiep-b2b': 'Khách hàng doanh nghiệp (B2B)',
  '/danh-sach-khuyen-mai': 'Ưu đãi thanh toán',
  '/khuyen-mai/uu-dai-thanh-toan': 'Ưu đãi thanh toán',
  '/chinh-sach/quy-che-hoat-dong': 'Quy chế hoạt động',
  '/chinh-sach-bao-mat': 'Chính sách bảo mật thông tin cá nhân',
  '/chinh-sach/chinh-sach-bao-mat-thong-tin-ca-nhan': 'Chính sách bảo mật thông tin cá nhân',
  '/chinh-sach/chinh-sach-bao-hanh': 'Chính sách Bảo hành',
  '/lien-he-hop-tac': 'Liên hệ hợp tác kinh doanh',
  '/bieu-phi-bao-hanh-mo-rong': 'Dịch vụ bảo hành mở rộng',
  '/quy-dinh-ve-viec-sao-luu-du-lieu': 'Quy định về việc sao lưu dữ liệu',
  '/quy-dinh-ve-hoa-don-khi-mua-hang-cellphones': 'Thông tin hoá đơn mua hàng',
  '/download-app': 'Tải ứng dụng CellphoneS',
  '/khuyen-mai/dang-ky-nhan-tin': 'Đăng ký nhận tin khuyến mãi',
  '/tuyen-dung': 'Tuyển dụng CellphoneS',
  '/he-thong-cua-hang': 'Hệ thống cửa hàng CellphoneS',
  '/tra-cuu-don-hang': 'Tra cứu đơn hàng',
  '/lien-he': 'Liên hệ CellphoneS',
  '/support': 'Góp ý - Phản hồi - Hỗ trợ',
  '/dieu-khoan-su-dung': 'Điều khoản sử dụng',
  '/tos': 'Quy chế hoạt động',
  '/thanh-vien/dienthoaivui': 'Điện Thoại Vui',
  '/thanh-vien/cares': 'CareS',
  '/thanh-vien/schannel': 'SChannel',
  '/thanh-vien/sforum': 'Sforum',
  '/ket-noi/youtube': 'YouTube CellphoneS',
  '/ket-noi/facebook': 'Facebook CellphoneS',
  '/ket-noi/instagram': 'Instagram CellphoneS',
  '/ket-noi/tiktok': 'TikTok CellphoneS',
  '/ket-noi/zalo': 'Zalo CellphoneS',
};

const directLabelRoutes = [
  { keywords: ['mua hang va thanh toan online', 'chinh sach mua hang'], path: '/chinh-sach/mua-hang-va-thanh-toan-online' },
  { keywords: ['mua hang tra gop bang the tin dung', 'tra gop bang the tin dung'], path: '/huong-dan-mua-hang-tra-gop-bang-the-tin-dung-tai-cellphones' },
  { keywords: ['mua hang tra gop', 'tra gop'], path: '/tra-gop' },
  { keywords: ['chinh sach giao hang', 'giao hang'], path: '/chinh-sach-giao-hang' },
  { keywords: ['chinh sach doi tra', 'doi tra'], path: '/tos?part=refund-policy' },
  { keywords: ['tra diem smember'], path: '/smember/tra-diem' },
  { keywords: ['xem uu dai smember', 'uu dai smember'], path: '/uu-dai-smember' },
  { keywords: ['tra thong tin bao hanh'], path: '/bao-hanh/tra-thong-tin-bao-hanh' },
  { keywords: ['trung tam bao hanh chinh hang', 'danh sach trung tam bao hanh', 'trung tam bao hanh uy quyen apple'], path: '/bao-hanh/apple' },
  { keywords: ['chinh sach bao hanh'], path: '/chinh-sach-bao-hanh' },
  { keywords: ['tra cuu hoa don dien tu'], path: '/hoa-don/tra-cuu-hoa-don-dien-tu' },
  { keywords: ['thong tin hoa don mua hang'], path: '/quy-dinh-ve-hoa-don-khi-mua-hang-cellphones' },
  { keywords: ['quy dinh ve viec sao luu du lieu', 'sao luu du lieu'], path: '/quy-dinh-ve-viec-sao-luu-du-lieu' },
  { keywords: ['chinh sach khui hop san pham apple', 'khui hop san pham apple'], path: '/chinh-sach-khui-hop-apple' },
  { keywords: ['vat refund'], path: '/vat-refund' },
  { keywords: ['khach hang doanh nghiep', 'b2b'], path: '/dich-vu-khach-hang-doanh-nghiep' },
  { keywords: ['uu dai thanh toan'], path: '/danh-sach-khuyen-mai' },
  { keywords: ['quy che hoat dong'], path: '/tos' },
  { keywords: ['bao mat thong tin ca nhan', 'chinh sach bao mat'], path: '/tos?part=privacy-policy' },
  { keywords: ['lien he hop tac kinh doanh'], path: '/lien-he-hop-tac' },
  { keywords: ['gop y phan hoi ho tro', 'phan hoi ho tro', 'ho tro khach hang'], path: '/support' },
  { keywords: ['dich vu bao hanh mo rong', 'bao hanh mo rong'], path: '/bieu-phi-bao-hanh-mo-rong' },
  { keywords: ['dieu khoan su dung'], path: '/dieu-khoan-su-dung' },
];

const getDirectRouteForLabel = (text) => {
  const slug = createSiteSlug(text);
  const directMatch = directLabelRoutes.find((rule) => (
    rule.keywords.some((keyword) => slug.includes(createSiteSlug(keyword)))
  ));

  return directMatch?.path || '';
};

export function getRouteForLabel(label = '', fallbackGroup = 'info') {
  const text = String(label || '').trim();
  if (!text) return '/';

  const slug = createSiteSlug(text);
  const directRoute = getDirectRouteForLabel(text);
  if (directRoute) return directRoute;

  if (normalizedIncludes(text, 'cua hang')) return '/he-thong-cua-hang';
  if (normalizedIncludes(text, 'tra cuu don hang')) return '/tra-cuu-don-hang';
  if (normalizedIncludes(text, 'lien he')) return '/lien-he';
  if (normalizedIncludes(text, 'tai app') || normalizedIncludes(text, 'ung dung')) return '/download-app';
  if (normalizedIncludes(text, 'tuyen dung')) return '/tuyen-dung';
  if (normalizedIncludes(text, 'uu dai smember')) return '/smember/uu-dai';
  if (normalizedIncludes(text, 'tra diem smember')) return '/smember/tra-diem';
  if (normalizedIncludes(text, 'bao hanh')) return `/bao-hanh/${slug}`;
  if (normalizedIncludes(text, 'hoa don')) return `/hoa-don/${slug}`;
  if (
    normalizedIncludes(text, 'chinh sach') ||
    normalizedIncludes(text, 'mua hang') ||
    normalizedIncludes(text, 'thanh toan') ||
    normalizedIncludes(text, 'tra gop') ||
    normalizedIncludes(text, 'giao hang') ||
    normalizedIncludes(text, 'doi tra') ||
    normalizedIncludes(text, 'vat') ||
    normalizedIncludes(text, 'sao luu') ||
    normalizedIncludes(text, 'khui hop')
  ) {
    return `/chinh-sach/${slug}`;
  }
  if (normalizedIncludes(text, 'khuyen mai') || normalizedIncludes(text, 'voucher')) return `/khuyen-mai/${slug}`;
  if (normalizedIncludes(text, 'tin cong nghe') || normalizedIncludes(text, 'tin tuc')) return `/tin-tuc/${slug}`;
  if (['apple-pay', 'vnpay', 'momo', 'onepay', 'mpos', 'kredivo', 'zalopay', 'fundiin'].includes(slug)) {
    return `/thanh-toan/${slug}`;
  }

  if (fallbackGroup === 'category') return buildCategoryPath(text);
  if (fallbackGroup === 'policy') return `/chinh-sach/${slug}`;
  if (fallbackGroup === 'service') return `/dich-vu/${slug}`;
  if (fallbackGroup === 'news') return `/tin-tuc/${slug}`;
  if (fallbackGroup === 'promo') return `/khuyen-mai/${slug}`;
  if (fallbackGroup === 'payment') return `/thanh-toan/${slug}`;

  return buildSearchPath(text);
}

export function getRouteForDeadAnchor(anchor) {
  const label = (
    anchor?.getAttribute('aria-label') ||
    anchor?.getAttribute('title') ||
    anchor?.textContent ||
    anchor?.querySelector('img')?.getAttribute('alt') ||
    ''
  ).trim();
  const className = anchor?.className ? String(anchor.className) : '';

  if (className.includes('category') || className.includes('brand') || className.includes('filter')) {
    return getRouteForLabel(label, 'category');
  }
  if (className.includes('promo')) return getRouteForLabel(label, 'promo');
  if (className.includes('news')) return getRouteForLabel(label, 'news');
  if (className.includes('payment')) return getRouteForLabel(label, 'payment');
  if (className.includes('footer')) return getRouteForLabel(label, 'service');

  return getRouteForLabel(label);
}

export function getInfoRouteKind(pathname = '') {
  const cleaned = pathname.replace(/\/+$/g, '') || '/';
  if (cleaned === '/') return '';
  const resolved = resolvePublicRoute(cleaned);
  if (resolved.handling === 'internal' && resolved.appPage === 'info') return 'info';
  if (
    directInfoRoutes[cleaned] ||
    cleaned === '/search' ||
    cleaned.startsWith('/category/') ||
    cleaned.startsWith('/chinh-sach/') ||
    cleaned.startsWith('/dich-vu/') ||
    cleaned.startsWith('/thanh-toan/') ||
    cleaned.startsWith('/tin-tuc/') ||
    cleaned.startsWith('/khuyen-mai/') ||
    cleaned.startsWith('/bao-hanh/') ||
    cleaned.startsWith('/hoa-don/') ||
    cleaned.startsWith('/smember/') ||
    cleaned.startsWith('/thanh-vien/') ||
    cleaned.startsWith('/ket-noi/') ||
    [
      '/he-thong-cua-hang',
      '/tra-cuu-don-hang',
      '/lien-he',
      '/download-app',
      '/tuyen-dung',
      '/stores',
      '/orders',
    ].includes(cleaned)
  ) {
    return 'info';
  }
  return '';
}

export function buildInfoPageModel(pathname = '', search = '') {
  const params = new URLSearchParams(search);
  const categoryLanding = resolveCategoryLandingProfile(pathname);
  const categoryRoute = getCategoryRouteModel(pathname);
  const resolvedRoute = resolvePublicRoute(pathname, search);
  const officialRefrigeratorType = params.get('tulanh_kieu_tu_filter') || '';
  const officialRefrigeratorQuery = {
    'ngan-da-tren': 'Tủ lạnh ngăn đá trên',
    'ngan-da-duoi': 'Tủ lạnh ngăn đá dưới',
    'nhieu-canh': 'Tủ lạnh nhiều cánh',
    'side-by-side': 'Tủ lạnh Side By Side',
  }[officialRefrigeratorType] || '';
  const keyword = params.get('key')
    || params.get('keyword')
    || categoryLanding?.title
    || categoryRoute?.keyword
    || '';
  const categoryParam = params.get('category')
    || categoryLanding?.category
    || categoryRoute?.category
    || '';
  const brand = params.get('brand') || categoryLanding?.brand || '';
  const q = params.get('q')
    || officialRefrigeratorQuery
    || categoryLanding?.queryPreset?.q
    || '';
  const segment = params.get('segment') || '';
  const series = params.get('series') || categoryLanding?.queryPreset?.series || '';
  const sort = params.get('sort') || 'latest';
  const filter = params.get('filter') || '';
  const facet = params.get('facet') || '';
  const inStock = params.get('inStock') || categoryLanding?.queryPreset?.inStock || '';
  const priceMin = params.get('priceMin') || categoryLanding?.queryPreset?.priceMin || '';
  const priceMax = params.get('priceMax') || categoryLanding?.queryPreset?.priceMax || '';
  const ram = params.get('ram') || categoryLanding?.queryPreset?.ram || '';
  const storage = params.get('storage') || categoryLanding?.queryPreset?.storage || '';
  const screenSize = params.get('screenSize')
    || params.get('screen_size')
    || categoryLanding?.queryPreset?.screenSize
    || '';
  const usage = params.get('usage') || categoryLanding?.queryPreset?.usage || '';
  const display = params.get('display') || categoryLanding?.queryPreset?.display || '';
  const camera = params.get('camera') || categoryLanding?.queryPreset?.camera || '';
  const refreshRate = params.get('refreshRate')
    || params.get('refresh_rate')
    || categoryLanding?.queryPreset?.refreshRate
    || '';
  const special = params.get('special') || categoryLanding?.queryPreset?.special || '';
  const chip = params.get('chip') || categoryLanding?.queryPreset?.chip || '';
  const nfc = params.get('nfc') || categoryLanding?.queryPreset?.nfc || '';
  const titleParam = params.get('title') || '';
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const root = resolvedRoute.pageType === 'search'
    ? 'search'
    : (categoryRoute ? 'category' : (segments[0] || 'info'));
  const slug = categoryRoute
    ? createSiteSlug(categoryRoute.keyword)
    : (segments[1] || createSiteSlug(keyword || root));
  const cleanedPath = pathname.replace(/\/+$/g, '') || '/';
  const tosPart = cleanedPath === '/tos' ? params.get('part') : '';
  const tosTitleByPart = {
    'refund-policy': 'Chính sách đổi trả',
    'privacy-policy': 'Chính sách bảo mật thông tin cá nhân',
  };
  const directTitle = tosTitleByPart[tosPart] || directInfoRoutes[cleanedPath] || '';
  const titleFromSlug = slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  const categoryTitle = titleParam
    || categoryLanding?.title
    || keyword
    || categoryParam
    || titleFromSlug
    || 'Danh mục sản phẩm';
  const baseTitle = directTitle || keyword || titleParam || titleFromSlug || 'CellphoneS';
  const isListing = root === 'search' || root === 'category';

  const titles = {
    search: `Kết quả tìm kiếm: ${keyword || q || 'CellphoneS'}`,
    category: categoryTitle,
    'chinh-sach': baseTitle,
    'dich-vu': baseTitle,
    'thanh-toan': `Phương thức thanh toán ${baseTitle}`,
    'tin-tuc': baseTitle,
    'khuyen-mai': baseTitle,
    'bao-hanh': baseTitle,
    'hoa-don': baseTitle,
    smember: baseTitle,
    'thanh-vien': baseTitle,
    'ket-noi': baseTitle,
    'he-thong-cua-hang': 'Hệ thống cửa hàng CellphoneS',
    stores: 'Hệ thống cửa hàng CellphoneS',
    'tra-cuu-don-hang': 'Tra cứu đơn hàng',
    orders: 'Tra cứu đơn hàng',
    'lien-he': 'Liên hệ CellphoneS',
    'download-app': 'Tải ứng dụng CellphoneS',
    'tuyen-dung': 'Tuyển dụng CellphoneS',
  };

  const title = directTitle || titles[root] || baseTitle;
  const listingCategory = root === 'category'
    ? (categoryParam || keyword || titleFromSlug)
    : '';

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
    series,
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
    chip,
    nfc,
    categoryLanding,
    landingPath: categoryLanding?.landingPath || '',
    queryPreset: categoryLanding?.queryPreset || null,
    isBrandCategory: root === 'category' && Boolean(brand),
    isListing,
    title,
    eyebrow: root === 'search' || root === 'category' ? 'Sản phẩm' : 'Thông tin CellphoneS',
    description: isListing
      ? 'Danh sách sản phẩm được lọc đúng theo danh mục, hãng và tiêu chí bạn chọn từ MongoDB/API.'
      : 'Trang nội dung nội bộ giúp mọi liên kết trên giao diện có điểm đến rõ ràng, có thể thay bằng bài viết/chính sách thật từ admin sau này.',
  };
}
