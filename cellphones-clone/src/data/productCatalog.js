import {
  applianceProducts,
  audioProducts,
  flashSaleProducts,
  hotTrendProducts,
  laptopProducts,
  phoneProducts,
  tvProducts,
  watchProducts,
} from './mockData';
import { productDetails } from './productDetails';

const productCollections = [
  hotTrendProducts,
  flashSaleProducts,
  phoneProducts,
  laptopProducts,
  audioProducts,
  watchProducts,
  tvProducts,
  applianceProducts,
];

export const catalogProducts = [
  ...productCollections.flat(),
  ...productDetails.flatMap((product) => product.relatedProducts || []),
];

export const createProductSlug = (value = '') => {
  const fallback = 'san-pham-moi';

  return String(value || fallback)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
};

export const getProductId = (product) => {
  if (!product) return '';

  return String(product._id || product.id || product.sku || createProductSlug(product.name));
};

export const getProductSlug = (product) => (
  product?.slug || product?.sku || createProductSlug(product?.name || product?.id)
);

export const getProductPath = (product) => `/${getProductSlug(product)}.html`;

export const getProductDomId = (product) => (
  `product-card-${getProductSlug(product).replace(/[^a-z0-9_-]/g, '-')}`
);

export const extractProductSlug = (pathname = '') => {
  const cleaned = pathname
    .replace(/^\/+|\/+$/g, '')
    .replace(/^product\//, '')
    .replace(/\.html$/i, '');

  if (!cleaned || cleaned === 'index') return '';
  return cleaned;
};

const normalizeSlug = (slug) => extractProductSlug(`/${slug}`);

const productDetailMatches = (detail, slug) => (
  normalizeSlug(detail.slug) === slug || normalizeSlug(detail.sku) === slug
);

const productMatches = (product, slug) => (
  normalizeSlug(getProductSlug(product)) === slug
);

const getProductByDetail = (detail) => catalogProducts.find((product) => (
  getProductId(product) === detail.id ||
  product.detailId === detail.id ||
  normalizeSlug(getProductSlug(product)) === normalizeSlug(detail.slug)
));

const buildFallbackDetail = (product) => ({
  id: getProductId(product),
  sku: product.sku || getProductSlug(product),
  slug: getProductSlug(product),
  name: product.name,
  brand: product.brandName || product.brand,
  categoryTrail: [
    { id: 'home', name: 'Trang chủ', href: '/' },
    { id: 'catalog', name: 'Sản phẩm', href: '#' },
  ],
  currentPrice: product.currentPrice,
  originalPrice: product.originalPrice,
  discount: product.discount,
  rating: product.rating,
  ratingCount: product.ratingCount,
  installment: product.installment,
  city: product.city,
  thumbnail: product.image,
  media: [
    {
      id: `${getProductId(product)}-main-image`,
      type: 'image',
      label: 'Ảnh chính',
      src: product.image,
      alt: product.name,
    },
  ],
  highlights: [
    'Thông tin chi tiết đang chờ admin cập nhật.',
    'Cấu trúc trang đã sẵn sàng nhận media, thông số, phiên bản và mô tả từ API.',
  ],
  variants: [],
  colors: [],
  promotions: product.smember
    ? [{ id: 'smember', title: 'Ưu đãi Smember', description: product.smember }]
    : [],
  policies: [
    { id: 'official', title: 'Hàng chính hãng', description: 'Sản phẩm được quản lý theo catalog admin.' },
    { id: 'api-ready', title: 'Sẵn sàng nối API', description: 'Có thể thêm/sửa/xóa chi tiết qua MongoDB document.' },
  ],
  specifications: [],
  articleSections: [
    {
      id: 'admin-placeholder',
      heading: 'Mô tả sản phẩm',
      paragraphs: [
        'Admin có thể cập nhật nội dung mô tả, ảnh bài viết, bảng so sánh và FAQ cho sản phẩm này sau khi tích hợp API.',
      ],
    },
  ],
  faqs: [],
});

export const findProductDetailBySlug = (rawSlug) => {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return null;

  const detail = productDetails.find((item) => productDetailMatches(item, slug));
  if (detail) {
    const matchingProduct = getProductByDetail(detail);
    return { ...matchingProduct, ...detail };
  }

  const product = catalogProducts.find((item) => productMatches(item, slug));
  return product ? buildFallbackDetail(product) : null;
};

export const findProductDetailByPathname = (pathname) => (
  findProductDetailBySlug(extractProductSlug(pathname))
);
