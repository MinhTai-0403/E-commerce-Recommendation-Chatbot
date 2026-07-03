const cheerio = require("cheerio");
const vm = require("vm");
const { repairMojibake, repairObjectText } = require("./text-utils");

const SITE_ORIGIN = "https://cellphones.com.vn";
const CDN_ORIGIN = "https://cdn2.cellphones.com.vn";
const SOURCE_SITE = "cellphones";

function extractCellphonesDetails(html, inputUrl, options = {}) {
  const $ = cheerio.load(html, { decodeEntities: true });
  const nuxt = extractNuxtState(html);
  const fetchProduct = getFetchProduct(nuxt);
  const productState = nuxt?.state?.product || {};
  const productData = productState.productData || {};
  const general = productData.general || {};
  const attrs = general.attributes || {};
  const filterable = productData.filterable || {};
  const specification = productData.specification || {};
  const pageInfo =
    nuxt?.data?.[0]?.pageInfo ||
    nuxt?.state?.["meta-head"]?.pageInfo ||
    {};
  const jsonLdCandidates = [
    ...jsonLdBlocks($),
    ...jsonLdFromHead(fetchProduct?.headProduct),
    ...jsonLdFromHead(nuxt?.data?.[0]?.head),
  ];
  const productJsonLd = findJsonLdByType(jsonLdCandidates, "Product")[0] || {};
  const breadcrumbJsonLd = findJsonLdByType(jsonLdCandidates, "BreadcrumbList")[0];

  const canonicalUrl =
    cleanUrl(pageInfo.canonical) ||
    attr($, "link[rel='canonical']", "href") ||
    attr($, "meta[property='og:url']", "content") ||
    inputUrl;
  const slug =
    cleanText(attrs.url_key) ||
    slugFromUrl(canonicalUrl) ||
    slugFromUrl(inputUrl);
  const name =
    cleanText(general.name) ||
    cleanText(filterable.name) ||
    cleanText(productJsonLd.name) ||
    cleanText(pageInfo.h1_title) ||
    cleanText(attr($, "meta[property='og:title']", "content")) ||
    cleanText($("h1").first().text());
  const currentPrice = numberValue(
    filterable.special_price ||
    filterable.display_price ||
    filterable.prices?.special?.value ||
    productJsonLd.offers?.price
  );
  const originalPrice = numberValue(
    filterable.price ||
    filterable.prices?.root?.value ||
    currentPrice
  );
  const media = extractMedia({
    attrs,
    filterable,
    productJsonLd,
    productState,
    fetchProduct,
    pageInfo,
    name,
    slug,
  });
  const thumbnail = media.find((item) => item.type === "image")?.src || media[0]?.thumbnail || "";
  const categoryTrail = extractCategoryTrail({ breadcrumbJsonLd, fetchProduct, productJsonLd });
  const specifications = extractSpecifications(specification);
  const articleHtml = cleanArticleHtml(pageInfo.content || "", options);
  const rating = numberValue(productJsonLd.aggregateRating?.ratingValue) || 5;
  const ratingCount =
    numberValue(productJsonLd.aggregateRating?.reviewCount) ||
    numberValue(productJsonLd.aggregateRating?.ratingCount) ||
    0;

  return repairObjectText({
    source: SOURCE_SITE,
    sourceUrl: canonicalUrl,
    inputUrl,
    url: canonicalUrl,
    slug,
    sku: cleanText(general.sku) || slug,
    id: `prod_${slug}`,
    productId: numberValue(pageInfo.product_id || general.product_id || attrs.id || productState.productId),
    sourceCapturedAt: new Date().toISOString(),
    scrapedAt: new Date(),
    preferLocalDetail: false,
    name,
    productName: name,
    title: cleanText(pageInfo.meta_title) || cleanText($("title").first().text()),
    meta: {
      title: cleanText(pageInfo.meta_title),
      description: cleanText(pageInfo.meta_description) || cleanText(productJsonLd.description),
      keywords: cleanText(pageInfo.meta_keywords),
      image: absoluteImage(pageInfo.meta_image || productJsonLd.image),
    },
    brand: extractBrand(productJsonLd, attrs, name),
    brandKey: slugify(extractBrand(productJsonLd, attrs, name)),
    category: categoryTrail.find((item) => item.id !== "home" && normalizeText(item.name) !== "cellphones")?.name || "",
    categoryTrail,
    currentPrice,
    originalPrice,
    discount: discountPercent(currentPrice, originalPrice),
    rating,
    ratingCount,
    installment: Boolean(currentPrice && currentPrice >= 1_000_000),
    statusLabel: stockLabel(filterable),
    city: "Hồ Chí Minh",
    thumbnail,
    image: thumbnail,
    primaryImage: thumbnail,
    images: media.filter((item) => item.type === "image").map((item) => item.src),
    media,
    highlights: extractHighlights(attrs, $),
    variants: extractStorageVariants(fetchProduct, pageInfo),
    colors: extractColorVariants(fetchProduct, productState),
    priceBenefits: extractPriceBenefits(filterable),
    stockNote: stockNote(filterable),
    shortNotice: cleanTextFromHtml(
      filterable.short_description?.value ||
      attrs.short_description ||
      ""
    ),
    promotions: extractPromotions(filterable),
    privileges: extractPrivileges(attrs),
    policies: extractPolicies(attrs, filterable),
    paymentOffers: defaultPaymentOffers(),
    specifications,
    relatedProducts: extractRelatedProducts(fetchProduct),
    news: extractNews(fetchProduct),
    reviewSummary: extractReviewSummary(productJsonLd, rating, ratingCount),
    articleTitle: cleanText(pageInfo.h1_title) || name,
    articleHtml,
    articleSections: articleHtml ? [] : extractArticleSections($),
    faqs: extractFaqs(jsonLdCandidates),
    qaPrompt: extractQaPrompt($),
    rawSource: {
      nuxtRoutePath: nuxt?.routePath,
      cellphonesProductId: numberValue(pageInfo.product_id),
      cellphonesParentId: numberValue(filterable.parent_id),
    },
  });
}

function extractNuxtState(html) {
  const match = String(html || "").match(/<script[^>]*>\s*window\.__NUXT__=([\s\S]*?)<\/script>/);
  if (!match) return null;

  try {
    const sandbox = { window: {} };
    vm.runInNewContext(`window.__NUXT__=${match[1]}`, sandbox, { timeout: 5000 });
    return sandbox.window.__NUXT__ || null;
  } catch {
    return null;
  }
}

function getFetchProduct(nuxt) {
  const fetchData = nuxt?.fetch || {};
  const key = Object.keys(fetchData).find((item) => item.includes("product-detail"));
  return key ? fetchData[key] : null;
}

function jsonLdFromHead(head = {}) {
  return asArray(head.script)
    .map((script) => script?.json)
    .filter(Boolean);
}

function extractCategoryTrail({ breadcrumbJsonLd, fetchProduct }) {
  const fromJsonLd = asArray(breadcrumbJsonLd?.itemListElement)
    .map((item, index) => {
      const nested = item.item || {};
      return {
        id: slugify(nested.name || item.name || `breadcrumb-${index + 1}`),
        name: cleanText(nested.name || item.name),
        href: cleanUrl(nested["@id"] || nested.url || item.url || "#") || "#",
      };
    })
    .filter((item) => item.name);

  if (fromJsonLd.length) return normalizeHomeBreadcrumb(fromJsonLd);

  const fromFetch = asArray(fetchProduct?.breadcrumbsArr)
    .filter((item) => cleanText(item.name) && normalizeText(item.name) !== "root")
    .map((item, index) => ({
      id: slugify(item.uri || item.name || `category-${index + 1}`),
      name: cleanText(item.name),
      href: item.uri ? absoluteUrl(`/${item.uri}`) : "#",
    }));

  return normalizeHomeBreadcrumb(fromFetch);
}

function normalizeHomeBreadcrumb(items) {
  const normalized = items.filter((item) => normalizeText(item.name) !== "root");
  if (normalized.some((item) => item.id === "home" || normalizeText(item.name).includes("trang chu"))) {
    return normalized;
  }
  return [{ id: "home", name: "Trang chủ", href: "/" }, ...normalized];
}

function extractMedia({ attrs, filterable, productJsonLd, productState, fetchProduct, pageInfo, name, slug }) {
  const candidates = [];
  const add = (src, label, type = "image", thumbnail = src) => {
    const image = absoluteImage(src);
    const thumb = absoluteImage(thumbnail || src) || image;
    if (!image && !thumb) return;
    candidates.push({ type, src: image, thumbnail: thumb, label: cleanText(label), alt: name });
  };

  asArray(productJsonLd.image).forEach((src) => add(src, ""));
  add(attrs.image, "Ảnh chính");
  add(attrs.ads_base_image, "Ảnh chính");
  add(filterable.thumbnail, "Ảnh chính");
  add(pageInfo.meta_image, "Ảnh chính");

  asArray(productState.thumbnailList).forEach((item) => {
    const itemAttrs = item?.general?.attributes || {};
    add(itemAttrs.image || itemAttrs.ads_base_image || item?.filterable?.thumbnail, itemAttrs.color || "");
  });

  asArray(fetchProduct?.variants).forEach((variant) => {
    const itemAttrs = variant?.general?.attributes || {};
    add(itemAttrs.image || itemAttrs.ads_base_image || variant?.filterable?.thumbnail, itemAttrs.color || "");
  });

  const unique = uniqueBy(candidates, (item) => item.src || item.thumbnail)
    .filter((item) => hasUsableImage(item.src || item.thumbnail));

  return unique.map((item, index) => ({
    id: `${slug || "product"}-media-${index + 1}`,
    type: item.type,
    label: item.label || (index === 0 ? "Ảnh chính" : `Ảnh ${index + 1}`),
    src: item.src,
    thumbnail: item.thumbnail || item.src,
    alt: item.alt || name,
  }));
}

function extractHighlights(attrs, $) {
  const htmlHighlights = attrs.key_selling_points;
  if (htmlHighlights) {
    const local = cheerio.load(htmlHighlights, { decodeEntities: true });
    const items = local("li")
      .map((_, el) => cleanText(local(el).text()))
      .get()
      .filter(Boolean);
    if (items.length) return uniqueStrings(items);
  }

  const domItems = $(".box-ksp li, .ksp-content li")
    .map((_, el) => cleanText($(el).text()))
    .get()
    .filter(Boolean);

  return uniqueStrings(domItems);
}

function extractStorageVariants(fetchProduct, pageInfo) {
  const currentProductId = numberValue(pageInfo.product_id);
  return asArray(fetchProduct?.listLinked)
    .map((item, index) => ({
      id: `storage-${slugify(item.name || index + 1)}`,
      name: cleanText(item.name),
      slug: slugFromUrl(item.link),
      url: absoluteUrl(item.link),
      price: numberValue(item.price),
      productId: numberValue(item.product_id),
      active: currentProductId ? numberValue(item.product_id) === currentProductId : index === 0,
    }))
    .filter((item) => item.name || item.slug);
}

function extractColorVariants(fetchProduct, productState) {
  const selectedColorId = numberValue(fetchProduct?.selectColorId || productState.selectColorId);
  return asArray(fetchProduct?.variants)
    .map((variant, index) => {
      const attrs = variant?.general?.attributes || {};
      const filterable = variant?.filterable || {};
      const productId = numberValue(attrs.id || attrs.product_id || variant?.general?.product_id);
      return {
        id: `color-${productId || index + 1}`,
        productId,
        name: cleanText(attrs.color || attrs.name || variant?.general?.name),
        slug: slugFromUrl(attrs.url_path),
        price: numberValue(filterable.special_price || filterable.price),
        image: absoluteImage(attrs.image || attrs.ads_base_image || filterable.thumbnail),
        active: selectedColorId ? productId === selectedColorId : index === 0,
      };
    })
    .filter((item) => item.name || item.image);
}

function extractPriceBenefits(filterable) {
  const prices = filterable.prices || {};
  const benefits = [
    { key: "smem", id: "smember", label: "Smember giảm thêm đến" },
    { key: "svip", id: "svip", label: "S-VIP giảm thêm đến" },
    { key: "special", id: "special", label: "Giá ưu đãi đã giảm" },
  ];

  return benefits
    .map((item) => {
      const priceInfo = prices[item.key] || {};
      const discount = numberValue(priceInfo.chiet_khau || priceInfo.discount_value);
      if (!discount) return null;
      return {
        id: item.id,
        label: item.label,
        value: formatVnd(discount),
      };
    })
    .filter(Boolean);
}

function extractPromotions(filterable) {
  const pack = filterable.promotion_pack || {};
  const groups = Object.values(pack).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    return Object.values(value);
  });
  const promotions = [];

  for (const group of groups) {
    for (const item of asArray(group?.items)) {
      const title = cleanText(item.name);
      if (!title) continue;
      promotions.push({
        id: slugify(item.uuid || item.external_id || title),
        title,
        description: cleanText(group.notes || group.description || ""),
        href: cleanUrl(item.url),
      });
    }
  }

  if (promotions.length) return uniqueBy(promotions, (item) => item.title + item.href);

  const fallbackText = cleanTextFromHtml(filterable.promotion_information || filterable.promotion_info || "");
  return fallbackText
    ? [{ id: "promotion-information", title: fallbackText, description: "" }]
    : [];
}

function extractPrivileges(attrs) {
  return [
    {
      id: "exclusive-apple",
      title: "Đặc quyền khi mua tại CellphoneS",
      description: "Sản phẩm chính hãng, xuất VAT đầy đủ và hỗ trợ tại hệ thống cửa hàng CellphoneS.",
    },
    {
      id: "app-only",
      title: "Đặc quyền trên ứng dụng Smember",
      description: "Theo dõi đơn hàng, nhận voucher, ưu đãi thành viên và chương trình riêng trên ứng dụng.",
    },
    {
      id: "trade-in",
      title: "Thu cũ lên đời",
      description: "Hỗ trợ định giá máy cũ và lên đời sản phẩm mới nhanh tại cửa hàng.",
    },
    ...(attrs.bao_hanh_1_doi_1 ? [{
      id: "one-to-one",
      title: "1 đổi 1 trong 30 ngày",
      description: "Áp dụng khi sản phẩm đủ điều kiện lỗi phần cứng từ nhà sản xuất.",
    }] : []),
  ];
}

function extractPolicies(attrs, filterable) {
  return [
    {
      id: "official",
      title: "Sản phẩm chính hãng",
      description: cleanText(filterable.product_condition) || "Nguồn hàng chính hãng, thông tin được đồng bộ từ CellphoneS.",
    },
    {
      id: "box",
      title: "Phụ kiện trong hộp",
      description: cleanText(attrs.included_accessories || filterable.included_accessories) || "Cập nhật theo từng sản phẩm.",
    },
    {
      id: "warranty",
      title: "Bảo hành chính hãng",
      description: cleanTextFromHtml(filterable.warranty_information) || "Bảo hành theo chính sách hãng và CellphoneS.",
    },
    {
      id: "vat",
      title: "Giá đã bao gồm VAT",
      description: "Giá sản phẩm đã bao gồm VAT.",
    },
  ];
}

function defaultPaymentOffers() {
  return [
    {
      id: "apple-pay",
      title: "Apple Pay",
      description: "Hỗ trợ thanh toán nhanh qua Apple Pay tại CellphoneS.",
      href: "https://cellphones.com.vn/sforum/apple-pay-viet-nam",
    },
    {
      id: "vnpay",
      title: "VNPAY",
      description: "Thanh toán VNPAY và nhận ưu đãi theo chương trình hiện hành.",
      href: "https://cellphones.com.vn/sforum/vnpay-la-gi-cach-dang-ky-vnpay-thanh-toan-vnpay-chi-tiet",
    },
    {
      id: "momo",
      title: "Momo",
      description: "Hướng dẫn thanh toán qua ví Momo tại CellphoneS.",
      href: "https://cellphones.com.vn/huong-dan-thanh-toan-qua-vi-momo-cellphones",
    },
    {
      id: "kredivo",
      title: "Kredivo",
      description: "Ưu đãi trả sau/trả góp qua Kredivo.",
      href: "https://cellphones.com.vn/uu-dai-doi-tac/kredivo",
    },
    {
      id: "zalopay",
      title: "ZaloPay",
      description: "Ưu đãi thanh toán ZaloPay khi mua hàng trên website CellphoneS.",
      href: "https://cellphones.com.vn/sforum/huong-dan-toan-bang-zalopay-khi-mua-hang-tren-website-cellphones",
    },
  ];
}

function extractSpecifications(specification) {
  const fullGroups = asArray(specification.full_by_group)
    .map((group, groupIndex) => ({
      id: slugify(group.label || `spec-group-${groupIndex + 1}`),
      groupName: cleanText(group.label || `Thông số ${groupIndex + 1}`),
      rows: asArray(group.value)
        .map((row, rowIndex) => normalizeSpecRow(row, groupIndex, rowIndex))
        .filter(Boolean),
    }))
    .filter((group) => group.rows.length);

  if (fullGroups.length) return fullGroups;

  const basic = asArray(specification.basic)
    .map((row, rowIndex) => normalizeSpecRow(row, 0, rowIndex))
    .filter(Boolean);

  return basic.length
    ? [{ id: "specifications", groupName: "Thông số kỹ thuật", rows: basic }]
    : [];
}

function normalizeSpecRow(row, groupIndex, rowIndex) {
  const label = cleanText(row?.label || row?.name || row?.key);
  if (!label) return null;

  return {
    id: slugify(row?.key || `${label}-${groupIndex}-${rowIndex}`),
    label,
    value: normalizeSpecValue(row?.value),
    labelUrl: cleanUrl(row?.label_url),
  };
}

function normalizeSpecValue(value) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
  const raw = String(value ?? "");
  if (/<[a-z][\s\S]*>/i.test(raw)) return { html: cleanInlineHtml(raw) };
  return cleanText(raw);
}

function extractRelatedProducts(fetchProduct) {
  return asArray(fetchProduct?.similarList?.items)
    .map((item, index) => normalizeRelatedProduct(item, index))
    .filter(Boolean);
}

function normalizeRelatedProduct(item, index) {
  const name = cleanText(item.name || item.product_name);
  if (!name) return null;
  const slug = slugFromUrl(item.url || item.url_path || item.link) || slugify(name);
  const currentPrice = numberValue(item.special_price || item.price);
  const originalPrice = numberValue(item.price) || currentPrice;

  return {
    id: `related-${slug || index + 1}`,
    sku: cleanText(item.sku) || slug,
    slug,
    name,
    image: absoluteImage(item.thumbnail || item.image),
    currentPrice,
    originalPrice,
    discount: discountPercent(currentPrice, originalPrice),
    rating: 5,
    ratingCount: 0,
    installment: Boolean(currentPrice && currentPrice >= 1_000_000),
  };
}

function extractNews(fetchProduct) {
  return asArray(fetchProduct?.sforumPost?.dataItem)
    .map((item, index) => ({
      id: `news-${slugify(item.title || index + 1)}`,
      title: cleanText(item.title),
      href: cleanUrl(item.url || item.link) || "https://cellphones.com.vn/sforum",
    }))
    .filter((item) => item.title);
}

function extractReviewSummary(productJsonLd, rating, ratingCount) {
  const samples = asArray(productJsonLd.review)
    .slice(0, 5)
    .map((review, index) => ({
      id: `review-${index + 1}`,
      author: cleanText(review.author?.name || review.author || "Khách hàng CellphoneS"),
      rating: numberValue(review.reviewRating?.ratingValue) || rating || 5,
      content: cleanText(review.reviewBody) || "Đánh giá từ khách hàng CellphoneS.",
    }));

  return {
    rating,
    total: ratingCount,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: stars === Math.round(rating || 5) ? ratingCount : 0,
    })),
    samples,
  };
}

function extractFaqs(jsonLdCandidates) {
  const faqs = [];
  for (const faqPage of findJsonLdByType(jsonLdCandidates, "FAQPage")) {
    for (const item of asArray(faqPage.mainEntity)) {
      const answer = asArray(item.acceptedAnswer)[0] || {};
      const answerHtml = cleanInlineHtml(decodeHtmlEntities(answer.text || ""));
      faqs.push({
        id: `faq-${slugify(item.name || faqs.length + 1)}`,
        question: cleanText(item.name),
        answer: cleanTextFromHtml(answerHtml),
        answerHtml,
      });
    }
  }
  return uniqueBy(faqs.filter((item) => item.question), (item) => item.question);
}

function extractArticleSections($) {
  const root = $("#cpsContentSEO").first();
  if (!root.length) return [];
  return [
    {
      id: "cellphones-content",
      heading: cleanText($("#cpsContent h2.ksp-title").first().text()) || "Đặc điểm nổi bật",
      paragraphs: cleanText(root.text())
        .split(/(?<=\.)\s+/)
        .filter(Boolean)
        .slice(0, 6),
    },
  ];
}

function extractQaPrompt($) {
  const root = $("#block-comment-cps .question").first();
  if (!root.length) return null;
  return {
    title: cleanText(root.find(".question-title").first().text()),
    description: cleanText(root.find(".question-content").first().text()),
    buttonText: cleanText(root.find("button").first().text()),
  };
}

function jsonLdBlocks($) {
  const blocks = [];
  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Ignore malformed third-party JSON-LD.
    }
  });
  return blocks;
}

function findJsonLdByType(input, type) {
  const matches = [];

  function visit(value) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;

    const jsonType = value["@type"];
    if (jsonType === type || (Array.isArray(jsonType) && jsonType.includes(type))) {
      matches.push(value);
    }
    if (value["@graph"]) visit(value["@graph"]);
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === "object") visit(nested);
    }
  }

  visit(input);
  return uniqueBy(matches, (item) => JSON.stringify(item).slice(0, 500));
}

function cleanArticleHtml(value, options = {}) {
  const html = String(value || "");
  if (!html) return "";

  const $ = cheerio.load(`<main>${html}</main>`, { decodeEntities: false });
  $("script,style").remove();
  $("nuxt-img").each((_, el) => {
    const node = $(el);
    const img = $("<img>");
    for (const attrName of ["src", "alt", "title", "loading"]) {
      const attrValue = node.attr(attrName);
      if (attrValue) img.attr(attrName, attrValue);
    }
    if (!img.attr("loading")) img.attr("loading", "lazy");
    node.replaceWith(img);
  });
  $("img").each((_, el) => {
    const node = $(el);
    const src = absoluteImage(node.attr("src"));
    if (src) node.attr("src", src);
    if (!node.attr("loading")) node.attr("loading", "lazy");
  });
  $("a").each((_, el) => {
    const node = $(el);
    const href = cleanUrl(node.attr("href"));
    if (href) node.attr("href", absoluteUrl(href));
    if (node.attr("target") === "_blank" && !node.attr("rel")) {
      node.attr("rel", "nofollow noopener");
    }
  });

  const cleaned = $("main").html() || "";
  return options.includeHtml === false ? cleaned : cleaned;
}

function cleanInlineHtml(value) {
  const html = String(value || "");
  if (!html) return "";
  const $ = cheerio.load(`<span>${html}</span>`, { decodeEntities: false });
  $("script,style").remove();
  $("a").each((_, el) => {
    const node = $(el);
    const href = cleanUrl(node.attr("href"));
    if (href) node.attr("href", absoluteUrl(href));
  });
  return $("span").html() || "";
}

function cleanTextFromHtml(value) {
  const html = String(value || "");
  if (!html) return "";
  return cleanText(cheerio.load(html, { decodeEntities: true }).text() || html);
}

function cleanText(value) {
  return repairMojibake(String(value || ""))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attr($, elementOrSelector, name) {
  return cleanText($(elementOrSelector).attr(name));
}

function absoluteImage(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const clean = cleanUrl(raw);
  if (!clean || clean === "no_selection") return "";
  if (/^https?:\/\//i.test(clean)) {
    return clean
      .replace("/200x/media/catalog/product/", "/x/media/catalog/product/")
      .replace("/100x/media/catalog/product/", "/x/media/catalog/product/");
  }
  if (clean.startsWith("//")) return `https:${clean}`;
  if (clean.startsWith("/x/media/")) return `${CDN_ORIGIN}${clean}`;
  if (clean.startsWith("/media/")) return `${SITE_ORIGIN}${clean}`;
  if (clean.startsWith("/")) return `${CDN_ORIGIN}/x/media/catalog/product${clean}`;
  return `${CDN_ORIGIN}/x/media/catalog/product/${clean}`;
}

function absoluteUrl(value) {
  const clean = cleanUrl(value);
  if (!clean) return "";
  try {
    return new URL(clean, SITE_ORIGIN).toString();
  } catch {
    return clean;
  }
}

function cleanUrl(value) {
  const clean = cleanText(value);
  return clean || "";
}

function slugFromUrl(url) {
  const clean = cleanUrl(url);
  if (!clean) return "";
  try {
    return new URL(clean, SITE_ORIGIN).pathname.split("/").pop().replace(/\.html$/i, "");
  } catch {
    return clean.split("/").pop().replace(/\.html$/i, "");
  }
}

function slugify(value = "") {
  return String(value || "san-pham-moi")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "san-pham-moi";
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function discountPercent(currentPrice, originalPrice) {
  if (!currentPrice || !originalPrice || originalPrice <= currentPrice) return 0;
  return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
}

function stockLabel(filterable) {
  const stock = numberValue(filterable.stock || filterable.company_stock_quantity);
  if (stock === 0) return "Liên hệ";
  return "Còn hàng";
}

function stockNote(filterable) {
  const deliveryBadge = cleanText(
    typeof filterable.delivery_badge === "string"
      ? filterable.delivery_badge
      : filterable.delivery_badge?.name || filterable.delivery_badge?.title || filterable.delivery_badge?.label
  );
  if (deliveryBadge) return deliveryBadge;
  const stock = numberValue(filterable.stock || filterable.company_stock_quantity);
  return stock ? `Còn hàng tại hệ thống CellphoneS` : "";
}

function extractBrand(productJsonLd, attrs, name) {
  const brand = cleanText(productJsonLd.brand?.name || productJsonLd.brand || attrs.manufacturer);
  if (brand) return brand;

  const lower = normalizeText(name);
  const brands = ["Apple", "Samsung", "Xiaomi", "OPPO", "Honor", "ASUS", "Lenovo", "HP", "Dell", "Acer", "DJI", "Garmin", "Sony", "JBL"];
  return brands.find((item) => lower.includes(normalizeText(item))) || "";
}

function formatVnd(value) {
  const number = numberValue(value);
  if (!number) return "";
  return `${number.toLocaleString("vi-VN")}đ`;
}

function decodeHtmlEntities(value) {
  const raw = String(value || "");
  if (!raw) return "";
  return cheerio.load(`<textarea>${raw}</textarea>`, { decodeEntities: true })("textarea").text();
}

function hasUsableImage(src) {
  const text = String(src || "").toLowerCase();
  return Boolean(text) &&
    !text.includes("no_selection") &&
    !text.includes("no-product") &&
    !text.includes("placeholder");
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueStrings(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const key = keyFn(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

module.exports = {
  extractCellphonesDetails,
};
