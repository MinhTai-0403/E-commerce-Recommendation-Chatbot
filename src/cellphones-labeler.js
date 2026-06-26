const { repairMojibake } = require("./text-utils");

const LABEL_SCHEMA_VERSION = 2;
const LABEL_SOURCE = "cellphones-breadcrumb-labeler-v2";
const HOME_LABEL = "Trang ch\u1ee7";
const VI = {
  phone: "\u0110i\u1ec7n tho\u1ea1i",
  tablet: "M\u00e1y t\u00ednh b\u1ea3ng",
  audio: "\u00c2m thanh",
  smartwatch: "\u0110\u1ed3ng h\u1ed3 th\u00f4ng minh",
  other: "Kh\u00e1c",
};

const BRAND_FIXES = new Map([
  ["apple chinh hang", "Apple"],
  ["samsung chinh hang", "Samsung"],
  ["hang khac", null],
  ["bear", "Bear"],
  ["asus", "ASUS"],
  ["hp", "HP"],
  ["lg", "LG"],
  ["msi", "MSI"],
  ["oppo", "OPPO"],
  ["uag", "UAG"],
  ["jbl", "JBL"],
]);

const BRAND_ALIASES = [
  ["Apple", ["apple", "iphone", "ipad", "macbook", "airpods", "apple watch"]],
  ["Samsung", ["samsung", "galaxy"]],
  ["Xiaomi", ["xiaomi", "redmi", "poco"]],
  ["OPPO", ["oppo", "reno", "find x"]],
  ["vivo", ["vivo"]],
  ["realme", ["realme"]],
  ["Sony", ["sony", "xperia"]],
  ["Nokia", ["nokia", "lumia"]],
  ["ASUS", ["asus", "rog phone", "zenfone", "vivobook", "zenbook"]],
  ["Lenovo", ["lenovo", "thinkpad", "ideapad", "legion"]],
  ["Dell", ["dell", "inspiron", "xps", "latitude", "alienware"]],
  ["HP", ["hp", "pavilion", "elitebook", "probook", "omen"]],
  ["Acer", ["acer", "aspire", "predator", "nitro"]],
  ["MSI", ["msi"]],
  ["LG", ["lg", "gram"]],
  ["Huawei", ["huawei", "matebook", "mate", "nova"]],
  ["Google", ["google", "pixel", "nexus"]],
  ["Microsoft", ["microsoft", "surface"]],
  ["Motorola", ["motorola", "moto"]],
  ["Bear", ["bear"]],
  ["JBL", ["jbl"]],
  ["Anker", ["anker", "soundcore"]],
  ["Baseus", ["baseus"]],
  ["Ugreen", ["ugreen"]],
  ["Logitech", ["logitech"]],
  ["Canon", ["canon"]],
  ["Nikon", ["nikon"]],
  ["Garmin", ["garmin"]],
  ["Philips", ["philips"]],
  ["Panasonic", ["panasonic"]],
  ["TP-Link", ["tp link", "tp-link", "tplink"]],
  ["Spigen", ["spigen"]],
  ["UAG", ["uag"]],
];

function buildTrainingLabels(product) {
  const cleaned = cleanProduct(product);
  let labelPath = buildBreadcrumbPath(cleaned);
  let categoryPath = labelPath.slice(1, -1);
  const productName = labelPath[labelPath.length - 1] || cleaned.name || cleaned.slug;
  const brand = normalizeBrand(cleaned.brand) || detectBrand(cleaned.name);
  const modelCode = detectModelCode(cleaned.name);
  const deviceLine = detectDeviceLine(cleaned, brand, modelCode);
  const deviceBrand = detectDeviceBrand(deviceLine, brand);

  if (categoryPath.length === 0) {
    categoryPath = inferCategoryPath(cleaned, deviceBrand, deviceLine);
    if (categoryPath.length) {
      labelPath = [HOME_LABEL, ...categoryPath, productName].filter(Boolean);
    }
  }

  const categoryLevels = Object.fromEntries(
    categoryPath.map((value, index) => [`categoryLevel${index + 1}`, value])
  );
  const deviceType = categoryPath[categoryPath.length - 1] || inferDeviceType(cleaned, deviceLine);
  const deviceGroup = categoryPath[1] || categoryPath[0] || deviceType;
  const section = categoryPath[0] || null;

  return {
    schemaVersion: LABEL_SCHEMA_VERSION,
    labelPathText: labelPath.join(" - "),
    categoryPathText: categoryPath.join(" - "),
    ...categoryLevels,
    section,
    deviceGroup,
    deviceType,
    productName,
    brand,
    deviceBrand,
    deviceLine,
    modelLine: deviceLine,
    modelCode,
    confidence: confidenceScore({ labelPath, categoryPath, deviceLine }),
  };
}

function cleanProduct(product) {
  const breadcrumbs = Array.isArray(product.breadcrumbs) ? product.breadcrumbs : [];

  return {
    name: cleanText(product.name),
    brand: cleanText(product.brand),
    sku: cleanText(product.sku),
    slug: cleanText(product.slug || slugFromUrl(product.url)),
    url: cleanText(product.url),
    price: Number(product.price || 0),
    categories: (product.categories || []).map(cleanText).filter(Boolean),
    breadcrumbs: breadcrumbs
      .map((item) => ({
        name: cleanText(item && item.name),
        url: cleanText(item && item.url),
        position: item && item.position,
      }))
      .filter((item) => item.name),
  };
}

function buildBreadcrumbPath(product) {
  let names = product.breadcrumbs.map((item) => item.name).filter(Boolean);

  if (names.length === 0) {
    names = [HOME_LABEL, ...product.categories, product.name].filter(Boolean);
  }

  names = names.map(normalizeHomeLabel);

  if (names[0] !== HOME_LABEL) names.unshift(HOME_LABEL);

  if (product.name && !sameText(names[names.length - 1], product.name)) {
    names.push(product.name);
  }

  return uniqueAdjacent(names).filter(Boolean);
}

function normalizeHomeLabel(value) {
  const normalized = normalizeAscii(value);
  if (
    normalized === "cellphones" ||
    normalized === "cellphone s" ||
    normalized === "trang chu" ||
    normalized === "home"
  ) {
    return HOME_LABEL;
  }

  return value;
}

function normalizeBrand(value) {
  const raw = cleanText(value);
  if (!raw) return null;

  const normalized = normalizeAscii(raw)
    .replace(/\b(chinh hang|official|viet nam|vn)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (BRAND_FIXES.has(normalized)) return BRAND_FIXES.get(normalized);

  for (const [brand, aliases] of BRAND_ALIASES) {
    if (aliases.some((alias) => normalized === alias || normalized.startsWith(`${alias} `))) {
      return brand;
    }
  }

  return titleBrand(raw);
}

function detectBrand(text) {
  const normalized = normalizeAscii(text);

  for (const [brand, aliases] of BRAND_ALIASES) {
    if (aliases.some((alias) => hasTerm(normalized, alias))) return brand;
  }

  return null;
}

function detectDeviceLine(product, brand, modelCode) {
  const text = normalizeAscii([product.name, product.sku, product.slug].filter(Boolean).join(" "));

  const phone = detectPhoneLine(text);
  if (phone) return phone;

  const apple = detectAppleLine(text);
  if (apple) return apple;

  const laptop = detectLaptopLine(text);
  if (laptop) return laptop;

  if (brand && modelCode) return `${brand} ${modelCode}`;

  const brandCode = product.name.match(/\b([A-Z][A-Za-z0-9]+)\s+([A-Z]{1,6}[- ]?\d[A-Z0-9-]{2,})\b/);
  if (brandCode) return `${titleBrand(brandCode[1])} ${brandCode[2].replace(/\s+/g, "-")}`;

  if (modelCode) return modelCode;

  return product.name || null;
}

function detectPhoneLine(text) {
  const iphone = text.match(/\biphone\s+(se(?:\s*\d{4})?|xs\s*max|xs|xr|x|\d{1,2}\s*(?:pro\s*max|pro|plus|mini|air|max|s|c|e)?)\b/);
  if (iphone) return `iPhone ${titleModel(iphone[1]).replace(/^Se\b/, "SE")}`;

  const galaxy = text.match(
    /\b(?:samsung\s+)?galaxy\s+(z\s*fold\s*\d+\w*|z\s*flip\s*\d+\w*|s\d{1,2}\w*(?:\s*(?:ultra|plus|\+|fe|5g))?|a\d{2}\w*(?:\s*5g)?|m\d{2}\w*(?:\s*5g)?|note\s*\d{1,2}\w*(?:\s*(?:ultra|plus))?)\b/
  );
  if (galaxy) return `Samsung Galaxy ${titleModel(galaxy[1]).replace(/\s\+/g, " Plus")}`;

  const redmi = text.match(/\b(redmi\s+note\s+\d{1,2}\w*(?:\s*(?:pro\s*plus|pro|5g))?|redmi\s+\d{1,2}\w*(?:\s*(?:pro|5g))?)\b/);
  if (redmi) return titleModel(redmi[1]).replace(/^Redmi/, "Redmi");

  const poco = text.match(/\b(poco\s+[a-z]\d{1,2}\w*(?:\s*(?:pro|5g))?)\b/);
  if (poco) return titleModel(poco[1]).replace(/^Poco/, "POCO");

  const xiaomi = text.match(/\b(xiaomi\s+\d{1,2}\w*(?:\s*(?:t\s*pro|t|ultra|pro|5g))?|mi\s+(?:mix|note|max|a)?\s*\d+\w*(?:\s*(?:pro|5g))?)\b/);
  if (xiaomi) return titleModel(xiaomi[1]).replace(/^Mi\b/, "Mi").replace(/^Xiaomi/, "Xiaomi");

  const oppo = text.match(/\b(oppo\s+(?:reno\s*\d{1,2}\w*(?:\s*(?:f|pro|5g))?|find\s*x\d{1,2}\w*(?:\s*(?:pro|5g))?|[af]\d{1,3}\w*(?:\s*5g)?|n\d\w*))\b/);
  if (oppo) return titleModel(oppo[1]).replace(/^Oppo/, "OPPO");

  const vivo = text.match(/\b(vivo\s+[vxyts]\d{1,3}\w*(?:\s*5g)?)\b/);
  if (vivo) return titleModel(vivo[1]);

  const realme = text.match(/\b(realme\s+(?:gt\s*)?\d{1,2}\w*(?:\s*(?:pro|plus|5g))?|realme\s+c\d{1,2}\w*)\b/);
  if (realme) return titleModel(realme[1]);

  const sony = text.match(/\b(xperia\s+[a-z0-9]+\w*(?:\s*(?:pro|plus|ultra|iii|iv|v))?)\b/);
  if (sony) return `Sony ${titleModel(sony[1]).replace(/^Xperia/, "Xperia")}`;

  const asus = text.match(/\b(rog\s+phone\s+\d+\w*(?:\s*(?:pro|ultimate))?|zenfone\s+\d+\w*)\b/);
  if (asus) return `ASUS ${titleModel(asus[1]).replace(/^Rog/, "ROG")}`;

  const nokia = text.match(/\b(nokia\s+[a-z0-9.]+\w*|lumia\s+\d+\w*)\b/);
  if (nokia) return titleModel(nokia[1]).replace(/^Lumia/, "Nokia Lumia");

  const pixel = text.match(/\b(pixel\s+\d+\w*(?:\s*(?:pro|a))?)\b/);
  if (pixel) return `Google ${titleModel(pixel[1])}`;

  return null;
}

function detectAppleLine(text) {
  const ipad = text.match(/\bipad\s+(pro|air|mini)?\s*(\d{1,2}(?:\s*th)?|m\d|gen\s*\d+)?/);
  if (ipad) return titleModel(`iPad ${ipad[1] || ""} ${ipad[2] || ""}`).replace(/^Ipad/, "iPad").trim();

  const macbook = text.match(/\bmacbook\s+(air|pro)?\s*(m\d)?/);
  if (macbook) return titleModel(`MacBook ${macbook[1] || ""} ${macbook[2] || ""}`).replace(/^Macbook/, "MacBook").trim();

  const airpods = text.match(/\bairpods\s*(pro|max)?\s*(\d{4}|\d)?/);
  if (airpods) return titleModel(`AirPods ${airpods[1] || ""} ${airpods[2] || ""}`).replace(/^Airpods/, "AirPods").trim();

  const watch = text.match(/\bapple\s+watch\s+(ultra|series|se)?\b\s*(\d{1,2})?/);
  if (watch) return titleModel(`Apple Watch ${watch[1] || "Series"} ${watch[2] || ""}`).trim();

  return null;
}

function detectLaptopLine(text) {
  const patterns = [
    /\b(thinkpad\s+[a-z0-9-]+)\b/,
    /\b(ideapad\s+[a-z0-9-]+)\b/,
    /\b(legion\s+[a-z0-9-]+)\b/,
    /\b(vivobook\s+[a-z0-9-]+)\b/,
    /\b(zenbook\s+[a-z0-9-]+)\b/,
    /\b(inspiron\s+[a-z0-9-]+)\b/,
    /\b(latitude\s+[a-z0-9-]+)\b/,
    /\b(xps\s+\d{2,4})\b/,
    /\b(pavilion\s+[a-z0-9-]+)\b/,
    /\b(elitebook\s+[a-z0-9-]+)\b/,
    /\b(swift\s+[a-z0-9-]+)\b/,
    /\b(nitro\s+[a-z0-9-]+)\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return titleModel(match[1]);
  }

  return null;
}

function detectModelCode(name) {
  const raw = cleanText(name);
  const matches = raw.match(/\b[A-Z]{1,6}[- ]?\d[A-Z0-9-]{2,}\b/g);
  if (!matches || !matches.length) return null;
  return matches[matches.length - 1].replace(/\s+/g, "-");
}

function inferDeviceType(product, deviceLine) {
  const text = normalizeAscii([product.name, deviceLine, ...product.categories].filter(Boolean).join(" "));
  if (hasTerm(text, "iphone") || hasTerm(text, "galaxy") || hasTerm(text, "dien thoai")) return VI.phone;
  if (hasTerm(text, "macbook") || hasTerm(text, "laptop")) return "Laptop";
  if (hasTerm(text, "ipad") || hasTerm(text, "tablet")) return VI.tablet;
  if (hasTerm(text, "airpods") || hasTerm(text, "tai nghe")) return "Tai nghe";
  return product.categories[product.categories.length - 1] || null;
}

function inferCategoryPath(product, deviceBrand, deviceLine) {
  const text = normalizeAscii([product.name, deviceLine, ...product.categories].filter(Boolean).join(" "));
  const path = [];

  if (hasTerm(text, "iphone") || hasTerm(text, "galaxy") || hasTerm(text, "dien thoai") || detectPhoneLine(text)) {
    path.push(VI.phone);
  } else if (hasTerm(text, "ipad") || hasTerm(text, "tablet")) {
    path.push(VI.tablet);
  } else if (hasTerm(text, "airpods") || hasTerm(text, "tai nghe") || hasTerm(text, "loa")) {
    path.push(VI.audio);
  } else if (hasTerm(text, "apple watch") || hasTerm(text, "galaxy watch") || hasTerm(text, "dong ho")) {
    path.push(VI.smartwatch);
  } else if (hasTerm(text, "macbook") || hasTerm(text, "laptop")) {
    path.push("Laptop");
  } else {
    path.push(...product.categories);
  }

  if (deviceBrand && !path.some((item) => sameText(item, deviceBrand))) path.push(deviceBrand);
  if (deviceLine && !path.some((item) => sameText(item, deviceLine))) path.push(deviceLine);

  return unique(path);
}

function detectDeviceBrand(deviceLine, fallbackBrand) {
  if (!deviceLine) return fallbackBrand || null;
  const brand = detectBrand(deviceLine);
  return brand || fallbackBrand || null;
}

function buildTags(values) {
  return unique(
    [
      ...values.labelPath,
      ...values.categoryPath,
      values.section,
      values.deviceGroup,
      values.deviceType,
      values.productName,
      values.brand,
      values.deviceBrand,
      values.deviceLine,
      values.modelCode,
      values.sku,
    ]
      .filter(Boolean)
      .flatMap((value) => [value, slugify(value)])
  );
}

function confidenceScore({ labelPath, categoryPath, deviceLine }) {
  let score = 0.55;
  if (labelPath.length >= 3) score += 0.25;
  if (categoryPath.length >= 2) score += 0.1;
  if (deviceLine) score += 0.08;
  return Math.min(0.99, Number(score.toFixed(2)));
}

function evidenceFor(product, labelPath, deviceLine) {
  return [
    labelPath.length ? "breadcrumbs" : null,
    product.categories.length ? "categories" : null,
    product.name ? "name" : null,
    product.brand ? "brand" : null,
    product.sku ? "sku" : null,
    deviceLine ? "device_line_rule" : null,
  ].filter(Boolean);
}

function priceTier(price) {
  if (!price || price <= 0) return "unknown";
  if (price < 2000000) return "duoi_2_trieu";
  if (price < 5000000) return "2_5_trieu";
  if (price < 10000000) return "5_10_trieu";
  if (price < 20000000) return "10_20_trieu";
  if (price < 30000000) return "20_30_trieu";
  return "tren_30_trieu";
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(repairMojibake(String(value))).trim();
}

function normalizeAscii(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[|_/.,()\\[\]{}:+]+/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameText(left, right) {
  return normalizeAscii(left) === normalizeAscii(right);
}

function hasTerm(text, term) {
  const escaped = escapeRegex(normalizeAscii(term)).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i").test(text);
}

function titleBrand(value) {
  const raw = cleanText(value);
  const normalized = normalizeAscii(raw);
  if (BRAND_FIXES.has(normalized)) return BRAND_FIXES.get(normalized);
  if (/^[A-Z0-9-]{2,}$/.test(raw)) {
    if (["ASUS", "MSI", "JBL", "UAG", "LG", "HP"].includes(raw)) return raw;
    return raw.charAt(0) + raw.slice(1).toLowerCase();
  }
  return titleModel(raw);
}

function titleModel(value) {
  return cleanText(value)
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((part) => {
      if (/^(gb|tb|ram|ssd|hdd|wifi|lte|5g|4g|se|fe|gps|nfc)$/i.test(part)) return part.toUpperCase();
      if (/^[a-z]{1,3}\d*$/i.test(part) && !/^(pro|max|air)$/i.test(part)) return part.toUpperCase();
      if (/^\d/.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ")
    .replace(/\bIphone\b/g, "iPhone")
    .replace(/\bIpad\b/g, "iPad")
    .replace(/\bMacbook\b/g, "MacBook")
    .replace(/\bAirpods\b/g, "AirPods");
}

function slugFromUrl(url) {
  try {
    return new URL(url).pathname.split("/").pop().replace(/\.html$/, "");
  } catch {
    return null;
  }
}

function slugify(value) {
  return normalizeAscii(value).replace(/\s+/g, "-");
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function uniqueAdjacent(values) {
  const output = [];
  for (const value of values) {
    if (!value) continue;
    if (output.length && sameText(output[output.length - 1], value)) continue;
    output.push(value);
  }
  return output;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  buildTrainingLabels,
  LABEL_SCHEMA_VERSION,
  LABEL_SOURCE,
};
