import { buildCategoryPath } from '../../utils/linkRoutes';

const laptopBannerBase = 'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/';

export const laptopCategoryBanners = [
  {
    name: 'Laptop chính hãng',
    image: `${laptopBannerBase}sxfbsbsbfc.png`,
    href: '/laptop.html',
  },
  {
    name: 'MacBook Neo',
    image: `${laptopBannerBase}%E1%BB%B5yyjyyjyyj.png`,
    href: buildCategoryPath('Laptop', {
      brand: 'apple',
      q: 'MacBook Neo',
      keyword: 'MacBook Neo',
      title: 'MacBook Neo',
    }),
  },
  {
    name: 'MacBook cho học sinh sinh viên',
    image: `${laptopBannerBase}srbgfsdb.png`,
    href: '/laptop/sinh-vien.html?brand=apple',
  },
  {
    name: 'Acer Back to School',
    image: `${laptopBannerBase}dbnhd.jpg`,
    href: '/laptop/sinh-vien.html?brand=acer',
  },
  {
    name: 'Laptop Lenovo',
    image: `${laptopBannerBase}fhbxs.png`,
    href: buildCategoryPath('Laptop', {
      brand: 'lenovo',
      keyword: 'Laptop Lenovo',
      title: 'Laptop Lenovo',
    }),
  },
  {
    name: 'Laptop MSI',
    image: `${laptopBannerBase}dgva.png`,
    href: buildCategoryPath('Laptop', {
      brand: 'msi',
      keyword: 'Laptop MSI',
      title: 'Laptop MSI',
    }),
  },
  {
    name: 'Laptop HP Victus',
    image: `${laptopBannerBase}ththth.png`,
    href: buildCategoryPath('Laptop', {
      brand: 'hp',
      q: 'HP Victus',
      keyword: 'Laptop HP Victus',
      title: 'Laptop HP Victus',
    }),
  },
  {
    name: 'Laptop ASUS VivoBook',
    image: `${laptopBannerBase}thth.png`,
    href: buildCategoryPath('Laptop', {
      brand: 'asus',
      q: 'ASUS VivoBook',
      keyword: 'Laptop ASUS VivoBook',
      title: 'Laptop ASUS VivoBook',
    }),
  },
  {
    name: 'Laptop Gigabyte',
    image: `${laptopBannerBase}tgttg.png`,
    href: buildCategoryPath('Laptop', {
      brand: 'gigabyte',
      keyword: 'Laptop Gigabyte',
      title: 'Laptop Gigabyte',
    }),
  },
];

export const laptopCategoryBannerTracks = [
  laptopCategoryBanners.filter((_, index) => index % 2 === 0),
  laptopCategoryBanners.filter((_, index) => index % 2 === 1),
];

export const laptopBrandRoutes = {
  apple: '/laptop/mac.html',
  asus: '/laptop/asus.html',
  lenovo: '/laptop/lenovo.html',
  msi: '/laptop/msi.html',
  acer: '/laptop/acer.html',
  hp: '/laptop/hp.html',
  dell: '/laptop/dell.html',
  gigabyte: '/laptop/gigabyte.html',
  lg: '/laptop/lg.html',
  microsoft: '/laptop/surface.html',
  samsung: '/laptop/samsung.html',
  masstel: '/laptop/masstel.html',
};

const buildLaptopBrandBanner = (brand, fileName, name, query = '') => ({
  name,
  image: `${laptopBannerBase}${fileName}`,
  href: query
    ? `${laptopBrandRoutes[brand]}?q=${encodeURIComponent(query)}&sort=latest`
    : laptopBrandRoutes[brand],
});

export const laptopBrandLandingProfiles = {
  apple: {
    brand: 'apple',
    title: 'Macbook',
    banners: [
      buildLaptopBrandBanner('apple', 'thtteee.png', 'MacBook cho học sinh sinh viên', 'MacBook'),
      buildLaptopBrandBanner('apple', 'thyttth.png', 'MacBook Air', 'MacBook Air'),
    ],
    series: [
      ['MACBOOK AIR', 'MacBook Air'],
      ['MACBOOK PRO', 'MacBook Pro'],
      ['MAC MINI', 'Mac Mini'],
      ['MACBOOK NEO', 'MacBook Neo'],
      ['MAC STUDIO', 'Mac Studio'],
      ['STUDIO DISPLAY', 'Studio Display'],
      ['IMAC', 'iMac'],
    ],
    showVoucher: false,
  },
  asus: {
    brand: 'asus',
    title: 'Laptop ASUS',
    banners: [
      buildLaptopBrandBanner('asus', 'yyyyuuu.png', 'ASUS Gaming ROG Strix', 'ASUS ROG Strix'),
      buildLaptopBrandBanner('asus', 'ghhghghgg.png', 'ASUS Gaming V16', 'ASUS Gaming V16'),
    ],
    series: [
      ['VIVOBOOK', 'ASUS Vivobook'],
      ['VIVOBOOK S', 'ASUS Vivobook S'],
      ['GAMING', 'ASUS Gaming'],
      ['ZENBOOK', 'ASUS Zenbook'],
      ['EXPERTBOOK', 'ASUS ExpertBook'],
      ['ROG', 'ASUS ROG'],
      ['TUF', 'ASUS TUF'],
    ],
    showVoucher: true,
  },
  lenovo: {
    brand: 'lenovo',
    title: 'Laptop Lenovo',
    banners: [
      buildLaptopBrandBanner('lenovo', 'gh.png', 'Lenovo AI', 'Lenovo AI'),
      buildLaptopBrandBanner('lenovo', 'q%C6%B0qwwwwww.png', 'Lenovo Yoga', 'Lenovo Yoga'),
    ],
    series: [
      ['IDEAPAD', 'Lenovo IdeaPad'],
      ['THINKPAD', 'Lenovo ThinkPad'],
      ['GAMING', 'Lenovo Gaming'],
      ['YOGA', 'Lenovo Yoga'],
      ['THINKBOOK', 'Lenovo ThinkBook'],
      ['V SERIES', 'Lenovo V Series'],
      ['LOQ', 'Lenovo LOQ'],
      ['LEGION', 'Lenovo Legion'],
    ],
    showVoucher: true,
  },
  msi: {
    brand: 'msi',
    title: 'Laptop MSI',
    banners: [
      buildLaptopBrandBanner('msi', 'sfbhsxf.png', 'Laptop MSI Gaming', 'MSI Gaming'),
      buildLaptopBrandBanner('msi', 'frgbdfgdg.jpg', 'Laptop MSI Modern', 'MSI Modern'),
    ],
    series: [
      ['MODERN', 'MSI Modern'],
      ['GAMING', 'MSI Gaming'],
      ['PRESTIGE', 'MSI Prestige'],
      ['THIN / GF', 'MSI Thin'],
      ['CYBORG', 'MSI Cyborg'],
      ['BRAVO', 'MSI Bravo'],
      ['KATANA / SWORD', 'MSI Katana'],
      ['VENTURE', 'MSI Venture'],
    ],
    showVoucher: true,
  },
  acer: {
    brand: 'acer',
    title: 'Laptop Acer',
    banners: [
      buildLaptopBrandBanner('acer', 'kiiik.png', 'Acer Nitro', 'Acer Nitro'),
      buildLaptopBrandBanner('acer', 'nfffn.png', 'Acer Gaming Aspire', 'Acer Aspire Gaming'),
    ],
    series: [
      ['NITRO V', 'Acer Nitro V'],
      ['NITRO PROPANEL', 'Acer Nitro ProPanel'],
      ['ASPIRE', 'Acer Aspire'],
      ['ASPIRE 7', 'Acer Aspire 7'],
      ['ACER SWIFT', 'Acer Swift'],
      ['ACER PREDATOR', 'Acer Predator'],
    ],
    showVoucher: true,
  },
  hp: {
    brand: 'hp',
    title: 'Laptop HP',
    banners: [
      buildLaptopBrandBanner('hp', 'dgbb.png', 'Laptop HP 14 và 15', 'Laptop HP'),
      buildLaptopBrandBanner('hp', 'ththth.png', 'Laptop HP Victus', 'HP Victus'),
    ],
    series: [
      ['OMNIBOOK', 'HP Omnibook'],
      ['HP CƠ BẢN', 'Laptop HP'],
      ['VICTUS', 'HP Victus'],
      ['PROBOOK', 'HP ProBook'],
      ['ELITEBOOK', 'HP EliteBook'],
      ['SPECTRE', 'HP Spectre'],
      ['DRAGONFLY', 'HP Dragonfly'],
      ['ENVY', 'HP Envy'],
      ['PAVILION', 'HP Pavilion'],
    ],
    showVoucher: true,
  },
  dell: {
    brand: 'dell',
    title: 'Laptop Dell',
    banners: [
      buildLaptopBrandBanner('dell', 'dvshhh.png', 'Laptop Dell', 'Laptop Dell'),
      buildLaptopBrandBanner('dell', 'ghth.png', 'Laptop Dell AI', 'Dell AI'),
    ],
    series: [
      ['INSPIRON', 'Dell Inspiron'],
      ['VOSTRO', 'Dell Vostro'],
      ['XPS', 'Dell XPS'],
      ['LATITUDE', 'Dell Latitude'],
      ['DELL 14', 'Dell 14'],
      ['DELL 15', 'Dell 15'],
      ['DELL 16', 'Dell 16'],
      ['DELL PRO / PRO PLUS', 'Dell Pro'],
    ],
    showVoucher: true,
  },
  gigabyte: {
    brand: 'gigabyte',
    title: 'Laptop Gigabyte',
    banners: [
      buildLaptopBrandBanner('gigabyte', 'sgsrfg%C4%91g%C4%91g.png', 'Laptop Gigabyte Gaming', 'Gigabyte Gaming'),
      buildLaptopBrandBanner('gigabyte', 'tgttg.png', 'Laptop Gigabyte', 'Laptop Gigabyte'),
    ],
    series: [
      ['AERO', 'Gigabyte Aero'],
      ['AORUS', 'Gigabyte Aorus'],
      ['GAMING', 'Gigabyte Gaming'],
      ['A16', 'Gigabyte A16'],
      ['G5', 'Gigabyte G5'],
      ['G6', 'Gigabyte G6'],
    ],
    showVoucher: true,
  },
  lg: {
    brand: 'lg',
    title: 'Laptop LG Gram',
    banners: [],
    series: [
      ['LG GRAM 2021', 'LG Gram 2021'],
      ['LG GRAM 2023', 'LG Gram 2023'],
      ['LG GRAM 2024', 'LG Gram 2024'],
    ],
    showVoucher: true,
  },
  microsoft: {
    brand: 'microsoft',
    title: 'Microsoft Surface',
    banners: [],
    series: [
      ['SURFACE PRO', 'Surface Pro'],
      ['SURFACE LAPTOP', 'Surface Laptop'],
      ['SURFACE GO', 'Surface Go'],
      ['COPILOT+ PC', 'Surface Copilot'],
    ],
    showVoucher: true,
  },
  samsung: {
    brand: 'samsung',
    title: 'Laptop Samsung',
    banners: [],
    series: [
      ['GALAXY BOOK', 'Samsung Galaxy Book'],
      ['GALAXY BOOK PRO', 'Samsung Galaxy Book Pro'],
      ['GALAXY BOOK ULTRA', 'Samsung Galaxy Book Ultra'],
    ],
    showVoucher: true,
  },
  masstel: {
    brand: 'masstel',
    title: 'Laptop Masstel',
    banners: [],
    series: [
      ['E SERIES', 'Masstel E'],
      ['L SERIES', 'Masstel L'],
      ['NOTEBOOK', 'Masstel Notebook'],
    ],
    showVoucher: true,
  },
};

export const laptopBrandKeys = {
  macbook: 'apple',
  apple: 'apple',
  asus: 'asus',
  lenovo: 'lenovo',
  dell: 'dell',
  hp: 'hp',
  acer: 'acer',
  lg: 'lg',
  msi: 'msi',
  gigabyte: 'gigabyte',
  'microsoft surface': 'microsoft',
  microsoft: 'microsoft',
  surface: 'microsoft',
  masstel: 'masstel',
  samsung: 'samsung',
};

const normalizeLaptopText = (value = '') => (
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
);

export const getLaptopBrandFromText = (value = '') => {
  const key = normalizeLaptopText(value).replace(/[^a-z0-9]+/g, ' ').trim();
  const direct = laptopBrandKeys[key];
  if (direct) return direct;

  const words = key.split(/\s+/).filter(Boolean);
  const wordMatch = words.find((word) => laptopBrandKeys[word]);
  if (wordMatch) return laptopBrandKeys[wordMatch];
  if (key.includes('macbook') || key.includes('apple')) return 'apple';
  if (key.includes('surface') || key.includes('microsoft')) return 'microsoft';
  return '';
};

export const laptopBrandOrder = [
  'MacBook',
  'ASUS',
  'Lenovo',
  'msi',
  'acer',
  'HP',
  'DELL',
  'GIGABYTE',
  'LG',
  'Microsoft Surface',
  'SAMSUNG',
  'Masstel',
];

export const laptopHubItems = [
  { key: 'laptop', label: 'Laptop', icon: '💻', href: '/laptop.html' },
  { key: 'pc', label: 'PC', icon: '🖥️', href: '/may-tinh-de-ban.html' },
  {
    key: 'monitor',
    label: 'Màn hình',
    icon: '▤',
    href: '/man-hinh.html',
  },
  {
    key: 'build-pc',
    label: 'Build PC',
    icon: '🧰',
    href: '/may-tinh-de-ban/build-pc.html',
  },
  {
    key: 'components',
    label: 'Linh kiện máy tính',
    icon: '⚙️',
    href: '/linh-kien.html',
  },
  {
    key: 'printer',
    label: 'Máy in',
    icon: '🖨️',
    href: '/may-in.html',
  },
];

export const laptopNeedItems = [
  {
    label: 'Văn phòng',
    href: '/laptop/van-phong.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Group_846.png',
  },
  {
    label: 'Gaming',
    href: '/laptop/gaming.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/Group_848_2.png',
  },
  {
    label: 'Mỏng nhẹ',
    href: '/laptop/mong-nhe.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_6__1.png',
  },
  {
    label: 'Đồ họa - kỹ thuật',
    href: '/laptop/do-hoa.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_1__4.png',
  },
  {
    label: 'Sinh viên',
    href: '/laptop/sinh-vien.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_2__4.png',
  },
  {
    label: 'Cảm ứng',
    href: '/laptop/cam-ung.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_4__4.png',
  },
  {
    label: 'Laptop AI',
    href: '/laptop/ai.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/image_5__3.png',
  },
];

export const laptopNeedLandingProfiles = {
  '/laptop/van-phong.html': {
    title: 'Laptop văn phòng',
    usage: 'Học tập - văn phòng',
    bannerIndexes: [4, 6, 7, 2],
    brands: ['MacBook', 'ASUS', 'msi', 'Lenovo', 'HP', 'acer', 'LG', 'DELL'],
    preserveScopeOnClear: true,
  },
  '/laptop/gaming.html': {
    title: 'Laptop Gaming',
    usage: 'Chơi game',
    bannerIndexes: [7, 3, 5, 8],
    brands: ['ASUS', 'msi', 'Lenovo', 'HP', 'acer', 'DELL', 'GIGABYTE'],
    preserveScopeOnClear: true,
  },
  '/laptop/mong-nhe.html': {
    title: 'Laptop mỏng nhẹ',
    usage: 'Mỏng nhẹ',
    brands: ['MacBook', 'ASUS', 'Lenovo', 'HP', 'acer', 'LG', 'DELL'],
    preserveScopeOnClear: true,
  },
  '/laptop/do-hoa.html': {
    title: 'Laptop đồ họa',
    usage: 'Đồ họa - thiết kế',
    bannerIndexes: [7, 5, 8, 4],
    brands: ['ASUS', 'msi', 'Lenovo', 'DELL', 'HP', 'acer', 'GIGABYTE'],
    preserveScopeOnClear: true,
  },
  '/laptop/sinh-vien.html': {
    title: 'Laptop cho sinh viên',
    usage: 'Học tập - văn phòng',
    bannerIndexes: [6, 7, 2, 4],
    brands: ['MacBook', 'ASUS', 'msi', 'Lenovo', 'HP', 'acer', 'LG', 'DELL'],
    preserveScopeOnClear: true,
  },
  '/laptop/cam-ung.html': {
    title: 'Laptop cảm ứng',
    special: 'Cảm ứng',
    brands: ['HP', 'Lenovo', 'DELL', 'ASUS', 'Microsoft Surface'],
    preserveScopeOnClear: true,
  },
  '/laptop/ai.html': {
    title: 'Laptop AI',
    special: 'AI tích hợp',
    aiLanding: true,
    preserveScopeOnClear: true,
  },
};

export const laptopAiAssets = {
  heroDesktop: 'https://cdn2.cellphones.com.vn/x/media/catalog/product/l/a/laptop-ai-heading-desktop.png',
  heroMobile: 'https://cdn2.cellphones.com.vn/x/media/catalog/product/l/a/laptop-ai-heading-mobile.png',
  exclusiveOffer: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/_u_i_Desk_1.png',
  exclusiveOfferMobile: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/_u_i_banner_MB_1.png',
  copilotHeading: 'https://cdn2.cellphones.com.vn/x/media/catalog/product/l/a/laptop-ai-tagline-new-desk.png',
  copilotHeadingMobile: 'https://cdn2.cellphones.com.vn/x/media/catalog/product/t/i/tittle-laptop-ai-copilot-plus-pc.png',
  featureHeading: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/title-copilot-plus-pc.png',
  liveCaptions: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/live-captions-copilot-plus-pc.png',
  recall: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Recall-copilot-plus-pc.png',
  studioEffects: 'https://cdn2.cellphones.com.vn/x/media/catalog/product/c/o/copilot-plus-tinh-nang_2_.png',
  creator: 'https://cdn2.cellphones.com.vn/x/media/catalog/product/c/o/copilot-plus-tinh-nang_1_.png',
  autoSr: 'https://cdn2.cellphones.com.vn/x/media/catalog/product/c/o/copilot-plus-tinh-nang_3_.png',
  macIntelligence: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/1184x95.png',
  macIntelligenceMobile: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/674x127.png',
  otherAiHeading: 'https://cdn2.cellphones.com.vn/x/media/catalog/product/u/p/update-lp-laptop-ai-desktop_3_.png',
  otherAiHeadingMobile: 'https://cdn2.cellphones.com.vn/x/media/catalog/product/u/p/update-lp-laptop-ai-mobile_3_.png',
  tradeIn: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Thu_c__Desk.png',
  tradeInMobile: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Thu_c__MB.png',
  experience: 'https://cdn2.cellphones.com.vn/x/media/catalog/product/t/r/trai-nghiem-ai-up-desk.png',
  experiencePhoto: 'https://cdn2.cellphones.com.vn/x/media/catalog/product/k/h/khai-truong-asus-ai-center-cellphones-1.jpg',
  copilotPromos: [
    {
      name: 'ASUS VivoBook Copilot+ PC',
      desktop: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/Asus_Vivobook_desk.png',
      mobile: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/Asus_Vivobook_MB.png',
      href: '/laptop-asus-vivobook-16-a1607qa-mb067ws-snapdragon.html',
    },
    {
      name: 'Lenovo IdeaPad Slim Copilot+ PC',
      desktop: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/Lenovo_ideapad_slim_desk.png',
      mobile: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/Lenovo_ideapad_slim_MB.png',
      href: buildCategoryPath('Laptop', {
        brand: 'lenovo',
        q: 'Lenovo IdeaPad Slim',
        special: 'AI tích hợp',
        keyword: 'Lenovo IdeaPad Slim Copilot+ PC',
        title: 'Lenovo IdeaPad Slim Copilot+ PC',
      }),
    },
    {
      name: 'MSI Prestige Copilot+ PC',
      desktop: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/MSI_Prestige_desk.png',
      mobile: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/MSI_Prestige_MB.png',
      href: buildCategoryPath('Laptop', {
        brand: 'msi',
        q: 'MSI Prestige',
        special: 'AI tích hợp',
        keyword: 'MSI Prestige Copilot+ PC',
        title: 'MSI Prestige Copilot+ PC',
      }),
    },
    {
      name: 'Lenovo Yoga Copilot+ PC',
      desktop: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/lenovo_yoga_desk.png',
      mobile: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/lenovo_yoga_MB.png',
      href: buildCategoryPath('Laptop', {
        brand: 'lenovo',
        q: 'Lenovo Yoga',
        special: 'AI tích hợp',
        keyword: 'Lenovo Yoga Copilot+ PC',
        title: 'Lenovo Yoga Copilot+ PC',
      }),
    },
    {
      name: 'ASUS Zenbook AI',
      desktop: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/Asus_Zenbook_desk.png',
      mobile: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/Asus_Zenbook_MB.png',
      href: buildCategoryPath('Laptop', {
        brand: 'asus',
        q: 'ASUS Zenbook',
        special: 'AI tích hợp',
        keyword: 'ASUS Zenbook AI',
        title: 'ASUS Zenbook AI',
      }),
    },
    {
      name: 'Acer Predator AI',
      desktop: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/Acer_Predator_desk.png',
      mobile: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Banner/Acer_Predator_MB.png',
      href: buildCategoryPath('Laptop', {
        brand: 'acer',
        q: 'Acer Predator',
        keyword: 'Acer Predator AI',
        title: 'Acer Predator AI',
      }),
    },
  ],
  experiencePhotos: [
    'https://cdn2.cellphones.com.vn/x/media/catalog/product/k/h/khai-truong-asus-ai-center-cellphones-1.jpg',
    'https://cdn2.cellphones.com.vn/x/media/catalog/product/k/h/khai-truong-asus-ai-center-cellphones-43.jpg',
    'https://cdn2.cellphones.com.vn/x/media/catalog/product/k/h/khai-truong-asus-ai-center-cellphones-86.jpg',
    'https://cdn2.cellphones.com.vn/x/media/catalog/product/k/h/khai-truong-asus-ai-center-cellphones-12.jpg',
    'https://cdn2.cellphones.com.vn/x/media/catalog/product/k/h/khai-truong-asus-ai-center-cellphones-83.jpg',
    'https://cdn2.cellphones.com.vn/x/media/catalog/product/k/h/khai-truong-asus-ai-center-cellphones-13.jpg',
    'https://cdn2.cellphones.com.vn/x/media/catalog/product/k/h/khai-truong-asus-ai-center-cellphones-103.jpg',
    'https://cdn2.cellphones.com.vn/x/media/catalog/product/k/h/khai-truong-asus-ai-center-cellphones-20.jpg',
    'https://cdn2.cellphones.com.vn/x/media/catalog/product/k/h/khai-truong-asus-ai-center-cellphones-85.jpg',
    'https://cdn2.cellphones.com.vn/x/media/catalog/product/k/h/khai-truong-asus-ai-center-cellphones-38.jpg',
    'https://cdn2.cellphones.com.vn/x/media/catalog/product/k/h/khai-truong-asus-ai-center-cellphones-59.jpg',
    'https://cdn2.cellphones.com.vn/x/media/catalog/product/k/h/khai-truong-asus-ai-center-cellphones-116.jpg',
  ],
};
