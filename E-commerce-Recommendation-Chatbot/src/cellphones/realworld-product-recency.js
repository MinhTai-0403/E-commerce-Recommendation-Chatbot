function foldVietnamese(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function getSlugFromUrl(url = "") {
  const match = String(url || "").match(/\/([^/?#]+?)(?:\.html)?(?:[?#].*)?$/i);
  return match ? match[1].replace(/\.html$/i, "") : "";
}

function normalizeCellphonesUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw, "https://cellphones.com.vn");
    if (!/cellphones\.com\.vn$/i.test(parsed.hostname)) return "";
    parsed.protocol = "https:";
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function productText(product = {}) {
  return foldVietnamese([
    product.name,
    product.productName,
    product.title,
    product.slug,
    product.sku,
    product.brand,
    product.brandKey,
    product.category,
    product.statusLabel,
    ...(Array.isArray(product.categories) ? product.categories : []),
    ...(Array.isArray(product.categoryTrail)
      ? product.categoryTrail.map((item) => item?.name || item?.label || item)
      : []),
  ].filter(Boolean).join(" "));
}

function availabilityText(product = {}) {
  return foldVietnamese([
    typeof product.availability === "string" ? product.availability : "",
    product.availability?.status,
    product.availability?.raw,
    product.statusLabel,
    product.storageStatus,
    product.itemCondition,
  ].filter(Boolean).join(" "));
}

function parseDateValue(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function latestProductDate(product = {}) {
  return Math.max(
    parseDateValue(product.releaseDate),
    parseDateValue(product.publishedAt),
    parseDateValue(product.sourceCapturedAt),
    parseDateValue(product.updatedAt),
    parseDateValue(product.createdAt),
    parseDateValue(product.scrapedAt),
    parseDateValue(product.sitemap?.lastmod)
  );
}

function isOutOfStock(product = {}) {
  return /outofstock|out_of_stock|het hang|tam het|ngung\s*(kinh\s*doanh|ban)|khong co hang/.test(
    availabilityText(product)
  );
}

function isUsedOrOld(text = "") {
  return /(^|\s|-)cu(\s|-|$)|hang cu|old|like new|\b99%\b|\b95%\b|tray|xuoc|da kich hoat|thu cu|doi moi/.test(text);
}

function categoryPriority(text = "") {
  if (/op lung|\bop\b|dan|cap |sac |usb|the nho|balo|tui|\bsim\b|phu kien/.test(text)) return 250;
  if (/iphone|samsung galaxy|xiaomi|oppo|vivo|realme|honor|redmi|poco|oneplus|nubia|rog phone|dien thoai/.test(text)) return 900;
  if (/macbook|laptop|thinkpad|ideapad|legion|rog|tuf|vivobook|zenbook|msi|acer|dell|hp|lenovo/.test(text)) return 850;
  if (/ipad|tablet|galaxy tab|may tinh bang/.test(text)) return 820;
  if (/apple watch|galaxy watch|watch|dong ho/.test(text)) return 760;
  if (/tivi|\btv\b|oled|qled|mini led|smart tv/.test(text)) return 700;
  if (/robot|may hut bui|noi chien|gia dung|do gia dung/.test(text)) return 640;
  if (/camera|dji|gopro|insta360|may anh/.test(text)) return 620;
  if (/tai nghe|loa|am thanh|marshall|sony|jbl|airpods/.test(text)) return 560;
  if (/man hinh|monitor/.test(text)) return 520;
  return 400;
}

function bestCandidate(candidates = []) {
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.weight - a.weight) || (b.year - a.year));
  return candidates[0].year;
}

function inferRealWorldYear(text = "") {
  const candidates = [];
  const add = (year, weight = 1) => {
    if (year >= 2010 && year <= 2027) candidates.push({ year, weight });
  };

  for (const match of text.matchAll(/\b(20[1-2][0-9])\b/g)) add(Number(match[1]), 3);

  const iphone = text.match(/iphone\s*(\d{1,2})/);
  if (iphone) {
    const n = Number(iphone[1]);
    const map = { 18: 2026, 17: 2025, 16: 2024, 15: 2023, 14: 2022, 13: 2021, 12: 2020, 11: 2019, 10: 2017, 8: 2017, 7: 2016, 6: 2015 };
    if (map[n]) add(map[n], 9);
  }
  if (/iphone\s*(x|xs|xr)/.test(text)) add(2018, 6);

  const galaxyS = text.match(/(?:galaxy\s*)?s(\d{2})(?:\s|\+|\b|ultra|plus)/);
  if (galaxyS) {
    const n = Number(galaxyS[1]);
    if (n >= 20 && n <= 27) add(2000 + n, 9);
    if (n >= 8 && n <= 10) add(2010 + n, 5);
  }

  const galaxyA = text.match(/(?:galaxy\s*)?a(\d{2})(?:\s|\+|\b)/);
  if (galaxyA) {
    const n = Number(galaxyA[1]);
    const generation = Math.floor(n / 10);
    const map = { 7: 2026, 6: 2025, 5: 2024, 4: 2023, 3: 2022, 2: 2021, 1: 2020 };
    if (map[generation]) add(map[generation], 5);
  }

  const foldFlip = text.match(/(?:z\s*)?(fold|flip)\s*(\d)/);
  if (foldFlip) add(2018 + Number(foldFlip[2]), 8);

  const macM = text.match(/\bm\s*([1-9])\b|\bm([1-9])\b/);
  if (macM && /macbook|ipad|imac|mac mini|mac studio|apple/.test(text)) {
    const n = Number(macM[1] || macM[2]);
    const map = { 1: 2020, 2: 2022, 3: 2023, 4: 2024, 5: 2025, 6: 2026 };
    if (map[n]) add(map[n], 8);
  }

  const xiaomi = text.match(/(?:xiaomi|redmi note|redmi|poco)\s*(\d{1,2})/);
  if (xiaomi) {
    const n = Number(xiaomi[1]);
    const map = { 17: 2025, 16: 2025, 15: 2024, 14: 2023, 13: 2022, 12: 2021, 11: 2020, 10: 2019, 9: 2018 };
    if (map[n]) add(map[n], 5);
  }

  const oppoFind = text.match(/find\s*x\s*(\d{1,2})/);
  if (oppoFind) {
    const n = Number(oppoFind[1]);
    const map = { 9: 2025, 8: 2024, 7: 2023, 6: 2022, 5: 2021, 3: 2020, 2: 2019 };
    if (map[n]) add(map[n], 5);
  }

  const reno = text.match(/reno\s*(\d{1,2})/);
  if (reno) {
    const n = Number(reno[1]);
    const map = { 15: 2026, 14: 2025, 13: 2025, 12: 2024, 11: 2023, 10: 2023, 9: 2022, 8: 2022, 7: 2021, 6: 2021, 5: 2020 };
    if (map[n]) add(map[n], 5);
  }

  const vivoX = text.match(/vivo\s*x\s*(\d{2,3})/);
  if (vivoX) {
    const n = Number(vivoX[1]);
    if (n >= 200) add(2024 + Math.floor((n - 200) / 100), 5);
    else if (n >= 90) add(2023, 5);
    else if (n >= 80) add(2022, 5);
  }

  const cpuText = text.match(/(?:intel\s*)?(?:core\s*)?(?:ultra\s*)?(\d{3,5}[a-z]{0,3})|ryzen\s*(\d)\s*(\d{3,4})/i)?.[0] || "";
  if (cpuText && /laptop|pc|desktop|main|cpu|chip|processor|intel|ryzen/.test(text)) {
    if (/ultra\s*[2579]\s*2\d{2}/.test(cpuText)) add(2024, 2);
    if (/ultra\s*[2579]\s*3\d{2}/.test(cpuText)) add(2025, 2);
    if (/13\d{3}|i[3579]-13/.test(cpuText)) add(2023, 2);
    if (/14\d{3}|i[3579]-14/.test(cpuText)) add(2024, 2);
    if (/15\d{3}|i[3579]-15/.test(cpuText)) add(2025, 2);
    if (/ryzen\s*[3579]\s*7\d{3}/.test(cpuText)) add(2023, 2);
    if (/ryzen\s*[3579]\s*8\d{3}/.test(cpuText)) add(2024, 2);
    if (/ryzen\s*[3579]\s*9\d{3}/.test(cpuText)) add(2025, 2);
  }

  return bestCandidate(candidates);
}

function buildRealWorldRecency(product = {}) {
  const text = productText(product);
  const realWorldYear = inferRealWorldYear(text);
  const price = Number(product.currentPrice || product.price || 0) || 0;
  const fallbackDate = latestProductDate(product);
  const fallbackYear = fallbackDate ? new Date(fallbackDate).getUTCFullYear() : 2020;
  const effectiveYear = realWorldYear || Math.min(2024, Math.max(2020, fallbackYear - 1));
  const hasImage = Boolean(
    product.primaryImage ||
      product.thumbnail ||
      product.image ||
      (Array.isArray(product.images) && product.images.length)
  );
  const reasons = [];
  let score = effectiveYear * 1_000_000;

  if (realWorldYear) reasons.push(`model-year:${realWorldYear}`);
  else reasons.push(`fallback-year:${effectiveYear}`);

  const categoryScore = categoryPriority(text);
  score += categoryScore * 100;
  reasons.push(`category:${categoryScore}`);

  if (price > 0) {
    score += 7_500;
    reasons.push("has-price");
  }
  if (hasImage) {
    score += 3_000;
    reasons.push("has-image");
  }
  if (/con hang|instock/.test(availabilityText(product))) {
    score += 10_000;
    reasons.push("in-stock");
  }
  if (/lien he|contact/.test(availabilityText(product))) {
    score -= 4_000;
    reasons.push("contact-price");
  }
  if (isUsedOrOld(text)) {
    score -= 250_000;
    reasons.push("used-or-old");
  }
  if (isOutOfStock(product)) {
    score -= 1_000_000;
    reasons.push("out-of-stock");
  }

  score += Math.floor((fallbackDate || 0) / 86_400_000) % 10_000;

  return {
    realWorldYear,
    effectiveYear,
    webFreshnessScore: score,
    webFreshnessReason: reasons,
    latestDateMs: fallbackDate,
    isOutOfStock: isOutOfStock(product),
    url: normalizeCellphonesUrl(product.url || product.sourceUrl || product.inputUrl || product.sourceUrls?.[0]),
    slug: product.slug || product.sku || getSlugFromUrl(product.url || product.sourceUrl || product.inputUrl),
    name: product.name || product.productName || product.title || "",
  };
}

module.exports = {
  buildRealWorldRecency,
  foldVietnamese,
  getSlugFromUrl,
  inferRealWorldYear,
  isOutOfStock,
  normalizeCellphonesUrl,
  productText,
};
