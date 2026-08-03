import registry from '../data/public-routes.json';
import { resolveCategoryLandingProfile } from '../data/categoryLandingProfiles';

const trimPath = (pathname = '/') => {
  const cleaned = String(pathname || '/').replace(/\/{2,}/g, '/').replace(/\/+$/g, '');
  return cleaned || '/';
};

const exactRoutes = new Map();
const aliasRoutes = new Map();
const phoneLandingRoutes = Object.entries(registry.phoneLandings || {}).map(([path, title]) => ({
  id: `phone-landing:${path}`,
  path,
  pageType: 'filter',
  handling: 'internal',
  appPage: 'info',
  keyword: title.split('|')[0].trim(),
  category: 'Điện thoại',
  title,
  description: `Khám phá ${title.split('|')[0].trim()} với ưu đãi, trả góp 0% và giao hàng nhanh tại CellphoneS.`,
  robots: 'index,follow',
}));
const registeredRoutes = [...registry.routes, ...phoneLandingRoutes];

registeredRoutes.forEach((route) => {
  exactRoutes.set(trimPath(route.path), route);
  (route.aliases || []).forEach((alias) => aliasRoutes.set(trimPath(alias), route));
});

const titleFromSlug = (pathname = '') => (
  decodeURIComponent(trimPath(pathname).split('/').pop() || 'CellphoneS')
    .replace(/\.html$/i, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
);

export const PUBLIC_ROUTE_VERSION = registry.version;
export const PUBLIC_SITE_ORIGIN = registry.siteOrigin;
export const PUBLIC_EXTERNAL_LINKS = registry.external;
export const PUBLIC_ROUTES = registeredRoutes;

export function getExternalRouteTarget(route) {
  return route?.targetKey ? registry.external[route.targetKey] || '' : '';
}

export function resolvePublicRoute(pathname = '/') {
  const path = trimPath(pathname);
  const exact = exactRoutes.get(path);
  if (exact) return { ...exact, requestedPath: path, canonicalPath: exact.canonicalPath || exact.path, isAlias: false };

  const aliased = aliasRoutes.get(path);
  if (aliased) {
    return {
      ...aliased,
      requestedPath: path,
      canonicalPath: aliased.path,
      isAlias: true,
      handling: aliased.handling === 'external' ? 'external' : 'legacy-redirect',
    };
  }

  if ((registry.footerPagePaths || []).includes(path)) {
    return {
      id: `footer-page:${path}`,
      path,
      requestedPath: path,
      canonicalPath: path,
      pageType: 'content',
      handling: 'internal',
      appPage: 'footer-pages',
      title: titleFromSlug(path),
      description: 'Thông tin chính sách và dịch vụ tại CellphoneS.',
      robots: 'index,follow',
    };
  }

  if (path === '/search' || path === '/search.html' || path === '/catalogsearch/result') {
    const route = exactRoutes.get('/catalogsearch/result');
    return { ...route, requestedPath: path, canonicalPath: route.path, isAlias: path !== route.path };
  }

  const isInternalPrefix = registry.internalPrefixes.some((prefix) => path.startsWith(prefix));
  const isInternalExact = registry.internalExact.includes(path);
  const isCategoryExact = (registry.categoryExact || []).includes(path);
  if (isInternalPrefix || isInternalExact || isCategoryExact) {
    const pageType = isCategoryExact ? 'category' : (
      path.startsWith('/sforum/') ? 'news-article' : (
        /\.(?:html)$/i.test(path) && !path.startsWith('/chinh-sach/') ? 'filter' : 'content'
      )
    );
    return {
      id: `dynamic:${path}`,
      path,
      requestedPath: path,
      canonicalPath: path,
      pageType,
      handling: 'internal',
      appPage: 'info',
      title: titleFromSlug(path),
      description: 'Thông tin sản phẩm, dịch vụ và chính sách tại CellphoneS.',
      robots: 'index,follow',
      dynamic: true,
    };
  }

  if (/^\/[^/]+\.html(?:-\d+)?$/i.test(path)) {
    return {
      id: `product:${path}`,
      path,
      requestedPath: path,
      canonicalPath: path,
      pageType: 'product',
      handling: 'internal',
      appPage: 'product',
      productSlug: path.slice(1).replace(/\.html$/i, ''),
      title: `${titleFromSlug(path)} | CellphoneS`,
      description: `Thông tin, giá bán và ưu đãi ${titleFromSlug(path)} tại CellphoneS.`,
      robots: 'index,follow',
      dynamic: true,
    };
  }

  return {
    id: 'not-found',
    path,
    requestedPath: path,
    canonicalPath: path,
    pageType: 'not-found',
    handling: 'not-found',
    appPage: 'not-found',
    title: 'Trang không tồn tại',
    description: 'Đường dẫn bạn truy cập không tồn tại hoặc đã được thay đổi.',
    robots: 'noindex,nofollow',
  };
}

export function getCanonicalUrl(route, search = '') {
  const query = route?.pageType === 'search' ? String(search || '') : '';
  return `${registry.siteOrigin}${route?.canonicalPath || '/'}${query}`;
}

export function getRouteMetadata(route, search = '') {
  const params = new URLSearchParams(search || '');
  const keyword = params.get('key') || params.get('keyword') || params.get('q') || '';
  const isSearch = route?.pageType === 'search';
  const categoryLanding = resolveCategoryLandingProfile(
    route?.requestedPath || route?.canonicalPath || route?.path || '/',
  );
  const title = categoryLanding
    ? categoryLanding.seoTitle || `${categoryLanding.title} chính hãng, giá tốt | CellphoneS`
    : (
      isSearch && keyword
        ? `Kết quả tìm kiếm cho "${keyword}" | CellphoneS`
        : route?.title || 'CellphoneS'
    );
  const description = categoryLanding
    ? categoryLanding.seoDescription
      || `Mua ${categoryLanding.title} chính hãng, nhiều ưu đãi, trả góp 0% và giao hàng nhanh tại CellphoneS.`
    : (
      isSearch && keyword
        ? `Sản phẩm và nội dung phù hợp với từ khóa ${keyword} tại CellphoneS.`
        : route?.description || 'CellphoneS'
    );

  return {
    title,
    description,
    robots: route?.robots || 'index,follow',
    canonical: categoryLanding
      ? `${registry.siteOrigin}${categoryLanding.path}`
      : getCanonicalUrl(route, search),
    image: 'https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/Logo/Logo_CPS.png',
    type: route?.pageType === 'product' ? 'product' : 'website',
  };
}

export function getCategoryRouteModel(pathname = '/') {
  const route = resolvePublicRoute(pathname);
  if (!['category', 'filter'].includes(route.pageType)) return null;

  return {
    keyword: route.keyword || titleFromSlug(pathname),
    category: route.category || route.keyword || '',
    title: route.title || titleFromSlug(pathname),
  };
}

export default registry;
