const BATTERY_CAPACITY_MIN_MAH = 500;
const BATTERY_CAPACITY_MAX_MAH = 30000;
const LONG_BATTERY_PHONE_MIN_MAH = 5000;
const { getProductFacetOverride } = require("../data/product-facet-overrides");

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0111\u0110]/g, "d")
    .toLowerCase()
    .trim();
}

function scalarStrings(value) {
  if (value == null) return [];
  if (["string", "number"].includes(typeof value)) return [String(value)];
  if (Array.isArray(value)) return value.flatMap(scalarStrings);
  if (typeof value === "object") {
    return [value.text, value.value, value.html, value.label]
      .filter((item) => item != null)
      .flatMap(scalarStrings);
  }
  return [];
}

function parseBatteryCapacityMah(value) {
  const capacities = scalarStrings(value).flatMap((text) => {
    const plainText = String(text).replace(/<[^>]+>/g, " ");
    return [...plainText.matchAll(/(\d{3,5}(?:[.,]\d+)?)\s*m\s*a\s*h\b/gi)]
      .map((match) => Number(String(match[1]).replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")))
      .filter((capacity) => (
        Number.isFinite(capacity)
        && capacity >= BATTERY_CAPACITY_MIN_MAH
        && capacity <= BATTERY_CAPACITY_MAX_MAH
      ));
  });

  return capacities.length ? Math.max(...capacities) : null;
}

function isBatterySpecification(row = {}, group = {}) {
  const rowIdentity = normalizeText([row.id, row.key, row.label, row.name].filter(Boolean).join(" "));
  const groupIdentity = normalizeText([group.id, group.groupName, group.name, group.title].filter(Boolean).join(" "));
  const batteryPattern = /(^|\b)(pin|battery|battery capacity|dung luong pin)(\b|$)/i;

  return batteryPattern.test(rowIdentity)
    || (batteryPattern.test(groupIdentity) && /(^|\b)(pin|battery|dung luong|capacity)(\b|$)/i.test(rowIdentity));
}

function extractBatteryCapacityMah(detail = {}) {
  const groups = Array.isArray(detail.specifications) ? detail.specifications : [];
  const capacities = [];

  for (const group of groups) {
    const rows = Array.isArray(group?.rows)
      ? group.rows
      : Array.isArray(group?.items)
        ? group.items
        : [];

    for (const row of rows) {
      if (!isBatterySpecification(row, group)) continue;
      const capacity = parseBatteryCapacityMah(row?.value ?? row?.values ?? row?.text);
      if (capacity) capacities.push(capacity);
    }
  }

  for (const [label, value] of Object.entries(detail.attributes || {})) {
    if (!/(^|\b)(pin|battery|dung luong pin)(\b|$)/i.test(normalizeText(label))) continue;
    const capacity = parseBatteryCapacityMah(value);
    if (capacity) capacities.push(capacity);
  }

  return capacities.length ? Math.max(...capacities) : null;
}

function uniqueValues(values = []) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}

function collectSpecRows(detail = {}) {
  const rows = [];
  const pushRow = (label, value, group = "") => {
    const labelText = scalarStrings(label).join(" ").trim();
    const valueText = scalarStrings(value).join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!labelText || !valueText) return;
    rows.push({
      label: labelText,
      value: valueText,
      group: scalarStrings(group).join(" ").trim(),
      labelKey: normalizeText(labelText),
      valueKey: normalizeText(valueText),
      groupKey: normalizeText(scalarStrings(group).join(" ").trim()),
    });
  };

  for (const group of Array.isArray(detail.specifications) ? detail.specifications : []) {
    const groupLabel = group.groupName || group.name || group.title || group.label || "Thông số kỹ thuật";
    const groupRows = Array.isArray(group.rows)
      ? group.rows
      : Array.isArray(group.items)
        ? group.items
        : [];

    if (groupRows.length) {
      groupRows.forEach((row) => pushRow(row.label || row.name || row.key || row.id, row.value ?? row.values ?? row.text, groupLabel));
    } else {
      pushRow(group.name || group.label || group.key, group.value ?? group.values ?? group.text, groupLabel);
    }
  }

  for (const [label, value] of Object.entries(detail.attributes || {})) {
    pushRow(label, value, "attributes");
  }

  const additionalProperties = detail.rawProductJsonLd?.additionalProperty || detail.additionalProperty || [];
  for (const item of Array.isArray(additionalProperties) ? additionalProperties : []) {
    pushRow(item.name || item.label, item.value ?? item.text, "jsonLd");
  }

  return rows;
}

function rowsByLabel(rows = [], pattern) {
  return rows.filter((row) => pattern.test(row.labelKey));
}

function valuesByLabel(rows = [], pattern) {
  return rowsByLabel(rows, pattern).map((row) => row.value);
}

function textByLabel(rows = [], pattern) {
  return normalizeText(valuesByLabel(rows, pattern).join("\n"));
}

function hasPositiveValue(rows = [], labelPattern, valuePattern = /co|yes|ho tro|support/i) {
  return rowsByLabel(rows, labelPattern).some((row) => (
    !/^(khong|no|none|false|0|khong ho tro)$/i.test(row.valueKey)
    && valuePattern.test(row.valueKey)
  ));
}

function parseMemoryGb(value) {
  const numbers = scalarStrings(value).flatMap((text) => {
    const plain = normalizeText(text).replace(/,/g, ".");
    return [...plain.matchAll(/(\d+(?:\.\d+)?)\s*(tb|gb)\b/g)].map((match) => {
      const amount = Number(match[1]);
      return match[2] === "tb" ? amount * 1024 : amount;
    });
  }).filter((number) => Number.isFinite(number) && number > 0 && number <= 8192);

  return numbers.length ? Math.max(...numbers) : null;
}

function parsePhysicalRamGb(value) {
  const numbers = scalarStrings(value).flatMap((text) => {
    const plain = normalizeText(text).replace(/,/g, ".");
    return [...plain.matchAll(/(\d+(?:\.\d+)?)\s*(tb|gb)\b/g)].map((match) => {
      const amount = Number(match[1]);
      return match[2] === "tb" ? amount * 1024 : amount;
    });
  }).filter((number) => Number.isFinite(number) && number > 0 && number <= 128);

  // Dung lượng RAM vật lý thường được ghi trước phần RAM mở rộng/ảo.
  return numbers[0] || null;
}

function extractUniqueArticleRamGb(articleHtml = "") {
  const toPlainText = (value) => String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  const candidates = [];

  for (const rowMatch of String(articleHtml || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cellMatch) => toPlainText(cellMatch[1]));
    if (cells.length < 2) continue;

    const label = normalizeText(cells[0]);
    if (!/(^|\b)(ram|bo nho ram|dung luong ram|ram va dung luong)(\b|$)/i.test(label)) continue;

    const valueMatch = cells[1].match(/(?:\bram\s*[:\-]?\s*)?(\d+(?:[.,]\d+)?)\s*gb(?:\s*ram)?\b/i);
    if (!valueMatch) continue;
    const number = Number(String(valueMatch[1]).replace(",", "."));
    if (Number.isFinite(number) && number > 0 && number <= 128) candidates.push(number);
  }
  const unique = uniqueValues(candidates);

  return unique.length === 1 ? unique[0] : null;
}

function getChipsetFamily(chipsetValue = "", productIdentity = "") {
  const chipset = normalizeText(chipsetValue);
  const identity = normalizeText(productIdentity);
  if (!chipset) return null;

  if (/snapdragon/.test(chipset)) return "snapdragon";
  if (/dimensity/.test(chipset)) return "dimensity";
  if (/helio/.test(chipset)) return "helio";
  if (/exynos/.test(chipset)) return "exynos";
  if (/unisoc|spreadtrum/.test(chipset)) return "unisoc";
  if (/google\s*tensor|\btensor\s*g\d/.test(chipset)) return "google-tensor";
  if (/kirin/.test(chipset)) return "kirin";
  if (/apple\s*a\d+(?:\s*pro|\s*bionic)?/.test(chipset)) return "apple-a";
  if (/\b(?:chip\s*)?a\d{2}(?:\s*pro|\s*bionic)?\b/.test(chipset) && /apple|iphone|ipad/.test(identity)) {
    return "apple-a";
  }
  if (/apple\s*m\d+(?:\s*pro|\s*max|\s*ultra)?/.test(chipset)) return "apple-m";
  if (/\b(?:chip\s*)?m\d+(?:\s*pro|\s*max|\s*ultra)?\b/.test(chipset) && /apple|ipad/.test(identity)) {
    return "apple-m";
  }

  return null;
}

function getCpuTags(value = "") {
  const text = normalizeText(value);
  return uniqueValues([
    ...([...text.matchAll(/(?:intel\s+)?core\s+i([3579])\b/g)].map((match) => `intel-core-i${match[1]}`)),
    ...([...text.matchAll(/(?:intel\s+)?core\s+([3579])(?:[-\s]\d+|\b)/g)].map((match) => `intel-core-i${match[1]}`)),
    ...([...text.matchAll(/(?:intel\s+)?core\s+ultra\s+([579])\b/g)].map((match) => `intel-core-ultra-${match[1]}`)),
    ...([...text.matchAll(/(?:amd\s+)?ryzen\s+([3579])\b/g)].map((match) => `amd-ryzen-${match[1]}`)),
    ...([...text.matchAll(/(?:apple\s+)?m([345])(?:\s+(?:pro|max|ultra))?\b/g)].map((match) => `apple-m${match[1]}`)),
    ...(/snapdragon\s+x\s+plus/.test(text) ? ["snapdragon-x-plus"] : []),
    ...(/snapdragon\s+x\s+elite/.test(text) ? ["snapdragon-x-elite"] : []),
  ]);
}

function getGpuTags(value = "") {
  const text = normalizeText(value);
  const rtxModels = [...text.matchAll(/(?:nvidia\s+)?(?:geforce\s+)?rtx\s*(\d{4})\b/g)]
    .map((match) => `nvidia-rtx-${match[1]}`);
  const hasDedicatedGpu = rtxModels.length > 0 || /\bgtx\s*\d{3,4}\b|radeon\s+rx\s*\d+/.test(text);
  const hasIntegratedGpu = /onboard|integrated|tich hop|intel\s+(?:uhd|iris|graphics)|apple\s+\d+\s*core\s*gpu|radeon\s+graphics/.test(text);

  return uniqueValues([
    ...rtxModels,
    ...(/nvidia|geforce|\brtx\s*\d{4}\b|\bgtx\s*\d{3,4}\b/.test(text) ? ["nvidia-geforce"] : []),
    ...(/amd\s+radeon|radeon(?:\s+(?:graphics|rx\s*\d+))?/.test(text) ? ["amd-radeon"] : []),
    ...(
      hasIntegratedGpu && !hasDedicatedGpu
        ? ["onboard"]
        : []
    ),
  ]);
}

function getResolutionTags(value = "") {
  const text = normalizeText(value).replace(/\s+/g, " ");
  return uniqueValues([
    ...(/full\s*hd|\bfhd\b|1920\s*[x×]\s*1080/.test(text) ? ["full-hd"] : []),
    ...(/\b2k\b|2560\s*[x×]\s*1440/.test(text) ? ["2k"] : []),
    ...(/\bwqhd\+?\b/.test(text) ? ["wqhd"] : []),
    ...(/\bwuxga\b|1920\s*[x×]\s*1200/.test(text) ? ["wuxga"] : []),
    ...(/\b2[.,]8k\b|2880\s*[x×]\s*1800/.test(text) ? ["2.8k"] : []),
    ...(/\b3k\b|2880\s*[x×]\s*1920|3000\s*[x×]\s*2000/.test(text) ? ["3k"] : []),
    ...(/\b3[.,]2k\b|3200\s*[x×]\s*2000/.test(text) ? ["3.2k"] : []),
    ...(/\b4k\b|\buhd\b|3840\s*[x×]\s*2160/.test(text) ? ["4k"] : []),
    ...(/\bwqxga\+?\b|2560\s*[x×]\s*1600/.test(text) ? ["wqxga"] : []),
    ...(/retina/.test(text) ? ["retina"] : []),
    ...(/\b5k\b|5120\s*[x×]\s*2880/.test(text) ? ["5k"] : []),
  ]);
}

function parseScreenSizeInch(value) {
  const sizes = scalarStrings(value).flatMap((text) => {
    const plain = normalizeText(text).replace(/,/g, ".");
    return [...plain.matchAll(/(\d+(?:\.\d+)?)\s*(inch|inches|in|\")\b/g)]
      .map((match) => Number(match[1]))
      .filter((number) => Number.isFinite(number) && number >= 1 && number <= 100);
  });

  return sizes.length ? Math.max(...sizes) : null;
}

function parseRefreshRateHz(value) {
  const rates = scalarStrings(value).flatMap((text) => {
    const plain = normalizeText(text);
    return [...plain.matchAll(/(\d{2,3})\s*hz\b/g)]
      .map((match) => Number(match[1]))
      .filter((number) => Number.isFinite(number) && number >= 30 && number <= 500);
  });

  return rates.length ? Math.max(...rates) : null;
}

function tagMatches(text, entries = []) {
  return entries.filter(([tag, pattern]) => pattern.test(text)).map(([tag]) => tag);
}

function buildProductSpecFacets(detail = {}) {
  const rows = collectSpecRows(detail);
  const productIdentity = normalizeText([detail.name, detail.productName, detail.title, detail.slug].filter(Boolean).join(" "));
  const productCategory = normalizeText([
    detail.category,
    ...(Array.isArray(detail.categories) ? detail.categories : []),
  ].filter(Boolean).join(" "));
  const override = getProductFacetOverride(detail);
  const structuredRamGb = parsePhysicalRamGb(valuesByLabel(rows, /(^|\b)(ram|bo nho ram|dung luong ram)(\b|$)/i));
  const articleRamGb = extractUniqueArticleRamGb(detail.articleHtml);
  const ramGb = structuredRamGb || articleRamGb || override?.facets?.ramGb || null;
  const storageGb = parseMemoryGb(valuesByLabel(rows, /bo nho trong|dung luong luu tru|dung luong o cung|o cung|storage|(^|\b)rom(\b|$)|(^|\b)ssd(\b|$)|(^|\b)hdd(\b|$)/i));
  const screenSizeInch = parseScreenSizeInch(valuesByLabel(rows, /kich thuoc man hinh|screen size|display size|(^|\b)man hinh(\b|$)|(^|\b)display(\b|$)/i));
  const refreshRateHz = parseRefreshRateHz(valuesByLabel(rows, /tan so quet|toc do lam moi|refresh rate|tinh nang man hinh/i));
  const batteryCapacityMah = extractBatteryCapacityMah(detail);
  const displayText = textByLabel(rows, /cong nghe man hinh|loai man hinh|tam nen|type of display|display technology|tinh nang man hinh/i);
  const cameraText = normalizeText(rows
    .filter((row) => /camera|may anh/.test(row.labelKey) || /camera/.test(row.groupKey))
    .map((row) => row.value)
    .join("\n"));
  const chargingText = textByLabel(rows, /cong nghe sac|sac nhanh|sac khong day|charging/i);
  const waterResistanceText = textByLabel(rows, /khang nuoc|chong nuoc|khang bui|chong bui|water resistance|ip rating/i);
  const specialFeatureText = textByLabel(rows, /tinh nang dac biet|cong nghe.{0,10}tien ich|tien ich khac/i);
  const networkText = textByLabel(rows, /ho tro mang|loai mang|mang di dong|network/i);
  const wifiText = textByLabel(rows, /wi-?fi|wlan/i);
  const bluetoothText = textByLabel(rows, /bluetooth/i);
  const chipsetValues = valuesByLabel(rows, /chipset|chip xu ly|bo xu ly|vi xu ly|processor|system on chip|(^|\b)soc(\b|$)/i);
  const chipsetName = chipsetValues[0] || override?.facets?.chipsetName || "";
  const chipset = getChipsetFamily(chipsetValues.join(" "), productIdentity) || override?.facets?.chipset || null;
  const cpuValues = valuesByLabel(rows, /(^|\b)cpu(\b|$)|processor|chip xu ly|bo xu ly|vi xu ly|dong cpu|cong nghe cpu/i);
  const gpuValues = valuesByLabel(rows, /(^|\b)gpu(\b|$)|(^|\b)vga(\b|$)|graphics|card do hoa|chip do hoa|bo xu ly do hoa/i);
  const resolutionValues = valuesByLabel(rows, /do phan giai|resolution|screen resolution/i);
  const touchText = textByLabel(rows, /cam ung|touch|touchscreen|tinh nang man hinh/i);
  const cpu = getCpuTags(`${cpuValues.join(" ")} ${productIdentity}`);
  const gpu = getGpuTags(`${gpuValues.join(" ")} ${productIdentity}`);
  const resolution = getResolutionTags(`${resolutionValues.join(" ")} ${displayText} ${productIdentity}`);
  const facetSources = Object.fromEntries(Object.entries({
    ramGb: structuredRamGb
      ? "specifications"
      : articleRamGb
        ? "articleHtml"
        : override?.sources?.ramGb || "",
    chipset: chipsetValues.length
      ? "specifications"
      : override?.sources?.chipset || "",
    cpu: cpuValues.length ? "specifications" : "",
    gpu: gpuValues.length ? "specifications" : "",
    resolution: resolutionValues.length ? "specifications" : "",
  }).filter(([, value]) => value));
  const display = uniqueValues(tagMatches(displayText, [
    ["oled", /\boled\b/],
    ["amoled", /amoled/],
    ["super-amoled", /super\s*amoled/],
    ["ips", /\bips\b/],
    ["lcd", /\blcd\b/],
    ["retina", /retina/],
    ["mini-led", /mini\s*led/],
    ["qled", /qled/],
    ["curved", /man hinh cong|curved/],
  ]));
  const camera = uniqueValues(tagMatches(cameraText, [
    ["ois", /\bois\b|chong rung|quang hoc/],
    ["zoom", /zoom|telephoto|tiem vong|tele/],
    ["ultrawide", /sieu rong|ultra\s*wide|goc rong/],
    ["4k", /\b4k\b|uhd/],
    ["ai-camera", /camera.{0,20}\bai\b|ai.{0,20}camera|smart hdr|deep fusion/],
    ["night", /chup dem|night/],
    ["leica-zeiss-hasselblad", /leica|zeiss|hasselblad/],
  ]));
  const touchEvidence = `${touchText} ${specialFeatureText}`;
  const hasExplicitTouch = /cam ung|touch|touchscreen/.test(touchEvidence);
  const hasNegativeTouch = (
    /(?:khong|no|not supported).{0,24}(?:cam ung|touch|touchscreen)/.test(touchEvidence)
    || /(?:cam ung|touch|touchscreen).{0,24}(?:khong|no|not supported)/.test(touchEvidence)
  );
  const special = uniqueValues([
    ...(/\b5g\b/.test(`${networkText} ${specialFeatureText}`) ? ["5g"] : []),
    ...(hasPositiveValue(rows, /(^|\b)nfc(\b|$)|cong nghe nfc/i, /co|yes|nfc|ho tro/i) ? ["nfc"] : []),
    ...(/sac nhanh|fast charge|quick charge|supervooc|vooc|hypercharge|\b[0-9]{2,3}\s*w\b/.test(chargingText) ? ["fast-charge"] : []),
    ...(/sac khong day|wireless charge|\bqi\b|magsafe/.test(`${chargingText} ${specialFeatureText}`) ? ["wireless-charge"] : []),
    ...(/\bip68\b/.test(`${waterResistanceText} ${specialFeatureText}`) ? ["ip68"] : []),
    ...(/magsafe/.test(`${chargingText} ${specialFeatureText}`) ? ["magsafe"] : []),
    ...(/wi-?fi\s*6|wifi\s*6|802\.11ax/.test(wifiText) ? ["wifi6"] : []),
    ...(/wi-?fi\s*7|wifi\s*7|802\.11be/.test(wifiText) ? ["wifi7"] : []),
    ...(/(^|\D)(5(?:\.\d+)?|v5(?:\.\d+)?)(\D|$)/.test(bluetoothText) ? ["bluetooth5"] : []),
    ...(/\bai\b|apple intelligence|galaxy ai|dien thoai ai/.test(`${specialFeatureText} ${productIdentity}`) ? ["ai"] : []),
    ...(/intel\s+evo|\bevo\b/.test(`${specialFeatureText} ${productIdentity}`) ? ["intel-evo"] : []),
    ...(/van tay|fingerprint|touch\s*id/.test(specialFeatureText) ? ["fingerprint"] : []),
    ...(/xoay gap|gap 360|360\s*(?:do|degree)|2[\s-]?in[\s-]?1|convertible|x360/.test(`${specialFeatureText} ${productIdentity}`) ? ["convertible-360"] : []),
    ...(/nhan dien khuon mat|face\s*(?:id|recognition)|windows\s+hello/.test(specialFeatureText) ? ["face-recognition"] : []),
    ...(/\boled\b/.test(`${displayText} ${specialFeatureText}`) ? ["oled"] : []),
    ...(/\bmux(?:\s+switch)?\b|advanced optimus/.test(specialFeatureText) ? ["mux-switch"] : []),
    ...(/\bcopilot\b/.test(`${specialFeatureText} ${productIdentity}`) ? ["copilot"] : []),
    ...(/copilot\s*\+|copilot\s+plus|copilot\+\s*pc/.test(`${specialFeatureText} ${productIdentity}`) ? ["copilot-plus"] : []),
    ...(/apple\s+intelligence/.test(`${specialFeatureText} ${productIdentity}`) ? ["apple-intelligence"] : []),
    ...(
      (hasExplicitTouch && !hasNegativeTouch)
      || /2[\s-]?in[\s-]?1|x360|\bflip\b|\bflex\b|surface\s+pro|yoga\s+book|rog\s+flow\s+(?:x|z)\d+/.test(productIdentity)
        ? ["touch"]
        : []
    ),
  ]);
  const isOfficeLaptop = (
    /vivobook|ideapad(?!.*gaming)|thinkbook|thinkpad|inspiron|vostro|latitude|probook|elitebook|omnibook|modern|prestige|swift|aspire(?!.*gaming)|macbook\s+air|surface\s+laptop|pavilion|gram/.test(productIdentity)
    && !/gaming|victus|predator|nitro|legion|\brog\b|\btuf\b|\bloq\b/.test(productIdentity)
  );
  const isLaptopProduct = /(^|\b)laptop(\b|$)/.test(productCategory);
  const isExplicitGamingProduct = /gaming|choi game|\bgame\b|legion|\brog\b|redmagic|black shark|predator|nitro|victus|\btuf\b|\bloq\b|katana|cyborg/.test(`${productIdentity} ${specialFeatureText}`);
  const hasGamingLaptopGpu = gpu.some((tag) => (
    /^nvidia-rtx-/.test(tag)
    || /^nvidia-geforce$/.test(tag)
  ));
  const usage = uniqueValues([
    ...(
      isExplicitGamingProduct
      || (isLaptopProduct
        ? hasGamingLaptopGpu
        : ["snapdragon", "dimensity", "apple-a", "apple-m"].includes(chipset) || refreshRateHz >= 120)
        ? ["gaming"]
        : []
    ),
    ...(camera.some((tag) => ["ois", "zoom", "night", "leica-zeiss-hasselblad"].includes(tag)) ? ["photography"] : []),
    ...(batteryCapacityMah >= LONG_BATTERY_PHONE_MIN_MAH ? ["long-battery"] : []),
    ...(/mong nhe|thin and light|ultrabook/.test(`${productIdentity} ${specialFeatureText}`) ? ["lightweight"] : []),
    ...(/van phong|office|hoc tap|student/.test(`${productIdentity} ${specialFeatureText}`) || isOfficeLaptop ? ["office-study"] : []),
    ...(/do hoa|thiet ke|creator|workstation|dci-p3|adobe rgb/.test(`${productIdentity} ${displayText} ${specialFeatureText}`) ? ["design"] : []),
    ...(/creator|studio|sang tao|content creation/.test(`${productIdentity} ${specialFeatureText}`) ? ["creator"] : []),
    ...(/premium|cao cap|sang trong|zenbook|spectre|\bxps\b|thinkpad\s*x1|yoga\s+(?:slim|pro)|macbook\s+pro|prestige/.test(productIdentity) ? ["premium"] : []),
  ]);

  return Object.fromEntries(Object.entries({
    ramGb,
    storageGb,
    screenSizeInch,
    refreshRateHz,
    batteryCapacityMah,
    chipset,
    chipsetName,
    cpu,
    gpu,
    resolution,
    display,
    camera,
    special,
    usage,
    facetSources: Object.keys(facetSources).length ? facetSources : undefined,
    specSource: rows.length ? "detailBlob/specifications" : "summary",
  }).filter(([, value]) => Array.isArray(value) ? value.length : value !== null && value !== undefined && value !== ""));
}

module.exports = {
  LONG_BATTERY_PHONE_MIN_MAH,
  buildProductSpecFacets,
  extractUniqueArticleRamGb,
  extractBatteryCapacityMah,
  getCpuTags,
  getGpuTags,
  getResolutionTags,
  getChipsetFamily,
  parsePhysicalRamGb,
  parseBatteryCapacityMah,
};
