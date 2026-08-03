import { useEffect, useMemo, useRef, useState } from "react";
import "./HotTrend.css";
import {
  hotTrendCategoryFilters,
  hotTrendSubFilters,
  hotTrendProducts,
  phoneProducts,
  laptopProducts,
  audioProducts,
  watchProducts,
  tvProducts,
  applianceProducts,
} from "../../data/mockData";
import ProductCard, { ProductCardSkeleton } from "../ProductCard/ProductCard";
import { useApiProducts } from "../../hooks/useApiProducts";
import {
  PHONE_BRANDS,
  LAPTOP_BRANDS,
  TABLET_BRANDS,
} from "../HeroSection/brandData";

const normalizeText = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const mainTabConfig = {
  deal: { sort: "hot_deal", filter: "hot-deal" },
  hot: { sort: "hot_trend" },
  new: { sort: "latest" },
};

const categoryQueryMap = {
  "phu-kien": { category: "Phụ kiện" },
  "dong-ho": { category: "Đồng hồ thông minh|Âm thanh" },
  "dien-thoai": { category: "Điện thoại" },
  tablet: { category: "Máy tính bảng" },
  laptop: { category: "Laptop" },
  "man-hinh": { category: "Màn hình|Linh kiện máy tính" },
  "dien-may": { category: "Đồ gia dụng|Tivi" },
  "hot-cool": {
    category: "Đồ gia dụng|Tivi",
    productType: "cooling-appliance",
  },
  "hot-camera": {
    category: "Phụ kiện|Máy ảnh",
    productType: "photo-camera",
  },
  "hot-travel": {
    category: "Phụ kiện|Âm thanh",
    productType: "travel-accessory",
  },
  "hot-worldcup": {
    category: "Tivi|Âm thanh",
    productType: "world-cup",
  },
  "new-mobile-tablet": { category: "Điện thoại|Máy tính bảng" },
  "new-office": { category: "Laptop|Màn hình|Linh kiện máy tính" },
  "new-watch-audio": { category: "Đồng hồ thông minh|Âm thanh" },
  "new-home-beauty": { category: "Đồ gia dụng" },
  "new-appliance": { category: "Đồ gia dụng|Tivi" },
  "new-accessory": { category: "Phụ kiện" },
};

const subFilterQueryMap = {
  all: {},
  "cu-cap": { productType: "cu-cap" },
  chuot: { productType: "chuot-ban-phim" },
  sac: { productType: "sac-du-phong" },
  camera: { productType: "camera" },
  "apple-pk": { productType: "phu-kien-apple" },
  "tien-ich": { productType: "phu-kien-tien-ich" },
  "op-lung": { productType: "op-lung" },
};

const commonAllFilter = { id: "all", name: "Tất cả", icon: "", variant: "all" };

const findBrandLogo = (brands, ...names) => {
  const normalizedNames = names.map(normalizeText);
  return (
    brands.find((brand) => normalizedNames.includes(normalizeText(brand.name)))
      ?.logo || ""
  );
};

const brandFilter = (id, name, brands, aliases = [name]) => ({
  id,
  name,
  icon: findBrandLogo(brands, ...aliases),
  variant: "brand",
});

const productFilter = (id, name, icon) => ({
  id,
  name,
  icon,
  variant: "product",
});

const hotTrendProductIcons = {
  watch:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/wysiwyg/thong-minhh.png",
  headphone:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/tainghebluetooth.png",
  speaker:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/loa-bluetooth.png",
  tivi: "https://cdn2.cellphones.com.vn/insecure/rs:fill:80:80/q:90/plain/https://cellphones.com.vn/media/catalog/product/s/m/smart-tivi-lg-uhd-4k-65-inch-65ua8055psa.png",
  airPurifier:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-loc-khong-khi-lg-puricare-aero-hit-s35ggw10-abae_1.png",
  fridge:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:80:80/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/u/tu-lanh-xiaomi-mijia-multidoor-mrc51hmpa-2025-510-lit.png",
  robotVacuum:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/r/o/robot-hut-bui-dreame-x60-ultra-3_1.jpg",
  fan: "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/q/u/quat-dung-toshiba-f-lsa10-h-vn.png",
  handheldVacuum:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-hut-bui-cam-tay-dreame-r10.png",
  projector:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/may-chieu-mini-beecube-x2-neo-1_1.jpg",
  washer:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/wysiwyg/dien-may-may-giat-new.png",
  dryer:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:50:50/q:90/plain/https://cellphones.com.vn/media/wysiwyg/dien-may-may-say-new.png",
  aircon:
    "https://cdn2.cellphones.com.vn/x/media/wysiwyg/may-lanh-dien-lanh-new.png",
  fryer:
    "https://cellphones.com.vn/media/wysiwyg/menu-noi-chien-duoi-5-lit.png  ",
  riceCooker:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/menu-com-nap-roi.png",
  monitor:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:80:80/q:90/plain/https://cellphones.com.vn/media/catalog/product/t/e/text_ng_n_2__9_234.png",
  pc: "https://cdn2.cellphones.com.vn/insecure/rs:fill:80:80/q:90/plain/https://cellphones.com.vn/media/catalog/product/p/c/pc-rosa-office-amd-r5-5500gt_3_.png",

  camera: "https://cellphones.com.vn/media/wysiwyg/camera-may-anh.png",

  travel:
    "https://cdn2.cellphones.com.vn/x/media/wysiwyg/pin-du-phong-20000-mah.png",
};

const hotTrendSpecialFilters = [
  productFilter("hot-cool", "HÈ MÁT LẠNH", hotTrendProductIcons.aircon),
  productFilter("hot-camera", "CHỤP ẢNH", hotTrendProductIcons.camera),
  productFilter("hot-travel", "DU LỊCH", hotTrendProductIcons.travel),
  productFilter("hot-worldcup", "WORLD CUP", hotTrendProductIcons.tivi),
];

const newArrivalFilters = [
  { id: "new-mobile-tablet", name: "ĐIỆN THOẠI - MÁY TÍNH BẢNG" },
  { id: "new-office", name: "MÁY TÍNH - THIẾT BỊ VĂN PHÒNG" },
  { id: "new-watch-audio", name: "ĐỒNG HỒ - ÂM THANH" },
  { id: "new-home-beauty", name: "GIA DỤNG - THIẾT BỊ LÀM ĐẸP" },
  { id: "new-appliance", name: "ĐIỆN MÁY" },
  { id: "new-accessory", name: "PHỤ KIỆN" },
];

const categoryFiltersByMainTab = {
  deal: hotTrendCategoryFilters,
  hot: hotTrendSpecialFilters,
  new: newArrivalFilters,
};

const defaultCategoryByMainTab = {
  deal: "phu-kien",
  hot: "hot-cool",
  new: "new-mobile-tablet",
};

const hotTrendSubFiltersByCategory = {
  "phu-kien": hotTrendSubFilters,
  "dong-ho": [
    commonAllFilter,
    productFilter("watch", "Đồng hồ", hotTrendProductIcons.watch),
    productFilter("headphone", "Tai nghe", hotTrendProductIcons.headphone),
    productFilter("speaker", "Loa", hotTrendProductIcons.speaker),
  ],
  "dien-may": [
    commonAllFilter,
    productFilter("tivi", "Tivi", hotTrendProductIcons.tivi),
    productFilter(
      "air-purifier",
      "Máy lọc không khí",
      hotTrendProductIcons.airPurifier,
    ),
    productFilter("fridge", "Tủ lạnh", hotTrendProductIcons.fridge),
    productFilter(
      "robot-vacuum",
      "Robot hút bụi",
      hotTrendProductIcons.robotVacuum,
    ),
    productFilter("fan", "Quạt", hotTrendProductIcons.fan),
    productFilter(
      "handheld-vacuum",
      "Hút bụi cầm tay",
      hotTrendProductIcons.handheldVacuum,
    ),
    productFilter("projector", "Máy chiếu", hotTrendProductIcons.projector),
    productFilter("washer", "Máy giặt", hotTrendProductIcons.washer),
    productFilter("dryer", "Máy sấy", hotTrendProductIcons.dryer),
    productFilter("aircon", "Máy lạnh", hotTrendProductIcons.aircon),
    productFilter("fryer", "Nồi chiên", hotTrendProductIcons.fryer),
    productFilter("rice-cooker", "Nồi cơm", hotTrendProductIcons.riceCooker),
  ],
  "dien-thoai": [
    commonAllFilter,
    brandFilter("apple", "Apple", PHONE_BRANDS),
    brandFilter("samsung", "Samsung", PHONE_BRANDS),
    brandFilter("xiaomi", "Xiaomi", PHONE_BRANDS),
    brandFilter("oppo", "OPPO", PHONE_BRANDS, ["Oppo"]),
    brandFilter("tecno", "TECNO", PHONE_BRANDS, ["Tecno"]),
    brandFilter("honor", "HONOR", PHONE_BRANDS, ["Honor"]),
    brandFilter("nubia", "Nubia", PHONE_BRANDS),
  ],
  tablet: [
    commonAllFilter,
    brandFilter("ipad", "iPad", TABLET_BRANDS),
    brandFilter("tablet-samsung", "Samsung", TABLET_BRANDS),
    brandFilter("tablet-xiaomi", "Xiaomi", TABLET_BRANDS),
    brandFilter("tablet-huawei", "Huawei", TABLET_BRANDS),
    brandFilter("tablet-lenovo", "Lenovo", TABLET_BRANDS),
  ],
  laptop: [
    commonAllFilter,
    brandFilter("macbook", "MacBook", LAPTOP_BRANDS),
    brandFilter("asus", "ASUS", LAPTOP_BRANDS),
    brandFilter("lenovo", "Lenovo", LAPTOP_BRANDS),
    brandFilter("msi", "MSI", LAPTOP_BRANDS, ["msi"]),
    brandFilter("acer", "Acer", LAPTOP_BRANDS, ["acer"]),
    brandFilter("hp", "HP", LAPTOP_BRANDS),
    brandFilter("dell", "Dell", LAPTOP_BRANDS, ["DELL"]),
    brandFilter("gigabyte", "GIGABYTE", LAPTOP_BRANDS),
  ],
  "man-hinh": [
    commonAllFilter,
    productFilter("monitor", "Màn hình", hotTrendProductIcons.monitor),
    productFilter("pc", "PC", hotTrendProductIcons.pc),
  ],
};

const categorySubFilterQueryMap = {
  "phu-kien": subFilterQueryMap,
  "dong-ho": {
    watch: { q: "Đồng hồ" },
    headphone: { q: "Tai nghe" },
    speaker: { q: "Loa" },
  },
  "dien-may": {
    tivi: { q: "Tivi", category: "Tivi" },
    "air-purifier": { q: "Máy lọc không khí" },
    fridge: { q: "Tủ lạnh" },
    "robot-vacuum": { q: "Robot hút bụi" },
    fan: { q: "Quạt" },
    "handheld-vacuum": { q: "Hút bụi cầm tay" },
    projector: { q: "Máy chiếu" },
    washer: { q: "Máy giặt" },
    dryer: { q: "Máy sấy" },
    aircon: { q: "Máy lạnh" },
    fryer: { q: "Nồi chiên" },
    "rice-cooker": { q: "Nồi cơm" },
  },
  "dien-thoai": {
    apple: { brand: "apple" },
    samsung: { brand: "samsung" },
    xiaomi: { brand: "xiaomi" },
    oppo: { brand: "oppo" },
    tecno: { brand: "tecno" },
    honor: { brand: "honor" },
    nubia: { brand: "nubia" },
  },
  tablet: {
    ipad: { brand: "apple", q: "iPad" },
    "tablet-samsung": { brand: "samsung" },
    "tablet-xiaomi": { brand: "xiaomi" },
    "tablet-huawei": { brand: "huawei" },
    "tablet-lenovo": { brand: "lenovo" },
  },
  laptop: {
    macbook: { brand: "apple", q: "MacBook" },
    asus: { brand: "asus" },
    lenovo: { brand: "lenovo" },
    msi: { brand: "msi" },
    acer: { brand: "acer" },
    hp: { brand: "hp" },
    dell: { brand: "dell" },
    gigabyte: { brand: "gigabyte" },
  },
  "man-hinh": {
    monitor: { q: "Màn hình" },
    pc: { q: "PC" },
  },
};

const categoryKeywordMap = {
  "phu-kien": [
    "phu kien",
    "sac",
    "cap",
    "op lung",
    "bao da",
    "camera",
    "chuot",
    "ban phim",
    "tai nghe",
  ],
  "dong-ho": [
    "dong ho",
    "am thanh",
    "tai nghe",
    "loa",
    "apple watch",
    "garmin",
    "soundpeats",
    "jbl",
  ],
  "dien-thoai": [
    "dien thoai",
    "iphone",
    "samsung",
    "xiaomi",
    "oppo",
    "honor",
    "realme",
  ],
  tablet: ["tablet", "may tinh bang", "ipad"],
  laptop: ["laptop", "macbook", "asus", "lenovo", "acer", "hp", "dell"],
  "man-hinh": ["man hinh", "pc", "may tinh", "gaming pc"],
  "dien-may": [
    "dien may",
    "gia dung",
    "tivi",
    "may hut bui",
    "tu lanh",
    "may giat",
    "noi chien",
  ],
  "hot-cool": ["may lanh", "tu lanh", "quat", "dieu hoa"],
  "hot-camera": [
    "camera",
    "may anh",
    "dji",
    "osmo",
    "gimbal",
    "flycam",
    "insta360",
    "canon eos",
    "sony zv",
  ],
  "hot-travel": [
    "du lich",
    "sac",
    "cap",
    "adapter",
    "pin du phong",
    "power bank",
    "hub",
    "tai nghe",
    "anker",
    "ugreen",
    "mophie",
  ],
  "hot-worldcup": ["world cup", "tivi", "tv", "loa"],
  "new-mobile-tablet": [
    "dien thoai",
    "iphone",
    "samsung",
    "xiaomi",
    "oppo",
    "tablet",
    "may tinh bang",
    "ipad",
  ],
  "new-office": [
    "laptop",
    "macbook",
    "man hinh",
    "pc",
    "may tinh",
    "ban phim",
    "chuot",
  ],
  "new-watch-audio": [
    "dong ho",
    "am thanh",
    "tai nghe",
    "loa",
    "apple watch",
    "airpods",
  ],
  "new-home-beauty": [
    "gia dung",
    "lam dep",
    "quat",
    "robot hut bui",
    "may loc khong khi",
    "noi chien",
  ],
  "new-appliance": ["dien may", "tivi", "tu lanh", "may giat", "may lanh"],
  "new-accessory": [
    "phu kien",
    "sac",
    "cap",
    "op lung",
    "bao da",
    "camera",
    "chuot",
    "ban phim",
  ],
};

const categoryFallbackProducts = {
  "phu-kien": hotTrendProducts,
  "dong-ho": [...watchProducts, ...audioProducts],
  "dien-thoai": phoneProducts,
  tablet: phoneProducts,
  laptop: laptopProducts,
  "man-hinh": laptopProducts,
  "dien-may": [...applianceProducts, ...tvProducts],
  "hot-cool": [...applianceProducts, ...tvProducts],
  "hot-camera": hotTrendProducts,
  "hot-travel": hotTrendProducts,
  "hot-worldcup": [...tvProducts, ...audioProducts],
  "new-mobile-tablet": phoneProducts,
  "new-office": laptopProducts,
  "new-watch-audio": [...watchProducts, ...audioProducts],
  "new-home-beauty": applianceProducts,
  "new-appliance": [...applianceProducts, ...tvProducts],
  "new-accessory": hotTrendProducts,
};

const subKeywordMap = {
  all: [],
  "cu-cap": [
    "cu sac",
    "cap sac",
    "adapter",
    "cap type c",
    "type c to",
    "lightning",
  ],
  chuot: ["chuot", "ban phim", "keyboard", "mouse"],
  sac: ["sac du phong", "pin du phong", "power bank"],
  camera: ["camera", "webcam", "ip 360", "dji", "gimbal", "flycam"],
  "apple-pk": [
    "apple",
    "airpods",
    "earpods",
    "magsafe",
    "airtag",
    "apple pencil",
    "apple watch",
    "lightning",
    "smart keyboard",
    "pin du phong",
  ],
  "tien-ich": ["tien ich", "quat", "den", "may loc", "massage"],
  "op-lung": ["op lung", "bao da", "case"],
  tivi: ["tivi", "tv"],
  "air-purifier": ["may loc khong khi", "loc khong khi", "air purifier"],
  fridge: ["tu lanh"],
  "robot-vacuum": ["robot hut bui"],
  fan: ["quat"],
  "handheld-vacuum": ["hut bui cam tay"],
  projector: ["may chieu"],
  washer: ["may giat"],
  dryer: ["may say"],
  aircon: ["may lanh", "dieu hoa"],
  fryer: ["noi chien"],
  "rice-cooker": ["noi com"],
  apple: ["apple", "iphone"],
  samsung: ["samsung"],
  xiaomi: ["xiaomi"],
  oppo: ["oppo"],
  tecno: ["tecno"],
  honor: ["honor"],
  nubia: ["nubia"],
  ipad: ["ipad"],
  "tablet-samsung": ["samsung", "galaxy tab"],
  "tablet-xiaomi": ["xiaomi", "poco pad"],
  "tablet-huawei": ["huawei", "matepad"],
  "tablet-lenovo": ["lenovo", "legion tab"],
  macbook: ["macbook"],
  asus: ["asus"],
  lenovo: ["lenovo"],
  msi: ["msi"],
  acer: ["acer"],
  hp: ["hp"],
  dell: ["dell"],
  gigabyte: ["gigabyte"],
  monitor: ["man hinh", "monitor"],
  pc: ["pc", "gaming pc", "may tinh de ban"],
  watch: ["dong ho", "watch", "apple watch", "galaxy watch", "garmin"],
  headphone: ["tai nghe", "headphone", "earbuds", "airpods"],
  speaker: ["loa", "speaker", "jbl"],
};

const excludedSubKeywordMap = {
  camera: [
    "op lung",
    "bao da",
    "case",
    "devilcase",
    "jinya",
    "tgv",
    "proclear",
    "vien camera",
  ],
};

const textOfProduct = (product = {}) =>
  normalizeText(
    [
      product.name,
      product.title,
      product.category,
      product.categoryName,
      product.brand,
      product.brandKey,
      product.segment,
      product.sku,
      product.slug,
    ]
      .filter(Boolean)
      .join(" "),
  );

const matchesKeywords = (product, keywords = []) => {
  if (!keywords.length) return true;
  const text = textOfProduct(product);
  return keywords.some((keyword) => text.includes(keyword));
};

const matchesSubFilter = (product, filterId) => {
  if (filterId === "all") return true;
  const text = textOfProduct(product);
  if (
    (excludedSubKeywordMap[filterId] || []).some((value) =>
      text.includes(value),
    )
  ) {
    return false;
  }
  if (
    filterId === "cu-cap" &&
    [
      "du phong",
      "power bank",
      "flash drive",
      "usb sandisk",
      "o cung",
      "the nho",
    ].some((value) => text.includes(value))
  ) {
    return false;
  }
  return matchesKeywords(product, subKeywordMap[filterId] || []);
};

const accessoryTypeRank = (product = {}, filterId = "all") => {
  if (filterId !== "apple-pk") return 0;
  const text = textOfProduct(product);
  if (/airpods|earpods|tai nghe/.test(text)) return 0;
  if (/apple watch|watch/.test(text)) return 1;
  if (/magsafe|sac|adapter|cap|lightning|usb c|usb-c|pin du phong/.test(text))
    return 2;
  if (/airtag|apple pencil|but cam ung/.test(text)) return 3;
  if (/op lung|bao da|case/.test(text)) return 6;
  return 4;
};

const hasSellablePrice = (product = {}) =>
  toNumber(product.currentPrice || product.price) > 0;

const isAvailableProduct = (product = {}) => {
  const status = normalizeText(
    product.statusLabel || product.availability?.status || product.availability,
  );
  return (
    hasSellablePrice(product) &&
    !["lien he", "het hang", "outofstock"].some((value) =>
      status.includes(value),
    )
  );
};

const toNumber = (value) => {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : 0;
};

const productScore = (product = {}, activeMainTab = "deal") => {
  if (activeMainTab === "deal") {
    return (
      toNumber(product.discount) * 100000000 +
      toNumber(product.originalPrice) -
      toNumber(product.currentPrice)
    );
  }
  if (activeMainTab === "new") {
    return (
      toNumber(product.isNew || product.newArrival) * 100000000 +
      toNumber(product.id)
    );
  }
  return (
    toNumber(product.rating) * 1000000 +
    toNumber(product.ratingCount) * 1000 +
    toNumber(product.discount)
  );
};

const buildHotTrendQuery = (activeMainTab, activeCategory, activeSubFilter) => {
  const base = {
    include: "details",
    displayLimit: 96,
    fetchLimit: 96,
    inStock: true,
    ...(mainTabConfig[activeMainTab] || mainTabConfig.deal),
    ...(categoryQueryMap[activeCategory] || categoryQueryMap["phu-kien"]),
  };
  const subQuery =
    (categorySubFilterQueryMap[activeCategory] || {})[activeSubFilter] || {};

  return {
    ...base,
    ...subQuery,
    q: subQuery.q || base.q,
  };
};

export default function HotTrend({
  products = hotTrendProducts,
  loading = false,
}) {
  const [activeMainTab, setActiveMainTab] = useState("deal");
  const [activeCategory, setActiveCategory] = useState("phu-kien");
  const [activeSubFilter, setActiveSubFilter] = useState("all");
  const productsRailRef = useRef(null);
  const [productScrollState, setProductScrollState] = useState({
    canScrollBack: false,
    canScrollForward: false,
  });
  const activeCategoryFilters =
    categoryFiltersByMainTab[activeMainTab] || categoryFiltersByMainTab.deal;
  const activeSubFilters = hotTrendSubFiltersByCategory[activeCategory] || [
    commonAllFilter,
  ];
  const isSubFilterScrollable = activeSubFilters.length > 8;
  const query = useMemo(
    () => buildHotTrendQuery(activeMainTab, activeCategory, activeSubFilter),
    [activeMainTab, activeCategory, activeSubFilter],
  );
  const fallbackProducts = useMemo(() => {
    const propProducts =
      Array.isArray(products) && products.length ? products : [];
    const categoryProducts =
      categoryFallbackProducts[activeCategory] || hotTrendProducts;
    const seen = new Set();
    const source = [...propProducts, ...categoryProducts].filter((product) => {
      const key = product?.id || product?.slug || product?.sku || product?.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const categoryKeywords = categoryKeywordMap[activeCategory] || [];
    const filtered = source
      .filter((product) => matchesKeywords(product, categoryKeywords))
      .filter((product) => matchesSubFilter(product, activeSubFilter))
      .sort(
        (a, b) =>
          productScore(b, activeMainTab) - productScore(a, activeMainTab),
      );

    return filtered.length ? filtered : categoryProducts;
  }, [activeCategory, activeMainTab, activeSubFilter, products]);
  const trendProducts = useApiProducts(query, fallbackProducts);
  const displayProducts = useMemo(() => {
    const categoryKeywords = categoryKeywordMap[activeCategory] || [];
    const seen = new Set();
    const source = [
      ...(trendProducts.products || []),
      ...fallbackProducts,
    ].filter((product) => {
      const key = product?.id || product?.slug || product?.sku || product?.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return source
      .filter(isAvailableProduct)
      .filter((product) => matchesKeywords(product, categoryKeywords))
      .filter((product) => matchesSubFilter(product, activeSubFilter))
      .sort(
        (a, b) =>
          accessoryTypeRank(a, activeSubFilter) -
            accessoryTypeRank(b, activeSubFilter) ||
          productScore(b, activeMainTab) - productScore(a, activeMainTab),
      );
  }, [
    activeCategory,
    activeMainTab,
    activeSubFilter,
    fallbackProducts,
    trendProducts.products,
  ]);
  const isLoading = loading || trendProducts.loading;
  const updateProductScrollState = () => {
    const rail = productsRailRef.current;
    if (!rail) return;
    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setProductScrollState({
      canScrollBack: rail.scrollLeft > 4,
      canScrollForward: rail.scrollLeft < maxScrollLeft - 4,
    });
  };

  useEffect(() => {
    const rail = productsRailRef.current;
    if (!rail) return undefined;

    const frameId = window.requestAnimationFrame(updateProductScrollState);
    rail.addEventListener("scroll", updateProductScrollState, {
      passive: true,
    });
    window.addEventListener("resize", updateProductScrollState);

    return () => {
      window.cancelAnimationFrame(frameId);
      rail.removeEventListener("scroll", updateProductScrollState);
      window.removeEventListener("resize", updateProductScrollState);
    };
  }, [displayProducts.length, isLoading]);

  const resetSubFilter = () => setActiveSubFilter("all");
  const selectMainTab = (tabId) => {
    setActiveMainTab(tabId);
    setActiveCategory(defaultCategoryByMainTab[tabId] || "phu-kien");
    resetSubFilter();
  };
  const scrollSubFilters = () => {
    document
      .querySelector(".hot-trend-sub-filters")
      ?.scrollBy({ left: 180, behavior: "smooth" });
  };
  const scrollProducts = (direction) => {
    const rail = productsRailRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * Math.max(240, rail.clientWidth * 0.82),
      behavior: "smooth",
    });
  };

  return (
    <section className="hot-trend section-gap" id="hot-trend-section">
      <div className="container">
        <div className="hot-trend-wrapper">
          {/* Top Banner & Tabs */}
          <div className="hot-trend-header">
            <div className="hot-trend-tabs-wrapper">
              <div className="hot-trend-tabs">
                <button
                  className={`hot-trend-tab-btn ${activeMainTab === "deal" ? "active" : ""}`}
                  onClick={() => selectMainTab("deal")}
                  aria-pressed={activeMainTab === "deal"}
                >
                  <img
                    src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/hotDueHome03.png"
                    alt="Deal sốc mỗi ngày"
                  />
                </button>
                <button
                  className={`hot-trend-tab-btn ${activeMainTab === "hot" ? "active" : ""}`}
                  onClick={() => selectMainTab("hot")}
                  aria-pressed={activeMainTab === "hot"}
                >
                  <img
                    src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/hotTrendHome02.png"
                    alt="Sản phẩm hot trend"
                  />
                </button>
                <button
                  className={`hot-trend-tab-btn ${activeMainTab === "new" ? "active" : ""}`}
                  onClick={() => selectMainTab("new")}
                  aria-pressed={activeMainTab === "new"}
                >
                  <img
                    src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/landing-page/hang-moi-ve/newArrivalHome.png"
                    alt="Hàng mới về"
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="hot-trend-content">
            {/* Category Filters */}
            <div className="hot-trend-category-filters">
              {activeCategoryFilters.map((filter) => (
                <button
                  key={filter.id}
                  className={`ht-cat-filter ${filter.icon ? "has-icon" : ""} ${activeCategory === filter.id ? "active" : ""}`}
                  onClick={() => {
                    setActiveCategory(filter.id);
                    resetSubFilter();
                  }}
                  aria-pressed={activeCategory === filter.id}
                >
                  {filter.icon && (
                    <img
                      className="ht-cat-filter-icon"
                      src={filter.icon}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  {filter.name}
                </button>
              ))}
            </div>

            {/* Sub Filters (Icons) */}
            {activeSubFilters.length > 1 && (
              <div className="hot-trend-sub-filters-container">
                <div
                  className={`hot-trend-sub-filters ${isSubFilterScrollable ? "is-scrollable" : ""}`}
                >
                  {activeSubFilters.map((filter) => (
                    <button
                      key={filter.id}
                      className={`ht-sub-filter ${filter.variant ? `${filter.variant}-filter` : ""} ${activeSubFilter === filter.id ? "active" : ""}`}
                      onClick={() => setActiveSubFilter(filter.id)}
                      aria-pressed={activeSubFilter === filter.id}
                      title={filter.name}
                    >
                      {filter.icon && (
                        <img
                          className={`ht-sub-filter-icon ${filter.variant === "brand" ? "brand-logo" : "product-icon"}`}
                          src={filter.icon}
                          alt={filter.name}
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                      {filter.variant !== "brand" && <span>{filter.name}</span>}
                    </button>
                  ))}
                </div>
                {isSubFilterScrollable && (
                  <button
                    className="ht-sub-filter-next"
                    type="button"
                    aria-label="Xem thêm bộ lọc"
                    onClick={scrollSubFilters}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Products */}
            <div className="hot-trend-products-container">
              {!isLoading && productScrollState.canScrollBack && (
                <button
                  className="ht-product-nav ht-product-nav-prev"
                  type="button"
                  aria-label="Xem các sản phẩm trước"
                  onClick={() => scrollProducts(-1)}
                >
                  <span aria-hidden="true">‹</span>
                </button>
              )}

              <div
                ref={productsRailRef}
                className="hot-trend-products"
                aria-busy={isLoading}
              >
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={`hot-trend-skeleton-${index}`}
                      className="ht-product-wrapper"
                    >
                      <ProductCardSkeleton />
                    </div>
                  ))
                ) : displayProducts.length ? (
                  displayProducts.map((product) => (
                    <div
                      key={product.id || product.slug || product.name}
                      className="ht-product-wrapper"
                    >
                      <ProductCard product={product} />
                    </div>
                  ))
                ) : (
                  <div className="hot-trend-empty">
                    Chưa có sản phẩm phù hợp với bộ lọc này.
                  </div>
                )}
              </div>

              {!isLoading && productScrollState.canScrollForward && (
                <button
                  className="ht-product-nav ht-product-nav-next"
                  type="button"
                  aria-label="Xem thêm sản phẩm"
                  onClick={() => scrollProducts(1)}
                >
                  <span aria-hidden="true">›</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
