import {
  APPLIANCE_LOGOS,
  LAPTOP_BRANDS,
  SPEAKER_BRANDS,
  TABLET_BRANDS,
  WATCH_BRANDS,
} from '../components/HeroSection/brandData';

const banner = (image, alt, href) => ({ image, alt, href });
const card = (label, href, image = '', queryPreset = {}, icon = '') => ({
  label,
  href,
  image,
  queryPreset,
  icon,
});

const media = (path) => (
  `https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/${path}`
);

const logo = (path, quality = 30) => (
  `https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:${quality}/plain/https://cellphones.com.vn/media/${path}`
);

const CATALOG_FILTER_IDS = {
  tablet: [
    'all', 'in-stock', 'new', 'price', 'usage', 'screen-size', 'ram', 'storage',
    'refresh-rate', 'chip', 'special', 'camera',
  ],
  laptop: [
    'all', 'in-stock', 'new', 'price', 'usage', 'screen-size', 'ram', 'storage',
    'display', 'refresh-rate', 'special', 'chip',
  ],
  audio: ['all', 'in-stock', 'new', 'price', 'usage', 'special'],
  watch: ['all', 'in-stock', 'new', 'price', 'usage', 'screen-size', 'special'],
  appliance: ['all', 'in-stock', 'new', 'price', 'usage', 'special'],
  accessory: ['all', 'in-stock', 'new', 'price', 'special'],
  pc: ['all', 'in-stock', 'new', 'price', 'ram', 'storage', 'chip', 'usage', 'special'],
  monitor: ['all', 'in-stock', 'new', 'price', 'screen-size', 'display', 'refresh-rate', 'special'],
  printer: ['all', 'in-stock', 'new', 'price', 'special'],
  tv: ['all', 'in-stock', 'new', 'price', 'screen-size', 'display', 'refresh-rate', 'special'],
  coldAppliance: ['all', 'in-stock', 'new', 'price', 'product-line'],
};

const COMPUTER_NAVIGATION = [
  { label: 'Laptop', href: '/laptop.html' },
  { label: 'PC', href: '/may-tinh-de-ban.html' },
  { label: 'Màn hình', href: '/man-hinh.html' },
  { label: 'Build PC', href: '/may-tinh-de-ban/build-pc.html' },
  { label: 'Linh kiện máy tính', href: '/linh-kien.html' },
  { label: 'Máy in', href: '/may-in.html' },
];

const brandSlugOverrides = {
  macbook: 'mac',
  dell: 'dell',
  'microsoft surface': 'surface',
  samsung: 'samsung',
  masstel: 'masstel',
};

const normalizeSlug = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const brandLinks = (items, basePath, category, overrides = {}) => items.map((item) => {
  const normalizedName = String(item.name || '').toLowerCase();
  const slug = overrides[normalizedName] || brandSlugOverrides[normalizedName] || normalizeSlug(item.name);
  const brand = overrides[`${normalizedName}:brand`] || (
    /ipad|macbook|apple/i.test(item.name) ? 'apple' : normalizeSlug(item.name)
  );
  return card(
    item.name,
    `${basePath}/${slug}.html`,
    item.logo || '',
    { category, brand },
  );
});

const rootProfile = ({
  id,
  path,
  department,
  category,
  apiCategory = category,
  title,
  seoTitle,
  banners,
  brandLinks: landingBrandLinks = [],
  featureSection = null,
  topNavigation = [],
  promoPanel = null,
  featuredTitle = '',
  filterIds,
  queryPreset = {},
  parentPath = path,
  parentTitle = title,
}) => ({
  id,
  path,
  department,
  category,
  apiCategory,
  title,
  seoTitle,
  banners,
  brandLinks: landingBrandLinks,
  featureSection,
  topNavigation,
  promoPanel,
  featuredTitle,
  filterIds,
  queryPreset,
  parentPath,
  parentTitle,
  breadcrumbTitle: title,
  template: 'catalog-landing',
  isRoot: true,
});

const tabletBrands = brandLinks(
  TABLET_BRANDS.map((item) => (
    item.name === 'Teclast'
      ? { ...item, logo: logo('wysiwyg/Web/Brand/Teclast-240x50.png') }
      : item
  )),
  '/tablet',
  'Máy tính bảng',
  { 'ipad:brand': 'apple' },
);

const laptopBrandLinks = brandLinks(
  LAPTOP_BRANDS,
  '/laptop',
  'Laptop',
  {
    'macbook:brand': 'macbook',
    'microsoft surface:brand': 'microsoft',
  },
);

const microphoneBrands = [
  card('DJI', '/thiet-bi-am-thanh/micro-thu-am/dji.html', logo('catalog/product/t/_/t_i_xu_ng_57__9.png'), { brand: 'dji' }),
  card('BOYA', '/thiet-bi-am-thanh/micro-thu-am/boya.html', logo('catalog/product/b/r/brand-icon-boya.png'), { brand: 'boya' }),
  card('SHURE', '/thiet-bi-am-thanh/micro-thu-am/shure.html', logo('wysiwyg/Shure-new.png'), { brand: 'shure' }),
  card('Saramonic', '/thiet-bi-am-thanh/micro-thu-am/saramonic.html', logo('catalog/product/b/r/brand-icon-saramonic.png'), { brand: 'saramonic' }),
  card('RØDE', '/thiet-bi-am-thanh/micro-thu-am/rode.html', logo('catalog/product/b/r/brand-icon-rode.png'), { brand: 'rode' }),
  card('maono', '/thiet-bi-am-thanh/micro-thu-am/maono.html', logo('wysiwyg/maono-2.png'), { brand: 'maono' }),
  card('AKG', '/thiet-bi-am-thanh/micro-thu-am.html?brand=akg', logo('wysiwyg/AKG.png'), { brand: 'akg' }),
  card('JBL', '/thiet-bi-am-thanh/micro-thu-am.html?brand=jbl', logo('wysiwyg/JBL.png'), { brand: 'jbl' }),
  card('audio-technica', '/thiet-bi-am-thanh/micro-thu-am.html?brand=audio-technica', logo('wysiwyg/audio-technica.png'), { brand: 'audio-technica' }),
  card('GoChek', '/thiet-bi-am-thanh/micro-thu-am/gochek.html', logo('wysiwyg/logo-gocheck-new.png'), { brand: 'gochek' }),
  card('HOLLYLAND', '/thiet-bi-am-thanh/micro-thu-am/hollyland.html', '', { brand: 'hollyland' }),
];

const karaokeMicrophoneBrands = [
  card('Acnos', '/thiet-bi-am-thanh/micro.html?brand=acnos', logo('catalog/product/l/o/logo-brand-acnos.png'), { brand: 'acnos' }),
  card('Alpha Works', '/thiet-bi-am-thanh/micro.html?brand=alpha-works', logo('catalog/product/b/r/brand-icon-alpha-works.png'), { brand: 'alpha-works' }),
  card('Sony', '/thiet-bi-am-thanh/micro.html?brand=sony', logo('catalog/product/b/r/brand-icon-sony_2.png'), { brand: 'sony' }),
  card('Shure', '/thiet-bi-am-thanh/micro.html?brand=shure', logo('wysiwyg/Shure-new.png'), { brand: 'shure' }),
  card('Paramax', '/thiet-bi-am-thanh/micro.html?brand=paramax', logo('wysiwyg/Logo/paramax.png'), { brand: 'paramax' }),
  card('JBL', '/thiet-bi-am-thanh/micro.html?brand=jbl', logo('wysiwyg/Web/Brand/JBL-240x50.png'), { brand: 'jbl' }),
];

const headphoneBrands = [
  ['AirPods', 'apple', 'Airpods-240x50.png'],
  ['SONY', 'sony', 'SONY-240x50.png'],
  ['JBL', 'jbl', 'JBL-240x50.png'],
  ['ANKER', 'anker', 'Anker-240x50.png'],
  ['SAMSUNG', 'samsung', 'Samsung-240x50.png'],
  ['HUAWEI', 'huawei', 'HUAWEI-240x50.png'],
  ['BOSE', 'bose', 'Bose-240x50.png'],
  ['Xiaomi', 'xiaomi', 'XIAOMI-new-240x50.png'],
  ['Marshall', 'marshall', 'marshall-240x50.png'],
  ['baseus', 'baseus', 'Baseus-240x50.png'],
  ['HAVIT', 'havit', 'HAVIT-240x50.png'],
  ['SOUNDPEATS', 'soundpeats', 'soundpeats-240x50.png'],
  ['SHOKZ', 'shokz', 'shokz-240x50.png'],
  ['EDIFIER', 'edifier', 'edifer-240x50.png'],
  ['HYPERX', 'hyperx', 'hyperx.png'],
  ['SENNHEISER', 'sennheiser', 'sennheiser-240x50.png'],
  ['ASUS', 'asus', 'ASUS-240x50.png'],
  ['OPPO', 'oppo', 'Oppo-240x50.png'],
  ['logitech', 'logitech', 'Property_1_logitech-240x50.png'],
  ['Bowers & Wilkins', 'bowers-wilkins', 'browser_wilkins-240x50.png'],
  ['KZ', 'kz', 'kz-240x50.png'],
  ['earfun', 'earfun', 'earfun-240x50.png'],
  ['QCY', 'qcy', 'QCY-240x50.png'],
  ['STARGO', 'stargo', 'STARGO-240x50.png'],
  ['PHILIPS', 'philips', 'PHILLIPS-240x50.png'],
  ['ALPHA WORKS', 'alpha-works', 'alphaworks-240x50.png'],
  ['ROBOT', 'robot', 'robotsmartpower-240x50.png'],
  ['GOOJODOQ', 'goojodoq', 'GOOJADOO-240x50.png'],
  ['Nakamichi', 'nakamichi', 'nakamichi-240x50.png'],
  ['AUKEY', 'aukey', 'aukey-240x50.png'],
].map(([label, brand, image]) => (
  {
    ...card(
      label,
      `/thiet-bi-am-thanh/tai-nghe/${brand}.html`,
      logo(`wysiwyg/Web/Brand/${image}`, 1),
      { category: 'Tai nghe', brand },
    ),
    landingTitle: `Tai nghe ${label}`,
  }
));

const monitorBrandLinks = [
  ['ASUS', 'asus', 'catalog/product/b/r/brand-icon-asus.png'],
  ['LG', 'lg', 'catalog/product/b/r/brand-icon-lg_2.png'],
  ['SAMSUNG', 'samsung', 'catalog/product/b/r/brand-icon-samsung_2.png'],
  ['MSI', 'msi', 'catalog/product/i/c/icon-brand-msi.png'],
  ['Xiaomi', 'xiaomi', 'catalog/product/b/r/brand-icon-xiaomi.png'],
  ['Dell', 'dell', 'catalog/product/i/c/icon-brand-dell.png'],
  ['AOC', 'aoc', 'catalog/product/i/c/icon-brand-aoc.png'],
  ['Gigabyte', 'gigabyte', 'catalog/product/i/c/icon-brand-gigabyte.png'],
  ['Acer', 'acer', 'catalog/product/i/c/icon-brand-acer.png'],
  ['Philips', 'philips', 'catalog/product/i/c/icon-brand-philips.png'],
  ['ViewSonic', 'viewsonic', 'catalog/product/i/c/icon-brand-viewsonic.png'],
  ['Lenovo', 'lenovo', 'catalog/product/i/c/icon-brand-lenovo.png'],
  ['E-DRA', 'edra', 'catalog/product/l/o/logo-brand-edra.png'],
  ['Dahua', 'dahua', 'wysiwyg/Icon/Frame_293.png'],
  ['VSP', 'vsp', 'wysiwyg/Icon/logo-brand-HPRT_2.png'],
].map(([label, brand, image]) => (
  card(label, `/man-hinh/${brand}.html`, logo(image), { category: 'Màn hình', brand })
));

const printerBrandLinks = [
  card('HP', '/may-in/hp.html', logo('wysiwyg/Logo/logo-brand-HPRT_3.png'), { brand: 'hp' }),
  card('Brother', '/may-in/may-in-brother.html', logo('catalog/product/b/r/brand-icon-brother.png'), { brand: 'brother' }),
  card('HPRT', '/may-in/hprt.html', logo('wysiwyg/Icon/image_1026_1__1.png'), { brand: 'hprt' }),
  card('Canon', '/may-in/canon.html', logo('catalog/product/b/r/brand-icon-canon.png'), { brand: 'canon' }),
  card('MỰC IN', '/may-in/muc-in.html', logo('wysiwyg/Icon/logo-brand-HPRT_1_.png'), { q: 'Mực in' }),
];

const televisionBrands = APPLIANCE_LOGOS
  .filter((item) => ['SAMSUNG', 'LG', 'Xiaomi', 'Sony', 'coocaa', 'TCL', 'AQUA'].includes(item.name))
  .map((item) => {
    const brand = normalizeSlug(item.name);
    return card(item.name, `/tivi/${brand}.html`, item.logo, { category: 'Tivi', brand });
  })
  .concat([
    card('VSP', '/tivi/vsp.html', logo('wysiwyg/logo-vsp.png'), { category: 'Tivi', brand: 'vsp' }),
  ]);

const applianceBrandLogoOverrides = {
  Electrolux: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:30/plain/https://cellphones.com.vn/media/wysiwyg/brand-electrolux.png',
};

const applianceBrandLinks = (names, basePath, category) => names.map((name) => {
  const source = APPLIANCE_LOGOS.find((item) => (
    normalizeSlug(item.name) === normalizeSlug(name)
  ));
  const brand = normalizeSlug(name);

  return {
    ...card(
      name,
      `${basePath}/${brand}.html`,
      source?.logo || applianceBrandLogoOverrides[name] || '',
      { category, brand },
    ),
    landingTitle: `${category} ${name}`,
  };
});

const tabletProfile = rootProfile({
  id: 'catalog-tablet',
  path: '/tablet.html',
  department: 'tablet',
  category: 'Máy tính bảng',
  title: 'Máy tính bảng giá rẻ',
  seoTitle: 'Máy tính bảng | Tablet 2026 giá rẻ, chính hãng, trả góp 0%',
  banners: [
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/595x100_Pad Pro M4_Tặng Apple Pencil.png',
      'iPad Pro M4 tặng Apple Pencil',
      '/tablet/ipad.html',
    ),
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/LenovoTabGen2v_cate1.png',
      'Lenovo Idea Tab Pro Gen 2',
      '/tablet/lenovo.html',
    ),
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/Cate_MTBSamsung.png',
      'Máy tính bảng Samsung Galaxy Tab',
      '/tablet/samsung.html',
    ),
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/xiaomi-redmi-pad-2-9-cate.png',
      'Xiaomi Redmi Pad',
      '/tablet/xiaomi.html',
    ),
  ],
  brandLinks: tabletBrands,
  featureSection: {
    title: 'Chọn theo nhu cầu',
    items: [
      card('Cho trẻ em', '/tablet.html?usage=Cho%20trẻ%20em&title=Máy%20tính%20bảng%20cho%20trẻ%20em', media('may-tinh-bang-cho-tre-em-icon-cate.png'), { usage: 'Cho trẻ em' }),
      card('Chơi game', '/tablet.html?usage=Chơi%20game&title=Máy%20tính%20bảng%20chơi%20game', media('may-tinh-bang-choi-game-icon-cate.png'), { usage: 'Chơi game' }),
      card('Đồ họa - Sáng tạo', '/tablet.html?usage=Đồ%20họa%20-%20Sáng%20tạo', media('may-tinh-bang-ve-do-hoa-sang-tao-icon-cate.png'), { usage: 'Đồ họa - Sáng tạo' }),
      card('Học tập - văn phòng', '/tablet.html?usage=Học%20tập%20-%20Văn%20phòng', media('may-tinh-bang-lam-viec-hoc-tap-icon-cate.png'), { usage: 'Học tập - Văn phòng' }),
      card('Máy tính bảng AI', '/tablet/ai.html', media('may-tinh-bang-ai-icon-cate.png'), { special: 'AI tích hợp' }),
      card('Máy đọc sách', '/tablet/may-doc-sach.html', media('may-doc-sach-icon-cate.png'), { q: 'Máy đọc sách' }),
    ],
  },
  filterIds: CATALOG_FILTER_IDS.tablet,
});

const laptopProfile = rootProfile({
  id: 'catalog-laptop',
  path: '/laptop.html',
  department: 'laptop',
  category: 'Laptop',
  title: 'Máy tính laptop',
  seoTitle: 'Laptop | Máy tính xách tay giá rẻ, trả góp 0%, giảm 15 triệu',
  topNavigation: COMPUTER_NAVIGATION,
  banners: [
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/sxfbsbsbfc.png',
      'Laptop Back to School',
      '/laptop.html',
    ),
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/ỵyyjyyjyyj.png',
      'MacBook Neo',
      '/laptop/mac.html',
    ),
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/dbnhd.jpg',
      'Acer Back to School',
      '/laptop/acer.html',
    ),
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/tgttg.png',
      'Laptop Gigabyte',
      '/laptop/gigabyte.html',
    ),
  ],
  brandLinks: laptopBrandLinks,
  featureSection: {
    title: 'Chọn theo nhu cầu',
    items: [
      card('Văn phòng', '/laptop/van-phong.html', media('Group_846.png'), { usage: 'Học tập - Văn phòng' }),
      card('Gaming', '/laptop/gaming.html', media('Group_848_2.png'), { usage: 'Gaming' }),
      card('Mỏng nhẹ', '/laptop/mong-nhe.html', media('image_6__1.png'), { usage: 'Mỏng nhẹ' }),
      card('Đồ họa - kỹ thuật', '/laptop/do-hoa.html', media('image_1__4.png'), { usage: 'Đồ họa - Kỹ thuật' }),
      card('Sinh viên', '/laptop/sinh-vien.html', media('image_2__4.png'), { q: 'Laptop sinh viên' }),
      card('Cảm ứng', '/laptop/cam-ung.html', media('image_4__4.png'), { q: 'Laptop Flip|Surface Pro|Laptop cảm ứng|Touchscreen' }),
      card('Laptop AI', '/laptop/ai.html', media('image_5__3.png'), { special: 'AI tích hợp' }),
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.laptop,
});

const audioProfile = rootProfile({
  id: 'catalog-audio',
  path: '/thiet-bi-am-thanh.html',
  department: 'audio',
  category: 'Âm thanh',
  title: 'Thiết bị âm thanh',
  seoTitle: 'Thiết bị âm thanh chính hãng | Giá rẻ 07/2026, trả góp 0%',
  banners: [
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/sony-vi-vu-bien-he.jpg', 'Sony - Săn deal nghe cực cháy', '/thiet-bi-am-thanh.html?q=Sony'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/buynow-ssbuds4pro.jpg', 'Samsung Galaxy Buds', '/thiet-bi-am-thanh.html?q=Galaxy%20Buds'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/loa-stargo.jpg', 'Loa Stargo', '/thiet-bi-am-thanh.html?q=Loa%20Stargo'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/tai-nghe-marshall-2026.jpg', 'Tai nghe Marshall', '/thiet-bi-am-thanh.html?q=Marshall'),
  ],
  featureSection: {
    title: 'Chọn loại sản phẩm',
    items: [
      card('Tai nghe', '/thiet-bi-am-thanh/tai-nghe.html', 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/chup-taii.png', { q: 'Tai nghe' }),
      card('Tai nghe không dây', '/thiet-bi-am-thanh/tai-nghe/tai-nghe-bluetooth.html', media('tainghebluetooth.png'), { q: 'Tai nghe Bluetooth' }),
      card('Loa', '/thiet-bi-am-thanh/loa.html', 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/loa-cate.png', { q: 'Loa' }),
      card('Mic thu âm', '/thiet-bi-am-thanh/micro-thu-am.html', 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/micthu.png', { q: 'Micro thu âm' }),
      card('Mic Karaoke', '/thiet-bi-am-thanh/micro.html', 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/karaoke.png', { q: 'Mic Karaoke' }),
      card('Đầu đĩa than', '/thiet-bi-am-thanh/dia-than.html', 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/image-removebg-preview_43_.png', { q: 'Đầu đĩa than' }),
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.audio,
});

const headphoneProfile = rootProfile({
  id: 'catalog-headphone',
  path: '/thiet-bi-am-thanh/tai-nghe.html',
  department: 'headphone',
  category: 'Tai nghe',
  title: 'Tai nghe',
  seoTitle: 'Tai nghe chính hãng từ 50K - Mẫu mới 07/2026, giá giảm sâu',
  parentPath: '/thiet-bi-am-thanh.html',
  parentTitle: 'Thiết bị âm thanh',
  banners: [
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/tao-nghe-edifer-2026.jpg', 'Tai nghe Edifier', '/thiet-bi-am-thanh/tai-nghe/edifier.html'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/595x100-lc900-new.jpg', 'Tai nghe thể thao Sony Clip WF-LC900', '/tai-nghe-khong-day-sony-clip-wf-lc900.html'),
  ],
  brandLinks: headphoneBrands,
  featureSection: {
    title: 'Chọn loại tai nghe',
    items: [
      { ...card('Bluetooth', '/thiet-bi-am-thanh/tai-nghe/tai-nghe-bluetooth.html', media('tainghebluetooth.png'), { q: 'Tai nghe Bluetooth' }), landingTitle: 'Tai nghe Bluetooth' },
      { ...card('Có dây', '/thiet-bi-am-thanh/tai-nghe/co-day.html', media('coday.png'), { q: 'Tai nghe có dây' }), landingTitle: 'Tai nghe có dây' },
      { ...card('Chụp tai', '/thiet-bi-am-thanh/tai-nghe/headphones.html', media('chup-taii.png'), { q: 'Tai nghe chụp tai' }), landingTitle: 'Tai nghe chụp tai' },
      { ...card('Nhét tai', '/thiet-bi-am-thanh/tai-nghe/tai-nghe-nhet-tai.html', media('nhet-tai_2.png'), { q: 'Tai nghe nhét tai' }), landingTitle: 'Tai nghe nhét tai' },
      { ...card('Gaming', '/thiet-bi-am-thanh/tai-nghe/gaming.html', media('gaming-removebg-preview.png'), { q: 'Tai nghe Gaming' }), landingTitle: 'Tai nghe Gaming' },
      { ...card('Thể thao', '/thiet-bi-am-thanh/tai-nghe/the-thao.html', media('thethao-removebg-preview.png'), { q: 'Tai nghe thể thao' }), landingTitle: 'Tai nghe thể thao' },
      { ...card('Kiểm âm', '/thiet-bi-am-thanh/tai-nghe/kiem-am.html', media('kiem-amm.png'), { q: 'Tai nghe kiểm âm' }), landingTitle: 'Tai nghe kiểm âm' },
      { ...card('Phiên dịch', '/thiet-bi-am-thanh/tai-nghe/phien-dich.html', media('Am-thanh/Tai-nghe/AI-phien-dich_1_.png'), { q: 'Tai nghe phiên dịch' }), landingTitle: 'Tai nghe phiên dịch' },
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.audio,
  queryPreset: { q: 'Tai nghe' },
});

const microphoneProfile = rootProfile({
  id: 'catalog-microphone',
  path: '/thiet-bi-am-thanh/micro-thu-am.html',
  department: 'microphone',
  category: 'Âm thanh',
  title: 'Microphone thu âm không dây',
  seoTitle: 'Micro thu âm | Studio Microphone chuyên nghiệp, lọc ồn AI',
  parentPath: '/thiet-bi-am-thanh.html',
  parentTitle: 'Thiết bị âm thanh',
  banners: [
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/mic-gochek.png', 'Micro GoChek', '/thiet-bi-am-thanh/micro-thu-am/gochek.html'),
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/mic-boya.png', 'Micro BOYA', '/thiet-bi-am-thanh/micro-thu-am/boya.html'),
  ],
  brandLinks: microphoneBrands,
  featureSection: {
    title: 'Nhu cầu sử dụng',
    items: [
      card('Cài áo', '/thiet-bi-am-thanh/micro-thu-am.html?q=Mic%20cài%20áo', media('kep.png'), { q: 'Mic cài áo' }),
      card('Podcast / Phòng thu', '/thiet-bi-am-thanh/micro-thu-am.html?q=Podcast', media('phongthu.png'), { q: 'Podcast micro phòng thu' }),
      card('Livestream', '/thiet-bi-am-thanh/micro-thu-am.html?q=Mic%20livestream', media('micthu.png'), { q: 'Mic livestream' }),
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.audio,
  queryPreset: { q: 'Micro thu âm' },
});

const karaokeMicrophoneProfile = rootProfile({
  id: 'catalog-karaoke-microphone',
  path: '/thiet-bi-am-thanh/micro.html',
  department: 'karaoke-microphone',
  category: 'Âm thanh',
  title: 'Micro không dây và micro Karaoke',
  seoTitle: 'Micro không dây, micro Karaoke chính hãng, giá tốt',
  parentPath: '/thiet-bi-am-thanh.html',
  parentTitle: 'Thiết bị âm thanh',
  brandLinks: karaokeMicrophoneBrands,
  featureSection: {
    title: 'Chọn loại micro',
    items: [
      card('Micro không dây', '/thiet-bi-am-thanh/micro.html?q=Micro%20không%20dây', media('image_2__4.png'), { q: 'Micro không dây' }),
      card('Micro Karaoke', '/thiet-bi-am-thanh/micro.html?q=Micro%20Karaoke', media('karaoke.png'), { q: 'Micro Karaoke' }),
      card('Micro thu âm', '/thiet-bi-am-thanh/micro-thu-am.html', media('micthu.png'), { q: 'Micro thu âm' }),
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.audio,
  queryPreset: { q: 'Micro không dây' },
});

const turntableProfile = rootProfile({
  id: 'catalog-turntable',
  path: '/thiet-bi-am-thanh/dia-than.html',
  department: 'turntable',
  category: 'Âm thanh',
  title: 'Đầu đĩa than',
  seoTitle: 'Đầu đĩa than chính hãng, âm thanh analog chất lượng',
  parentPath: '/thiet-bi-am-thanh.html',
  parentTitle: 'Thiết bị âm thanh',
  featureSection: {
    title: 'Khám phá âm thanh đĩa than',
    items: [
      card('Đầu đĩa than', '/thiet-bi-am-thanh/dia-than.html', media('image-removebg-preview_43_.png'), { q: 'Đầu đĩa than' }),
      card('Phụ kiện đĩa than', '/thiet-bi-am-thanh/dia-than.html?q=Phụ%20kiện%20đĩa%20than', '', { q: 'Phụ kiện đĩa than' }, '♪'),
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.audio,
  queryPreset: { q: 'Đầu đĩa than' },
});

const speakerProfile = rootProfile({
  id: 'catalog-speaker',
  path: '/thiet-bi-am-thanh/loa.html',
  department: 'speaker',
  category: 'Loa',
  title: 'Loa',
  seoTitle: 'Loa nghe nhạc hay, âm thanh mê say | Chính hãng, giá tốt',
  parentPath: '/thiet-bi-am-thanh.html',
  parentTitle: 'Thiết bị âm thanh',
  brandLinks: brandLinks(SPEAKER_BRANDS, '/thiet-bi-am-thanh/loa', 'Loa'),
  featureSection: {
    title: 'Chọn loại loa',
    items: [
      card('Loa Bluetooth', '/thiet-bi-am-thanh/loa/loa-bluetooth.html', '', { q: 'Loa Bluetooth' }, '🔊'),
      card('Loa Karaoke', '/thiet-bi-am-thanh/loa/loa-karaoke.html', '', { q: 'Loa Karaoke' }, '🎤'),
      card('Loa kéo', '/thiet-bi-am-thanh/loa/loa-keo.html', '', { q: 'Loa kéo' }, '🧳'),
      card('Loa Soundbar', '/thiet-bi-am-thanh/loa/loa-soundbar.html', '', { q: 'Loa Soundbar' }, '📺'),
      card('Loa vi tính', '/thiet-bi-am-thanh/loa/loa-vi-tinh.html', '', { q: 'Loa vi tính' }, '🖥️'),
      card('Loa Sub', '/thiet-bi-am-thanh/loa/loa-sub.html', '', { q: 'Loa Sub' }, '🎶'),
      card('Loa kiểm âm', '/thiet-bi-am-thanh/loa/loa-kiem-am.html', '', { q: 'Loa kiểm âm' }, '🎚️'),
      card('Loa trợ giảng', '/thiet-bi-am-thanh/loa/loa-tro-giang.html', '', { q: 'Loa trợ giảng' }, '📣'),
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.audio,
  queryPreset: { q: 'Loa' },
});

const watchProfile = rootProfile({
  id: 'catalog-watch',
  path: '/do-choi-cong-nghe.html',
  department: 'watch',
  category: 'Đồng hồ thông minh',
  title: 'Đồng hồ thông minh',
  seoTitle: 'Đồng hồ thông minh chính hãng, giá tốt, góp 0%',
  banners: [
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/sgddf.jpg', 'Huawei Watch Fit', '/do-choi-cong-nghe.html?brand=huawei'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/yhttedhtd.png', 'Đồng hồ thông minh ưu đãi sinh viên', '/do-choi-cong-nghe.html'),
  ],
  brandLinks: brandLinks(WATCH_BRANDS, '/do-choi-cong-nghe', 'Đồng hồ thông minh'),
  featureSection: {
    title: 'Chọn theo nhu cầu',
    items: [
      card('Tập luyện thể thao', '/do-choi-cong-nghe.html?q=Đồng%20hồ%20thể%20thao', '', { q: 'Đồng hồ thể thao|Garmin Forerunner' }, '🏃'),
      card('Nghe gọi', '/do-choi-cong-nghe.html?q=Đồng%20hồ%20nghe%20gọi', '', { q: 'Đồng hồ nghe gọi' }, '📞'),
      card('Vòng đeo tay thông minh', '/do-choi-cong-nghe.html?q=Vòng%20đeo%20tay', '', { q: 'Vòng đeo tay thông minh' }, '⌚'),
      card('Định vị trẻ em', '/do-choi-cong-nghe.html?q=Đồng%20hồ%20trẻ%20em', '', { q: 'Đồng hồ định vị trẻ em' }, '🧒'),
      card('Đo huyết áp', '/do-choi-cong-nghe.html?q=Đo%20huyết%20áp', '', { q: 'Đồng hồ đo huyết áp' }, '❤️'),
      card('Chống nước', '/do-choi-cong-nghe.html?special=Kháng%20nước%20IP68', '', { special: 'Kháng nước IP68' }, '💧'),
      card('Dây đồng hồ', '/do-choi-cong-nghe/day-deo-dong-ho.html', '', { q: 'Dây đồng hồ thông minh' }, '⌚'),
    ],
  },
  featuredTitle: 'SẢN PHẨM MỚI RA MẮT',
  filterIds: CATALOG_FILTER_IDS.watch,
});

const cameraProfile = rootProfile({
  id: 'catalog-camera',
  path: '/phu-kien/camera.html',
  department: 'camera',
  category: 'Phụ kiện',
  title: 'Camera',
  seoTitle: 'Camera an ninh, hành trình, action camera chính hãng',
  parentPath: '/phu-kien.html',
  parentTitle: 'Phụ kiện',
  banners: [
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/cate-imou-2.jpg', 'Camera IMOU', '/phu-kien/camera.html?q=IMOU'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/sliding%20cate.png', 'Dịch vụ lắp đặt Camera', '/phu-kien/camera.html'),
  ],
  featureSection: {
    title: 'Chọn Camera',
    items: [
      card('An ninh', '/phu-kien/camera/an-ninh.html', 'https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/camera-an-ninh.png', { q: 'Camera an ninh' }),
      card('Action camera', '/phu-kien/camera/action-camera.html', media('camera-action.png'), { q: 'Action camera' }),
      card('Flycam', '/flycam.html', '', { q: 'Flycam' }, '🛸'),
      card('Máy ảnh', '/may-anh.html', '', { category: 'Máy ảnh', categoryMode: 'primary', q: 'Máy ảnh' }, '📷'),
      card('Hành trình', '/phu-kien/camera/hanh-trinh.html', '', { q: 'Camera hành trình' }, '🚗'),
      card('Gimbal', '/phu-kien/camera/gimbal.html', '', { q: 'Gimbal' }, '🎥'),
      card('Tripod', '/phu-kien/camera/tripod.html', '', { q: 'Tripod' }, '🔭'),
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.accessory,
  queryPreset: { q: 'Camera' },
});

const networkProfile = rootProfile({
  id: 'catalog-network',
  path: '/phu-kien/thiet-bi-mang.html',
  department: 'network',
  category: 'Thiết bị mạng',
  title: 'Thiết bị mạng',
  seoTitle: 'Thiết bị mạng máy tính | Giá rẻ, chất lượng, có trả góp',
  parentPath: '/phu-kien.html',
  parentTitle: 'Phụ kiện',
  banners: [
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/thiet-bi-mang-b2s-2026.png',
      'Thiết bị mạng Back to School',
      '/phu-kien/thiet-bi-mang.html',
    ),
    banner(
      'https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/thiet-bi-mang-b2s-2026.png',
      'Thiết bị mạng chính hãng',
      '/phu-kien/thiet-bi-mang.html',
    ),
  ],
  brandLinks: [
    ['TP-Link', 'tp-link'],
    ['ASUS', 'asus'],
    ['Tenda', 'tenda'],
    ['Xiaomi', 'xiaomi'],
    ['Ugreen', 'ugreen'],
    ['D-Link', 'd-link'],
  ].map(([label, brand]) => card(
    label,
    `/phu-kien/thiet-bi-mang/${brand}.html`,
    '',
    { category: 'Thiết bị mạng', brand },
  )),
  featureSection: {
    title: 'Chọn theo loại sản phẩm',
    items: [
      card('Bộ phát Wifi di động', '/phu-kien/thiet-bi-mang/bo-phat-wifi-di-dong.html', media('thiet-bi-mang-bo-phat-wifi.png'), { q: 'Bộ phát Wifi di động' }),
      card('Thiết bị phát sóng Wifi', '/phu-kien/thiet-bi-mang/thiet-bi-phat-wifi.html', media('thiet-bi-mang-thiet-bi-phat-wifi.png'), { q: 'Thiết bị phát sóng Wifi' }),
      card('Bộ kích sóng Wifi', '/phu-kien/thiet-bi-mang/bo-kich-song-wifi.html', media('thiet-bi-mang-bo-kich-song-wifi.png'), { q: 'Bộ kích sóng Wifi' }),
      card('Phụ kiện mạng', '/phu-kien/thiet-bi-mang/phu-kien-mang.html', media('thiet-bi-mang-phu-kien-mang.png'), { q: 'Phụ kiện mạng' }),
      card('Hub-Switch', '/phu-kien/thiet-bi-mang/hub-switch.html', media('thiet-bi-mang-hub-switch.png'), { q: 'Hub Switch' }),
      card('Mạng doanh nghiệp', '/phu-kien/thiet-bi-mang/mang-doanh-nghiep.html', media('thiet-bi-mang-doanh-nghiep.png'), { q: 'Thiết bị mạng doanh nghiệp' }),
      card('Card mạng', '/phu-kien/thiet-bi-mang/card-mang.html', media('thiet-bi-mang-card.png'), { q: 'Card mạng' }),
      card('USB Wifi', '/phu-kien/thiet-bi-mang/usb-wifi.html', media('thiet-bi-mang-usb-wifi.png'), { q: 'USB Wifi' }),
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.accessory,
});

const applianceProfile = rootProfile({
  id: 'catalog-appliance',
  path: '/do-gia-dung.html',
  department: 'appliance',
  category: 'Đồ gia dụng',
  title: 'Đồ gia dụng',
  seoTitle: 'Đồ gia dụng thông minh chính hãng, giá tốt',
  banners: [
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/may-hut-bui-cam-tay-deerma-072026.jpg', 'Máy hút bụi Deerma', '/do-gia-dung.html?q=Deerma'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/do-gia-dungdreame.jpg', 'Đồ gia dụng Dreame', '/do-gia-dung.html?q=Dreame'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/cate-may-chieu-326.jpg', 'Máy chiếu gia đình', '/do-gia-dung.html?q=Máy%20chiếu'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/robot-hut-bui-ecovacs-cate.jpg', 'Robot hút bụi Ecovacs', '/do-gia-dung.html?q=Ecovacs'),
  ],
  brandLinks: [
    'Roborock', 'Xiaomi', 'Ecovacs', 'Dyson', 'Dreame', 'LG', 'Tineco', 'Sharp',
    'Beecube', 'Wanbo', 'Levoit', 'Deerma', 'AQUA', 'Sunhouse', 'Toshiba',
    'FujiHome', 'Gaabor', 'Tefal', 'Cuckoo', 'Lumias', 'Magic', 'Bear', 'Philips',
  ].map((name) => card(name, `/do-gia-dung.html?brand=${encodeURIComponent(normalizeSlug(name))}`, '', { brand: normalizeSlug(name) })),
  featureSection: {
    title: 'Khám phá danh mục',
    tabs: ['Sản phẩm nổi bật', 'Gia dụng nhà bếp', 'Sức khỏe làm đẹp', 'Thiết bị điện gia đình'],
    items: [
      card('Máy lọc không khí', '/do-gia-dung.html?q=Máy%20lọc%20không%20khí', '', { q: 'Máy lọc không khí' }, '🌬️'),
      card('Máy hút bụi', '/do-gia-dung.html?q=Máy%20hút%20bụi', '', { q: 'Máy hút bụi' }, '🧹'),
      card('Nồi chiên không dầu', '/do-gia-dung.html?q=Nồi%20chiên%20không%20dầu', '', { q: 'Nồi chiên không dầu' }, '🍟'),
      card('Máy chiếu', '/do-gia-dung.html?q=Máy%20chiếu', '', { q: 'Máy chiếu' }, '📽️'),
      card('Bàn chải điện', '/do-gia-dung.html?q=Bàn%20chải%20điện', '', { q: 'Bàn chải điện' }, '🪥'),
      card('Máy Massage', '/do-gia-dung.html?q=Máy%20massage', '', { q: 'Máy massage' }, '💆'),
    ],
  },
  filterIds: CATALOG_FILTER_IDS.appliance,
});

const beautyProfile = rootProfile({
  id: 'catalog-beauty',
  path: '/nha-thong-minh/suc-khoe-lam-dep.html',
  department: 'beauty',
  category: 'Đồ gia dụng',
  title: 'Làm đẹp - Chăm sóc sức khỏe',
  seoTitle: 'Thiết bị làm đẹp, chăm sóc sức khỏe chính hãng',
  parentPath: '/do-gia-dung.html',
  parentTitle: 'Đồ gia dụng',
  banners: [
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/massage-breo-2026.jpg', 'Thiết bị massage BREO', '/nha-thong-minh/suc-khoe-lam-dep.html?q=BREO'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/may-cao-rau-phillips.jpg', 'Thiết bị chăm sóc Philips', '/nha-thong-minh/suc-khoe-lam-dep.html?q=Philips'),
  ],
  promoPanel: {
    title: 'LÀM ĐẸP CÁ NHÂN',
    subtitle: 'Ưu đãi thiết bị chăm sóc sức khỏe và làm đẹp đến 68%',
    tone: 'rose',
  },
  featureSection: {
    title: 'Chọn sản phẩm',
    items: [
      card('Máy sấy tóc', '/nha-thong-minh/suc-khoe-lam-dep.html?q=Máy%20sấy%20tóc', '', { q: 'Máy sấy tóc' }, '💨'),
      card('Máy tạo kiểu tóc', '/nha-thong-minh/suc-khoe-lam-dep.html?q=Máy%20tạo%20kiểu%20tóc', '', { q: 'Máy tạo kiểu tóc' }, '💇'),
      card('Máy cạo râu', '/nha-thong-minh/suc-khoe-lam-dep.html?q=Máy%20cạo%20râu', '', { q: 'Máy cạo râu' }, '🪒'),
      card('Máy triệt lông', '/nha-thong-minh/suc-khoe-lam-dep.html?q=Máy%20triệt%20lông', '', { q: 'Máy triệt lông' }, '✨'),
      card('Tông đơ cắt tóc', '/nha-thong-minh/suc-khoe-lam-dep.html?q=Tông%20đơ', '', { q: 'Tông đơ' }, '✂️'),
      card('Máy tỉa lông mũi', '/nha-thong-minh/suc-khoe-lam-dep.html?q=Máy%20tỉa%20lông%20mũi', '', { q: 'Máy tỉa lông mũi' }, '👃'),
    ],
  },
  filterIds: CATALOG_FILTER_IDS.appliance,
  queryPreset: {
    q: [
      'Máy sấy tóc',
      'Máy massage',
      'Máy cạo râu',
      'Bàn chải điện',
      'Máy tăm nước',
      'Máy tạo kiểu tóc',
      'Máy triệt lông',
      'Tông đơ cắt tóc',
      'Máy tỉa lông mũi',
      'Máy rửa mặt',
      'Máy đo huyết áp',
      'Cân sức khỏe',
    ].join('|'),
  },
});

const accessoryItems = [
  ['Phụ kiện Apple', '/phu-kien/apple.html', ''],
  ['Sạc, cáp', '/phu-kien/sac-dien-thoai.html', '🔌', { q: 'Sạc cáp' }],
  ['Pin sạc dự phòng', '/phu-kien/pin-du-phong.html', '🔋'],
  ['Bao da, ốp lưng', '/phu-kien/bao-da-op-lung.html', '📱'],
  ['Dán màn hình', '/phu-kien/dan-man-hinh.html', '🛡️'],
  ['Thẻ nhớ, USB', '/phu-kien/the-nho-usb-otg.html', '💾'],
  ['Sim 4G', '/sim-3g-4g-nghe-goi.html', '📶', { category: 'Sim 4G', categoryMode: 'primary', q: 'Sim 4G' }],
  ['Gaming Gear, Playstation', '/phu-kien/gaming-gear.html', '🎮'],
  ['Thiết bị mạng', '/phu-kien/thiet-bi-mang.html', '🌐'],
  ['Camera', '/phu-kien/camera.html', '📹'],
  ['Gimbal', '/phu-kien/camera/gimbal.html', '🎥'],
  ['Máy ảnh', '/may-anh.html', '📷'],
  ['Chuột, bàn phím', '/phu-kien/chuot-ban-phim-may-tinh.html', '⌨️'],
  ['Hub chuyển đổi', '/phu-kien/sac-dien-thoai/cap-chuyen-doi-dau-chuyen-doi-macbook.html', '🔀'],
  ['Balo, Túi xách', '/phu-kien/balo-tui-chong-soc-laptop.html', '🎒'],
  ['Dây đeo chéo điện thoại', '/phu-kien/bao-da-op-lung/day-deo-dien-thoai.html', '🧵'],
  ['Phụ kiện điện thoại', '/phu-kien/dien-thoai.html', '📲'],
  ['Phụ kiện laptop', '/phu-kien/may-tinh-laptop.html', '💻'],
  ['Kính thông minh', '/phu-kien/kinh-thong-minh.html', '👓'],
  ['Decor bàn làm việc', '/phu-kien/decor-setup.html', '🪴'],
  ['Pin tiểu', '/phu-kien/pin-tieu.html', '🔋'],
  ['Quạt cầm tay / Quạt mini', '/phu-kien/phu-kien-tien-ich/quat-mini.html', '🪭'],
  ['Đèn năng lượng mặt trời', '/den-nang-luong-mat-troi.html', '☀️'],
  ['Đèn pin', '/phu-kien/den-pin.html', '🔦'],
];

const accessoryProfile = rootProfile({
  id: 'catalog-accessory',
  path: '/phu-kien.html',
  department: 'accessory',
  category: 'Phụ kiện',
  title: 'Phụ kiện điện thoại, máy tính',
  seoTitle: 'Phụ kiện điện thoại, công nghệ gần đây | Giá rẻ - Trả góp 0%',
  banners: [
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/pin-cu-cap-bao-lu-cate.png', 'Pin, củ sạc, cáp dự phòng', '/phu-kien.html?q=Sạc%20cáp'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/sliding%20cate.png', 'Dịch vụ lắp đặt Camera', '/phu-kien/camera.html'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/den-nang-luong-mat-troi-cate.png', 'Đèn năng lượng mặt trời', '/den-nang-luong-mat-troi.html'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/pin-anker-b2s-2026.jpg', 'Phụ kiện Anker', '/phu-kien.html?q=Anker'),
  ],
  featureSection: {
    title: 'Danh mục phụ kiện',
    variant: 'compact',
    items: accessoryItems.map(([label, href, icon, queryPreset]) => card(
      label,
      href,
      '',
      queryPreset || { q: label },
      icon,
    )),
  },
  promoPanel: {
    title: 'Phụ kiện di động',
    href: '/phu-kien/dien-thoai.html',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:1200:0/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/pkdt_desk.jpg',
    position: 'after-features',
  },
  filterIds: CATALOG_FILTER_IDS.accessory,
});

const pcProfile = rootProfile({
  id: 'catalog-pc',
  path: '/may-tinh-de-ban.html',
  department: 'pc',
  category: 'PC',
  title: 'PC | Máy tính để bàn',
  seoTitle: 'PC [Dell, HP, Asus] Máy tính để bàn sale T07/2026',
  topNavigation: COMPUTER_NAVIGATION,
  banners: [
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/quantum-cate-12-03.png', 'PC CPS Quantum', '/may-tinh-de-ban.html?q=Quantum'),
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/Cate Inteli5.png', 'PC CPS văn phòng Intel', '/may-tinh-de-ban.html?q=Intel'),
  ],
  brandLinks: [
    card('PC GAMING', '/may-tinh-de-ban.html?q=Gaming', '', { q: 'Gaming' }),
    card('PC HỌC TẬP - VĂN PHÒNG', '/may-tinh-de-ban.html?q=Văn%20phòng', '', { q: 'Văn phòng' }),
    card('MÁY TÍNH ĐỒ HỌA', '/may-tinh-de-ban.html?q=Đồ%20họa', '', { q: 'Đồ họa' }),
    card('PC AI', '/may-tinh-de-ban.html?special=AI%20tích%20hợp', '', { special: 'AI tích hợp' }),
  ],
  featureSection: {
    title: 'Chọn theo tiêu chí',
    items: [
      card('Build PC', '/may-tinh-de-ban/build-pc.html', '', { q: 'Build PC' }, '🧩'),
      card('PC ráp sẵn CellphoneS', '/may-tinh-de-ban.html?q=PC%20CPS', '', { q: 'PC CPS' }, '🖥️'),
      card('Máy tính All In One', '/may-tinh-de-ban.html?q=All%20In%20One', '', { q: 'All In One' }, '💻'),
      card('Máy tính đồng bộ', '/may-tinh-de-ban.html?q=Máy%20tính%20đồng%20bộ', '', { q: 'Máy tính đồng bộ' }, '🏢'),
      card('Linh kiện máy tính', '/linh-kien.html', '', { q: 'Linh kiện máy tính' }, '⚙️'),
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.pc,
});

const computerComponentProfile = rootProfile({
  id: 'catalog-computer-components',
  path: '/linh-kien.html',
  department: 'computer-components',
  category: 'Linh kiện máy tính',
  title: 'Linh kiện máy tính',
  seoTitle: 'Linh kiện máy tính, linh kiện laptop, PC | Giảm đến 47%, giá sốc',
  parentPath: '/may-tinh-de-ban.html',
  parentTitle: 'PC | Máy tính để bàn',
  topNavigation: COMPUTER_NAVIGATION,
  banners: [
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/cate_case_msi.png', 'Case MSI', '/linh-kien/case.html'),
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/linh-kien-pc.png', 'Linh kiện PC', '/linh-kien.html'),
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/o-cung-ssd-cate-26-08.png', 'Ổ cứng SSD', '/linh-kien/o-cung.html'),
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/card-man-hinh-amd-cate-26-08.jpg', 'Card màn hình AMD', '/linh-kien/vga.html'),
  ],
  featureSection: {
    title: 'Chọn linh kiện',
    items: [
      card('CPU', '/linh-kien/cpu.html', '', { q: 'CPU' }, '🧠'),
      card('Mainboard', '/linh-kien/mainboard.html', '', { q: 'Mainboard' }, '🧩'),
      card('RAM', '/linh-kien/ram.html', '', { q: 'RAM máy tính' }, '💾'),
      card('Ổ cứng', '/linh-kien/o-cung.html', '', { q: 'Ổ cứng' }, '💽'),
      card('Nguồn', '/linh-kien/nguon.html', '', { q: 'Nguồn máy tính' }, '🔌'),
      card('VGA', '/linh-kien/vga.html', '', { q: 'Card màn hình VGA' }, '🎮'),
      card('Tản nhiệt', '/linh-kien/tan-nhiet.html', '', { q: 'Tản nhiệt' }, '🧊'),
      card('Case', '/linh-kien/case.html', '', { q: 'Case máy tính' }, '🗄️'),
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.pc,
});

const gamingGearProfile = rootProfile({
  id: 'catalog-gaming-gear',
  path: '/phu-kien/gaming-gear.html',
  department: 'gaming-gear',
  category: 'Gaming Gear',
  title: 'Gaming Gear',
  seoTitle: 'Gaming Gear, phụ kiện, thiết bị chơi game | Giá rẻ',
  parentPath: '/phu-kien.html',
  parentTitle: 'Phụ kiện',
  brandLinks: [
    ['Logitech', 'logitech'],
    ['ASUS ROG', 'asus'],
    ['MSI', 'msi'],
    ['Sony', 'sony'],
    ['HyperX', 'hyperx'],
  ].map(([label, brand]) => card(
    label,
    `/phu-kien/gaming-gear/${brand}.html`,
    '',
    { category: 'Gaming Gear', brand },
  )),
  featureSection: {
    title: 'Chọn loại sản phẩm',
    items: [
      card('Máy chơi game', '/phu-kien/gaming-gear/may-choi-game.html', media('gaming-gear-play-staytion.png'), { q: 'Máy chơi game' }),
      card('Tay cầm chơi game', '/phu-kien/gaming-gear/tay-cam.html', media('gaming-gear-tay-cam.png'), { q: 'Tay cầm chơi game' }),
      card('Bàn phím Gaming', '/phu-kien/gaming-gear/ban-phim.html', media('gaming-gear-ban-phim-gaming.png'), { q: 'Bàn phím Gaming' }),
      card('Chuột Gaming', '/phu-kien/gaming-gear/chuot.html', media('gaming-gear-chuot-gaming.png'), { q: 'Chuột Gaming' }),
      card('Tai nghe Gaming', '/phu-kien/gaming-gear/tai-nghe.html', media('gaming-gear-tainghe-gaming.png'), { q: 'Tai nghe Gaming' }),
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.accessory,
});

const monitorProfile = rootProfile({
  id: 'catalog-monitor',
  path: '/man-hinh.html',
  department: 'monitor',
  category: 'Màn hình',
  title: 'Màn hình máy tính',
  seoTitle: 'Màn hình máy tính, PC (15.6 - 49 inch) giảm hơn 5Tr góp 0%',
  topNavigation: COMPUTER_NAVIGATION,
  banners: [
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/srfhsg.png', 'Màn hình Back to School', '/man-hinh.html'),
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/sfgsgs.png', 'Tuần lễ màn hình gaming', '/man-hinh/gaming.html'),
  ],
  brandLinks: monitorBrandLinks,
  featureSection: {
    title: 'Chọn theo nhu cầu',
    items: [
      card('Gaming', '/man-hinh/gaming.html', media('image_16.png'), { q: 'Gaming' }),
      card('Văn phòng', '/man-hinh/van-phong.html', media('image_2__1.png'), { q: 'Văn phòng' }),
      card('Đồ họa', '/man-hinh/do-hoa.html', media('image_1__2.png'), { q: 'Đồ họa' }),
      card('Màn hình cong', '/man-hinh.html?q=Màn%20hình%20cong', media('Icon/image_4.png'), { q: 'Màn hình cong' }),
      card('Màn hình lập trình', '/man-hinh/lap-trinh.html', media('image_3__1.png'), { q: 'Màn hình lập trình' }),
      card('Màn hình di động', '/man-hinh/di-dong.html', media('image_5_.png'), { q: 'Màn hình di động' }),
      card('Arm màn hình', '/man-hinh/gia-treo-man-hinh.html', media('image_4__1.png'), { q: 'Arm màn hình' }),
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.monitor,
});

const printerProfile = rootProfile({
  id: 'catalog-printer',
  path: '/may-in.html',
  department: 'printer',
  category: 'Máy in',
  title: 'Máy in',
  seoTitle: 'Máy in laser, phun màu chính hãng góp 0% giá rẻ T07/2026',
  topNavigation: COMPUTER_NAVIGATION,
  banners: [
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/eeeedgvwadv.png', 'Máy in Back to School', '/may-in.html'),
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/may-in-hp-n.png', 'Máy in HP', '/may-in/hp.html'),
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/advacazsc.png', 'Máy in Brother', '/may-in/may-in-brother.html'),
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/sfvszdcs.png', 'Máy in Canon', '/may-in/canon.html'),
  ],
  brandLinks: printerBrandLinks,
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.printer,
});

const tvProfile = rootProfile({
  id: 'catalog-tv',
  path: '/tivi.html',
  department: 'tv',
  category: 'Tivi',
  title: 'Tivi',
  seoTitle: 'Tivi giá rẻ, Smart TV LED 4K, OLED, QLED trả góp 0% 2026',
  banners: [
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/cate-tvi-giam-30.jpg', 'Đăng ký thành viên - TV giảm đến 30%', '/tivi.html'),
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/tivi-gia-re-bhmr-cate.png', 'Bảo hành mở rộng Tivi', '/tivi.html'),
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/tivi-sony-thang-7.jpg', 'Tivi Sony', '/tivi/sony.html'),
    banner('https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/tivi-samsung-thang-7.jpg', 'Tivi Samsung', '/tivi/samsung.html'),
  ],
  brandLinks: televisionBrands,
  featureSection: {
    title: 'Chọn tivi theo nhu cầu',
    items: [
      ...[32, 43, 55, 60, 65, 75].map((size) => (
        card(
          `${size} inch`,
          `/tivi/tivi-${size}-inch.html`,
          media(`tivi-${size}-inch-cate-new.png`),
          { screenSize: `${size} inch` },
        )
      )),
      card('Tivi cũ', '/hang-cu/tivi.html', media('tivi-cu-cate-new.png'), { category: 'Hàng cũ', q: 'Tivi' }),
      card('Giá treo tivi', '/tivi/gia-treo-tivi.html', media('gia-treo-tivi-cate-new.png'), { q: 'Giá treo tivi' }),
    ],
  },
  featuredTitle: 'SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.tv,
});

const refrigeratorProfile = rootProfile({
  id: 'catalog-refrigerator',
  path: '/tu-lanh.html',
  department: 'refrigerator',
  category: 'Tủ lạnh',
  title: 'Tủ lạnh',
  seoTitle: 'Tủ lạnh giá rẻ | Voucher giảm 5%, Trả góp 0%, Đời mới 2026',
  banners: [
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/mo-ban-dien-lanh-xiaomi-949-cate.png',
      'Điện lạnh Xiaomi giá tốt',
      '/tu-lanh/xiaomi.html',
    ),
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/mo-ban-dien-lanh-xiaomi-949-cate.png',
      'Điện lạnh Xiaomi giá tốt',
      '/may-lanh/xiaomi.html',
    ),
  ],
  brandLinks: applianceBrandLinks(
    ['SAMSUNG', 'Panasonic', 'LG', 'AQUA', 'Toshiba', 'Xiaomi', 'Sharp', 'Hitachi'],
    '/tu-lanh',
    'Tủ lạnh',
  ),
  featureSection: {
    title: 'Chọn theo dòng tủ',
    items: [
      card(
        'Nhiều cánh',
        '/tu-lanh.html?tulanh_kieu_tu_filter=nhieu-canh',
        media('tu-lanh-nhieu-canh.png'),
        { q: 'Tủ lạnh nhiều cánh' },
      ),
      card(
        'Side By Side',
        '/tu-lanh.html?tulanh_kieu_tu_filter=side-by-side',
        media('tu-lanh-side-by-side.png'),
        { q: 'Tủ lạnh Side By Side' },
      ),
      card(
        'Mini',
        '/tu-lanh/mini.html',
        media('tu-lanh-mini_1.png'),
        { q: 'Tủ lạnh mini' },
      ),
    ],
  },
  featuredTitle: '🔥 SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.coldAppliance,
  queryPreset: { categoryMode: 'primary' },
});

const washingMachineProfile = rootProfile({
  id: 'catalog-washing-machine',
  path: '/may-giat.html',
  department: 'washing-machine',
  category: 'Máy giặt',
  title: 'Máy giặt',
  seoTitle: 'Máy giặt giá rẻ, chính hãng, trả góp 0%, bảo hành đến 2 năm',
  banners: [
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/may-giat-xiaomi-cate.jpg',
      'Máy giặt sấy Xiaomi',
      '/may-giat/xiaomi.html',
    ),
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/tu-cham-soc-quan-ao-thong-minh-panasonic-hcc-r340arxv-cate.jpg',
      'Tủ chăm sóc quần áo Panasonic',
      '/may-giat.html?q=Tủ%20chăm%20sóc%20quần%20áo%20Panasonic',
    ),
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/may-giat-lg-inverter-cua-ngang-9kg-fb1209s5m-cate.jpg',
      'Máy giặt LG cửa ngang',
      '/may-giat/lg.html',
    ),
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/may-giat-toshiba-inverter-12kg-tw-t21bu130uwv-mg-cate.jpg',
      'Máy giặt Toshiba cửa ngang',
      '/may-giat/toshiba.html',
    ),
  ],
  brandLinks: applianceBrandLinks(
    ['AQUA', 'Electrolux', 'Hitachi', 'LG', 'Panasonic', 'SAMSUNG', 'Toshiba', 'Xiaomi', 'Sharp'],
    '/may-giat',
    'Máy giặt',
  ),
  featureSection: {
    title: 'Chọn dòng máy giặt',
    items: [
      card('Cửa ngang', '/may-giat/cua-ngang.html', media('may-giat-cua-truoc.png'), { q: 'Máy giặt cửa ngang' }),
      card('Cửa trên', '/may-giat/cua-tren.html', media('may-giat-cua-tren.png'), { q: 'Máy giặt cửa trên' }),
      card('Máy giặt sấy', '/may-giat/may-giat-say.html', media('may-giat-say.png'), { q: 'Máy giặt sấy' }),
      card('Tháp giặt sấy', '/may-giat/thap-giat-say.html', media('may-giat-thap-giat-say.png'), { q: 'Tháp giặt sấy' }),
      card(
        'Tủ chăm sóc quần áo',
        '/may-giat/tu-cham-soc-quan-ao.html',
        media('may-giat-tu-cham-soc-quan-ao.png'),
        { q: 'Tủ chăm sóc quần áo' },
      ),
    ],
  },
  featuredTitle: '🔥 SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.coldAppliance,
  queryPreset: { categoryMode: 'primary' },
});

const airConditionerProfile = rootProfile({
  id: 'catalog-air-conditioner',
  path: '/may-lanh.html',
  department: 'air-conditioner',
  category: 'Máy lạnh',
  title: 'Điều hòa, máy lạnh',
  seoTitle: 'Máy lạnh giá rẻ, Điều hòa tiết kiệm điện | Voucher giảm 5%, Giao 2h',
  banners: [
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/may-lanh-LG-cate.png',
      'Máy lạnh LG',
      '/may-lanh/lg.html',
    ),
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/may-lanh-sharp-cate.png',
      'Máy lạnh Sharp',
      '/may-lanh/sharp.html',
    ),
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/may-lanh-aqua-cate.png',
      'Máy lạnh AQUA',
      '/may-lanh/aqua.html',
    ),
    banner(
      'https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/may-lanh-samsung-cate.png',
      'Máy lạnh Samsung',
      '/may-lanh/samsung.html',
    ),
  ],
  brandLinks: applianceBrandLinks(
    ['Panasonic', 'Daikin', 'Sharp', 'LG', 'AQUA', 'SAMSUNG', 'Casper', 'TCL', 'Hitachi', 'Xiaomi', 'Toshiba'],
    '/may-lanh',
    'Máy lạnh',
  ),
  featuredTitle: '🔥 SẢN PHẨM NỔI BẬT',
  filterIds: CATALOG_FILTER_IDS.coldAppliance,
});

const electronicsProfile = rootProfile({
  id: 'catalog-electronics',
  path: '/dien-may.html',
  department: 'electronics',
  category: 'Điện máy',
  apiCategory: [
    'Tivi',
    'Máy giặt',
    'Máy sấy quần áo',
    'Máy rửa bát',
    'Điều hòa - Máy lạnh',
    'Tủ lạnh',
    'Tủ đông',
  ].join('|'),
  title: 'Điện máy',
  seoTitle: 'Cửa hàng điện máy chính hãng | Giá rẻ, hỗ trợ trả góp 0%',
  banners: [
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/tivi-gia-re-bhmr-cate.png', 'Tivi giá tốt', '/tivi.html'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/may-giat-lg-ai-inverter-cua-ngang-12kg-fv1412s3b-cate.jpg', 'Máy giặt LG AI Inverter', '/may-giat/lg.html'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/may-giat-xiaomi-cate.jpg', 'Máy giặt sấy Xiaomi', '/may-giat/xiaomi.html'),
    banner('https://media-asset.cellphones.com.vn/dashboard-v1/manage-banner/may-say-quan-ao-alec-thang-7.jpg', 'Máy sấy quần áo', '/may-say-quan-ao.html'),
  ],
  promoPanel: {
    title: 'ĐIỆN MÁY GIÁ TỐT',
    subtitle: 'Thiết bị điện máy chính hãng, giao lắp tận nơi',
    tone: 'blue',
    image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:1200:0/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/block-dien-may-new-desk.png',
    mobileImage: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:1200:0/q:100/plain/https://media-asset.cellphones.com.vn/dashboard-v1/block-dien-may-new-mobi.png',
  },
  featureSection: {
    title: 'Danh mục điện máy',
    items: [
      card('Tủ lạnh', '/tu-lanh.html', media('tu-lanh-nhieu-canh.png'), { q: 'Tủ lạnh' }),
      card('Máy giặt', '/may-giat.html', '', { q: 'Máy giặt' }, '🧺'),
      card('Máy lạnh', '/may-lanh.html', '', { q: 'Máy lạnh' }, '❄️'),
      card('Máy sấy', '/may-say-quan-ao.html', '', { q: 'Máy sấy quần áo' }, '♨️'),
      card('Máy giặt - sấy', '/may-giat/may-giat-say.html', '', { q: 'Máy giặt sấy' }, '🔄'),
      card('Tháp giặt sấy', '/may-giat/thap-giat-say.html', '', { q: 'Tháp giặt sấy' }, '🏗️'),
      card('Tủ chăm sóc quần áo', '/may-giat/tu-cham-soc-quan-ao.html', '', { q: 'Tủ chăm sóc quần áo' }, '👔'),
      card('Tivi', '/tivi.html', '', { q: 'Tivi' }, '📺'),
      card('Máy rửa chén bát', '/may-rua-chen-bat.html', '', { q: 'Máy rửa chén bát' }, '🍽️'),
    ],
  },
  filterIds: CATALOG_FILTER_IDS.appliance,
  queryPreset: { categoryMode: 'primary' },
});

export const CATALOG_LANDING_PROFILES = [
  tabletProfile,
  laptopProfile,
  audioProfile,
  headphoneProfile,
  microphoneProfile,
  karaokeMicrophoneProfile,
  turntableProfile,
  speakerProfile,
  watchProfile,
  cameraProfile,
  networkProfile,
  applianceProfile,
  beautyProfile,
  accessoryProfile,
  pcProfile,
  computerComponentProfile,
  gamingGearProfile,
  monitorProfile,
  printerProfile,
  tvProfile,
  refrigeratorProfile,
  washingMachineProfile,
  airConditionerProfile,
  electronicsProfile,
];

export const CATALOG_ROOT_PATHS = CATALOG_LANDING_PROFILES.map((profile) => profile.path);
