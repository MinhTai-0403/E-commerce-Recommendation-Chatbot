import { CATALOG_LANDING_PROFILES } from './catalogLandingProfiles';

const banner = (image, alt, href) => ({ image, alt, href });
const quickLink = (label, href, query = label, queryPreset = {}) => ({
  label,
  href,
  query,
  queryPreset,
});

const PHONE_PARENT = {
  department: 'phone',
  category: 'Điện thoại',
  parentPath: '/mobile.html',
  parentTitle: 'Điện thoại',
  template: 'brand-listing',
};

const APPLE_FILTER_IDS = [
  'all',
  'in-stock',
  'new',
  'price',
  'storage',
  'ram',
  'screen-size',
  'usage',
  'display',
  'camera',
  'refresh-rate',
  'special',
];

const PHONE_FILTER_IDS_BY_SLUG = {
  apple: APPLE_FILTER_IDS,
  samsung: [
    'all', 'in-stock', 'new', 'price', 'display', 'camera', 'ram', 'storage',
    'special', 'refresh-rate', 'chip', 'usage', 'nfc',
  ],
  oppo: [
    'all', 'in-stock', 'new', 'price', 'display', 'camera', 'nfc', 'ram',
    'storage', 'special', 'refresh-rate', 'usage', 'chip',
  ],
  xiaomi: [
    'all', 'in-stock', 'new', 'price', 'usage', 'ram', 'storage', 'display',
    'refresh-rate', 'camera', 'special', 'chip', 'nfc',
  ],
  honor: [
    'all', 'in-stock', 'new', 'price', 'camera', 'nfc', 'ram', 'storage',
    'special', 'refresh-rate', 'usage', 'chip', 'display',
  ],
  realme: [
    'all', 'in-stock', 'new', 'price', 'display', 'camera', 'nfc', 'ram',
    'storage', 'special', 'refresh-rate', 'usage', 'chip',
  ],
  tecno: [
    'all', 'in-stock', 'new', 'price', 'nfc', 'ram', 'storage', 'chip',
    'screen-size', 'display', 'special', 'refresh-rate', 'usage', 'camera',
  ],
  nubia: [
    'all', 'in-stock', 'new', 'price', 'nfc', 'ram', 'storage', 'chip',
    'screen-size', 'display', 'camera', 'special', 'refresh-rate', 'usage',
  ],
  sony: [
    'all', 'in-stock', 'new', 'price', 'ram', 'storage', 'display', 'camera',
    'special', 'usage',
  ],
  nokia: ['all', 'in-stock', 'new', 'price', 'ram', 'storage', 'screen-size', 'camera'],
  infinix: [
    'all', 'in-stock', 'new', 'price', 'chip', 'display', 'ram', 'storage',
    'special', 'refresh-rate', 'usage', 'nfc', 'camera',
  ],
  'nothing-phone': [
    'all', 'in-stock', 'new', 'price', 'ram', 'storage', 'camera', 'special', 'usage',
  ],
  masstel: ['all', 'in-stock', 'new', 'price', 'storage'],
  itel: [
    'all', 'in-stock', 'new', 'price', 'display', 'camera', 'nfc', 'ram',
    'storage', 'refresh-rate', 'usage', 'chip',
  ],
  huawei: [
    'all', 'in-stock', 'new', 'price', 'nfc', 'ram', 'storage', 'display',
    'camera', 'special', 'refresh-rate', 'usage',
  ],
  meizu: [
    'all', 'in-stock', 'new', 'price', 'display', 'camera', 'ram', 'storage',
    'special', 'refresh-rate', 'usage', 'chip', 'nfc',
  ],
  vivo: [
    'all', 'in-stock', 'new', 'price', 'display', 'camera', 'ram', 'storage',
    'special', 'refresh-rate', 'usage', 'chip', 'nfc',
  ],
  oneplus: ['all', 'in-stock', 'new', 'price', 'nfc', 'ram', 'storage', 'refresh-rate'],
  tcl: ['all', 'in-stock', 'new', 'price', 'ram', 'storage'],
  benco: ['all', 'in-stock', 'new', 'price', 'usage'],
  asus: ['all', 'in-stock', 'new', 'price', 'ram', 'storage', 'usage', 'camera', 'special'],
};

const IPHONE_BANNERS = [
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/595x100_iPhone17ProMax_07_2026.png',
    'iPhone 17 Pro Max 256GB | Chính hãng',
    '/iphone-17-pro-max.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/595x100_iPhone16etainghe_072026.png',
    'iPhone 16e',
    '/iphone-16e.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/595x100_iPhoneAir_07_2026.png',
    'iPhone Air',
    '/mobile/apple/iphone-air.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/595x100_iPhone17e_07_2026.png',
    'iPhone 17e',
    '/iphone-17e.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/595x100_iPhone%2017_07_2026.png',
    'iPhone 17 256GB',
    '/iphone-17-256gb.html',
  ),
];

const SAMSUNG_BANNERS = [
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Z8_Cate_3.png',
    'Samsung Galaxy Z Fold8 Ultra 5G',
    '/dien-thoai-samsung-galaxy-z-fold-8-ultra.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cate_dt_samsung.png',
    'Điện thoại Samsung Galaxy',
    '/mobile/samsung.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/samsung-galaxy-s25-edge-cate.png',
    'Samsung Galaxy S25 Edge',
    '/dien-thoai-samsung-galaxy-s25-edge.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cates26ggg.png',
    'Samsung Galaxy S26',
    '/dien-thoai-samsung-galaxy-s26-ultra.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/A27_cate.png',
    'Samsung Galaxy A27 5G',
    '/dien-thoai-samsung-galaxy-a27.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cate_a57.png',
    'Samsung Galaxy A57 5G',
    '/dien-thoai-samsung-galaxy-a57.html',
  ),
];

const OPPO_BANNERS = [
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cate_dt_OPPO.png',
    'Điện thoại OPPO',
    '/mobile/oppo.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/oppo-reno-16-f-cate.jpg',
    'OPPO Reno16 F',
    '/dien-thoai-oppo-reno16-f.html',
  ),
];

const XIAOMI_BANNERS = [
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cate-dt-xiaomi.png',
    'Điện thoại Xiaomi',
    '/mobile/xiaomi.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/xiaomi-17t-cate-0726.png',
    'Xiaomi 17T 5G',
    '/dien-thoai-xiaomi-17t.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/cate_RedmiA7.jpg',
    'Xiaomi Redmi A7',
    '/dien-thoai-xiaomi-redmi-a7.html',
  ),
];

const HONOR_BANNERS = [
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cate_dt_HONOR.png',
    'Điện thoại HONOR',
    '/mobile/honor.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/honor-x9d-8gb-256gb.png',
    'HONOR X9d 5G',
    '/dien-thoai-honor-x9d-8gb-256gb.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/cate_Honor600_opensale.jpg',
    'HONOR 600 5G',
    '/dien-thoai-honor-600.html',
  ),
  banner(
    'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/cate_595x100.jpg',
    'HONOR X7d',
    '/dien-thoai-honor-x7d-8gb-128gb.html',
  ),
];

const phoneProfiles = [
  {
    ...PHONE_PARENT,
    id: 'phone-apple',
    path: '/mobile/apple.html',
    brand: 'apple',
    title: 'iPhone',
    breadcrumbTitle: 'Apple',
    filterIds: PHONE_FILTER_IDS_BY_SLUG.apple,
    seoTitle: 'iPhone (Apple) chính hãng, giá tốt, góp 0% từ 0đ T07/2026',
    banners: IPHONE_BANNERS,
    quickLinks: [
      quickLink('iPhone 17 Series', '/mobile/apple/iphone-17.html', 'iPhone 17'),
      quickLink('iPhone Air', '/mobile/apple/iphone-air.html', 'iPhone Air'),
      quickLink('iPhone 16 Series', '/mobile/apple/iphone-16.html', 'iPhone 16'),
      quickLink('iPhone 15 Series', '/mobile/apple/iphone-15.html', 'iPhone 15'),
      quickLink('iPhone 14 Series', '/mobile/apple/iphone-14.html', 'iPhone 14'),
      quickLink('iPhone 13 Series', '/mobile/apple/iphone-13.html', 'iPhone 13'),
    ],
  },
  {
    ...PHONE_PARENT,
    id: 'phone-samsung',
    path: '/mobile/samsung.html',
    brand: 'samsung',
    title: 'Điện thoại Samsung Galaxy',
    breadcrumbTitle: 'Samsung',
    filterIds: PHONE_FILTER_IDS_BY_SLUG.samsung,
    seoTitle: 'Điện thoại Samsung Galaxy [A, S, Z] giá tốt, giảm đến 11tr',
    banners: SAMSUNG_BANNERS,
    quickLinks: [
      quickLink('Galaxy S', '/mobile/samsung/galaxy-s.html', 'Samsung Galaxy S', { series: 'galaxy-s' }),
      quickLink('Galaxy A', '/mobile/samsung/galaxy-a.html', 'Samsung Galaxy A', { series: 'galaxy-a' }),
      quickLink('Galaxy M', '/mobile/samsung/galaxy-m.html', 'Samsung Galaxy M', { series: 'galaxy-m' }),
      quickLink('Galaxy Z', '/mobile/samsung/galaxy-z.html', 'Samsung Galaxy Z', { series: 'galaxy-z' }),
      quickLink('Galaxy Z8 Series', '/mobile/samsung/galaxy-z/z8-series.html', 'Galaxy Z8', { series: 'galaxy-z8' }),
      quickLink('Galaxy Z7 Series', '/mobile/samsung/galaxy-z/z7-series.html', 'Galaxy Z7', { series: 'galaxy-z7' }),
      quickLink('Galaxy S26 Series', '/mobile/samsung/galaxy-s/s26-series.html', 'Galaxy S26', { series: 'galaxy-s26' }),
      quickLink('Galaxy S25 Series', '/mobile/samsung/galaxy-s/s25-series.html', 'Galaxy S25', { series: 'galaxy-s25' }),
    ],
  },
  {
    ...PHONE_PARENT,
    id: 'phone-oppo',
    path: '/mobile/oppo.html',
    brand: 'oppo',
    title: 'Điện thoại OPPO',
    breadcrumbTitle: 'OPPO',
    filterIds: PHONE_FILTER_IDS_BY_SLUG.oppo,
    banners: OPPO_BANNERS,
    quickLinks: [
      quickLink('A Series', '/mobile/oppo/a-series.html', 'OPPO A', { series: 'oppo-a' }),
      quickLink('Find X Series', '/mobile/oppo/find-x-series.html', 'OPPO Find X', { series: 'oppo-find-x' }),
      quickLink('Find N Series', '/mobile/oppo/find-n-series.html', 'OPPO Find N', { series: 'oppo-find-n' }),
      quickLink('Reno Series', '/mobile/oppo/reno-series.html', 'OPPO Reno', { series: 'oppo-reno' }),
    ],
  },
  {
    ...PHONE_PARENT,
    id: 'phone-xiaomi',
    path: '/mobile/xiaomi.html',
    brand: 'xiaomi',
    title: 'Điện thoại Xiaomi',
    breadcrumbTitle: 'Xiaomi',
    filterIds: PHONE_FILTER_IDS_BY_SLUG.xiaomi,
    banners: XIAOMI_BANNERS,
    quickLinks: [
      quickLink('Xiaomi 17 Series', '/mobile/xiaomi/17-series.html', 'Xiaomi 17'),
      quickLink('Xiaomi 15 Series', '/mobile/xiaomi/15-series.html', 'Xiaomi 15'),
      quickLink('Xiaomi 14 Series', '/mobile/xiaomi/14-series.html', 'Xiaomi 14'),
      quickLink('Xiaomi 13 Series', '/mobile/xiaomi/13-series.html', 'Xiaomi 13'),
      quickLink('Xiaomi 12 Series', '/mobile/xiaomi/12-series.html', 'Xiaomi 12'),
      quickLink('Note 15 Series', '/mobile/xiaomi/redmi/note-15-series.html', 'Redmi Note 15'),
      quickLink('Note 14 Series', '/mobile/xiaomi/redmi/note-14-series.html', 'Redmi Note 14'),
      quickLink('Note 13 Series', '/mobile/xiaomi/redmi/note-13-series.html', 'Redmi Note 13'),
      quickLink('Redmi Series', '/mobile/xiaomi/redmi.html', 'Xiaomi Redmi'),
    ],
  },
  {
    ...PHONE_PARENT,
    id: 'phone-honor',
    path: '/mobile/honor.html',
    brand: 'honor',
    title: 'Điện thoại HONOR',
    breadcrumbTitle: 'HONOR',
    filterIds: PHONE_FILTER_IDS_BY_SLUG.honor,
    banners: HONOR_BANNERS,
    quickLinks: [],
  },
  {
    ...PHONE_PARENT,
    id: 'phone-realme',
    path: '/mobile/realme.html',
    brand: 'realme',
    title: 'Điện thoại Realme',
    breadcrumbTitle: 'Realme',
    filterIds: PHONE_FILTER_IDS_BY_SLUG.realme,
    banners: [],
    quickLinks: [
      quickLink('C Series', '/mobile/realme/c-series.html', 'Realme C'),
    ],
  },
];

const remainingPhoneBrands = [
  {
    slug: 'tecno',
    brand: 'tecno',
    title: 'Điện thoại Tecno',
    seoTitle: 'Điện thoại Tecno [Pova, Spark, Camon] giảm 28%, trả góp 0%',
    banners: [
      banner(
        'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cate-dt-tecno.png',
        'Điện thoại Tecno',
        '/mobile/tecno.html',
      ),
      banner(
        'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/tecno-spark-50-cate-0725.png',
        'TECNO Spark 50 4GB 128GB',
        '/dien-thoai-tecno-spark-50.html',
      ),
    ],
  },
  {
    slug: 'nubia',
    brand: 'nubia',
    title: 'Điện thoại Nubia',
    seoTitle: 'Điện thoại Nubia [Neo, V, Z] giảm đến 6tr, góp 0%, tặng sim',
    banners: [
      banner(
        'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cate_dtNubia.png',
        'Điện thoại Nubia',
        '/mobile/nubia.html',
      ),
      banner(
        'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/nubia-v80-cate-0726.png',
        'Nubia V80',
        '/dien-thoai-nubia-v80-design-4gb-128gb.html',
      ),
      banner(
        'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/cate_nubianeo5series.jpg',
        'Nubia Neo 5 5G',
        '/dien-thoai-nubia-neo-5-5g.html',
      ),
      banner(
        'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/nubianeo5-newcate.png',
        'Nubia Neo 5 GT Special Edition 12GB 256GB',
        '/dien-thoai-nubia-neo-5-gt-special-edition.html',
      ),
    ],
  },
  {
    slug: 'sony',
    brand: 'sony',
    title: 'Điện thoại Sony Xperia',
    seoTitle: 'Điện thoại Sony Xperia chính hãng | Giá rẻ, trả góp 0%',
    banners: [
      banner(
        'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Slidingcate_SonyXperia10VII.jpg',
        'Sony Xperia 10 VII 8GB 128GB',
        '/dien-thoai-sony-xperia-10-vii.html',
      ),
    ],
  },
  {
    slug: 'nokia',
    brand: 'nokia',
    title: 'Điện thoại Nokia',
    seoTitle: 'Điện thoại Nokia giá tốt 07/2026 | Bảo hành chính hãng',
  },
  {
    slug: 'infinix',
    brand: 'infinix',
    title: 'Điện thoại Infinix',
    seoTitle: 'Điện thoại Infinix | Chính hãng, giá tốt tháng 07/2026',
  },
  {
    slug: 'nothing-phone',
    brand: 'nothing',
    title: 'Nothing Phone',
    seoTitle: 'Điện thoại Nothing Phone chính hãng mở bán tại CellphoneS',
  },
  {
    slug: 'masstel',
    brand: 'masstel',
    title: 'Điện thoại Masstel',
    seoTitle: 'Điện thoại Masstel chính hãng, giá rẻ 07/2026, góp 0%',
    banners: [
      banner(
        'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/mobile-masstel-cate-0925.jpg',
        'Điện thoại Masstel',
        '/mobile/masstel.html',
      ),
    ],
  },
  {
    slug: 'itel',
    brand: 'itel',
    title: 'Điện thoại Itel',
    seoTitle: 'Điện thoại iTel [P, S, RS] Giảm đến 40%, Góp 0%, Tặng Sim',
    banners: [
      banner(
        'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/dien-thoai-itel-p55-plus-cate-0425.png',
        'Điện thoại itel P55 Plus 8GB 256GB',
        '/dien-thoai-itel-p55-plus-8gb-256gb.html',
      ),
    ],
  },
  {
    slug: 'huawei',
    brand: 'huawei',
    title: 'Điện thoại Huawei',
    seoTitle: 'Huawei - Điện thoại Huawei giá rẻ, thu cũ đổi mới, trả góp 0%',
    banners: [
      banner(
        'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/huawei-mate-x7-home-0226.png',
        'Huawei Mate X7',
        '/dien-thoai-huawei-mate-x7.html',
      ),
    ],
  },
  {
    slug: 'meizu',
    brand: 'meizu',
    title: 'Điện thoại Meizu',
    seoTitle: 'Điện thoại Meizu chính hãng, bảo hành VIP, giá rẻ 07/2026',
  },
  {
    slug: 'vivo',
    brand: 'vivo',
    title: 'Điện thoại vivo',
    seoTitle: 'Điện thoại smartphone VIVO chính hãng, giá rẻ 07/2026',
  },
  {
    slug: 'oneplus',
    brand: 'oneplus',
    title: 'Điện thoại OnePlus',
    seoTitle: 'Điện thoại OnePlus | Giá rẻ, thu cũ đổi mới, trả góp 0%',
  },
  {
    slug: 'tcl',
    brand: 'tcl',
    title: 'Điện thoại TCL | Chính hãng',
    seoTitle: 'Điện thoại TCL chính hãng | Giá rẻ giảm sâu, bảo hành VIP',
  },
  {
    slug: 'benco',
    brand: 'benco',
    title: 'Điện thoại Benco',
    seoTitle: 'Điện thoại BENCO giá siêu rẻ, đủ chức năng, trả góp 0%',
  },
  {
    slug: 'asus',
    brand: 'asus',
    title: 'Điện thoại ASUS',
    seoTitle: 'Điện thoại ASUS ROG Phone - Zenfone | Giá rẻ, thu cũ đổi mới',
  },
].map(({
  slug,
  brand,
  title,
  seoTitle,
  banners = [],
}) => ({
  ...PHONE_PARENT,
  id: `phone-${slug}`,
  path: `/mobile/${slug}.html`,
  brand,
  title,
  breadcrumbTitle: title.replace(/^Điện thoại\s+/i, ''),
  seoTitle,
  filterIds: PHONE_FILTER_IDS_BY_SLUG[slug] || APPLE_FILTER_IDS,
  banners,
  quickLinks: [],
}));

const makeBrandProfiles = ({
  department,
  category,
  parentPath,
  parentTitle,
  items,
}) => {
  const catalogParent = CATALOG_LANDING_PROFILES.find((profile) => profile.path === parentPath);

  return items.map(([slug, brand, title]) => ({
    id: `${department}-${slug}`,
    path: `${parentPath.replace(/\.html$/, '')}/${slug}.html`,
    department,
    category,
    parentPath,
    parentTitle,
    template: 'brand-listing',
    brand,
    title,
    breadcrumbTitle: title
      .replace(/^Máy tính bảng\s+/i, '')
      .replace(/^Laptop\s+/i, ''),
    banners: catalogParent?.banners || [],
    topNavigation: catalogParent?.topNavigation || [],
    filterIds: catalogParent?.filterIds || [],
    quickLinks: [],
  }));
};

const tabletProfiles = makeBrandProfiles({
  department: 'tablet',
  category: 'Máy tính bảng',
  parentPath: '/tablet.html',
  parentTitle: 'Máy tính bảng',
  items: [
    ['ipad', 'apple', 'iPad'],
    ['samsung', 'samsung', 'Máy tính bảng Samsung'],
    ['xiaomi', 'xiaomi', 'Máy tính bảng Xiaomi'],
    ['huawei', 'huawei', 'Máy tính bảng Huawei'],
    ['lenovo', 'lenovo', 'Máy tính bảng Lenovo'],
    ['teclast', 'teclast', 'Máy tính bảng Teclast'],
    ['honor', 'honor', 'Máy tính bảng HONOR'],
    ['oppo', 'oppo', 'Máy tính bảng OPPO'],
  ],
});

const laptopProfiles = makeBrandProfiles({
  department: 'laptop',
  category: 'Laptop',
  parentPath: '/laptop.html',
  parentTitle: 'Laptop',
  items: [
    ['mac', 'macbook', 'MacBook'],
    ['asus', 'asus', 'Laptop ASUS'],
    ['lenovo', 'lenovo', 'Laptop Lenovo'],
    ['msi', 'msi', 'Laptop MSI'],
    ['acer', 'acer', 'Laptop Acer'],
    ['hp', 'hp', 'Laptop HP'],
    ['dell', 'dell', 'Laptop Dell'],
    ['gigabyte', 'gigabyte', 'Laptop Gigabyte'],
    ['lg', 'lg', 'Laptop LG'],
    ['surface', 'microsoft', 'Microsoft Surface'],
    ['samsung', 'samsung', 'Laptop Samsung'],
    ['masstel', 'masstel', 'Laptop Masstel'],
  ],
});

export const CATEGORY_LANDING_PROFILES = [
  ...CATALOG_LANDING_PROFILES,
  ...phoneProfiles,
  ...remainingPhoneBrands,
  ...tabletProfiles,
  ...laptopProfiles,
];

const normalizePath = (pathname = '/') => {
  const clean = String(pathname || '/').split('?')[0].replace(/\/{2,}/g, '/').replace(/\/+$/g, '');
  return clean || '/';
};

const normalizeKey = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const profileByPath = new Map(
  CATEGORY_LANDING_PROFILES.map((profile) => [normalizePath(profile.path), profile]),
);

const profileByCategoryBrand = new Map(
  CATEGORY_LANDING_PROFILES
    .filter((profile) => profile.brand)
    .map((profile) => [
      `${normalizeKey(profile.category)}:${normalizeKey(profile.brand)}`,
      profile,
    ]),
);

const titleFromNestedPath = (pathname = '') => decodeURIComponent(
  normalizePath(pathname).split('/').pop() || '',
)
  .replace(/\.html$/i, '')
  .replace(/-/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function resolveCategoryLandingProfile(pathname = '/') {
  const path = normalizePath(pathname);
  const exact = profileByPath.get(path);
  if (exact) {
    return {
      ...exact,
      landingPath: exact.path,
      brandPath: exact.path,
      activeQuickLinkPath: '',
      isSeries: false,
      queryPreset: {
        category: exact.category,
        ...(exact.queryPreset || {}),
        ...(exact.brand ? { brand: exact.brand } : {}),
      },
    };
  }

  let parentProfile = CATEGORY_LANDING_PROFILES
    .filter((profile) => path.startsWith(`${profile.path.replace(/\.html$/, '')}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];

  let matchingLink = parentProfile
    ? [
      ...(parentProfile.quickLinks || []),
      ...(parentProfile.brandLinks || []),
      ...(parentProfile.featureSection?.items || []),
    ].find((item) => normalizePath(item.href) === path)
    : null;

  if (!matchingLink) {
    const directMatch = CATEGORY_LANDING_PROFILES
      .map((profile) => ({
        profile,
        link: [
          ...(profile.quickLinks || []),
          ...(profile.brandLinks || []),
          ...(profile.featureSection?.items || []),
        ].find((item) => normalizePath(item.href) === path),
      }))
      .find((entry) => entry.link);
    parentProfile = directMatch?.profile;
    matchingLink = directMatch?.link;
  }

  if (!matchingLink) return null;

  const title = matchingLink?.landingTitle || matchingLink?.label || titleFromNestedPath(path);
  const query = matchingLink?.query || title;
  const childPreset = matchingLink?.queryPreset || {};
  const isQuickLink = (parentProfile.quickLinks || []).includes(matchingLink);

  return {
    ...parentProfile,
    id: `${parentProfile.id}:${path}`,
    path,
    landingPath: path,
    brandPath: parentProfile.path,
    title,
    seoTitle: `${title} chính hãng, giá tốt, nhiều ưu đãi | CellphoneS`,
    seoDescription: `Mua ${title} chính hãng, trả góp 0% và giao hàng nhanh tại CellphoneS.`,
    brand: childPreset.brand || parentProfile.brand || '',
    activeQuickLinkPath: path,
    brandLinks: [],
    featureSection: null,
    promoPanel: null,
    featuredTitle: '',
    quickLinks: isQuickLink ? parentProfile.quickLinks : [],
    isRoot: false,
    isSeries: isQuickLink,
    queryPreset: {
      category: parentProfile.category,
      ...(parentProfile.queryPreset || {}),
      ...(parentProfile.brand ? { brand: parentProfile.brand } : {}),
      ...(Object.keys(childPreset).length
        ? childPreset
        : { q: query }),
    },
  };
}

export function getCategoryLandingPath(category = '', brand = '') {
  const staticProfile = profileByCategoryBrand.get(`${normalizeKey(category)}:${normalizeKey(brand)}`);
  if (staticProfile) return staticProfile.path;

  const categoryKey = normalizeKey(category);
  const brandKey = normalizeKey(brand);
  const rootProfile = CATALOG_LANDING_PROFILES.find((profile) => (
    normalizeKey(profile.category) === categoryKey
  ));
  const matchingBrand = (rootProfile?.brandLinks || []).find((item) => (
    normalizeKey(item.queryPreset?.brand || item.label) === brandKey
  ));

  return matchingBrand ? normalizePath(matchingBrand.href) : '';
}

export function getCategoryLandingProfileForBrand(category = '', brand = '') {
  return profileByCategoryBrand.get(`${normalizeKey(category)}:${normalizeKey(brand)}`) || null;
}
