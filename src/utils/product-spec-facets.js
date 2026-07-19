const BATTERY_CAPACITY_MIN_MAH = 500;
const BATTERY_CAPACITY_MAX_MAH = 30000;
const LONG_BATTERY_PHONE_MIN_MAH = 5000;

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

function parseScreenSizeInch(value) {
  const sizes = scalarStrings(value).flatMap((text) => {
    const plain = normalizeText(text).replace(/,/g, ".");
    return [...plain.matchAll(/(\d+(?:\.\d+)?)\s*(?:inches?\b|in\b|[\"”])/g)]
      .map((match) => Number(match[1]))
      .filter((number) => Number.isFinite(number) && number >= 1 && number <= 100);
  });

  return sizes.length ? Math.max(...sizes) : null;
}

function parseWeightGram(value) {
  const weights = scalarStrings(value).flatMap((text) => {
    const plain = normalizeText(text).replace(/,/g, ".");
    const kilograms = [...plain.matchAll(/(\d+(?:\.\d+)?)\s*kg\b/g)]
      .map((match) => Number(match[1]) * 1000);
    const grams = [...plain.matchAll(/(\d+(?:\.\d+)?)\s*(?:g|gram)\b/g)]
      .map((match) => Number(match[1]));
    return [...kilograms, ...grams];
  }).filter((number) => Number.isFinite(number) && number >= 20 && number <= 30000);

  return weights.length ? Math.min(...weights) : null;
}

function parseThicknessMm(value) {
  const thicknesses = scalarStrings(value).flatMap((text) => {
    const plain = normalizeText(text).replace(/,/g, ".");
    return [...plain.matchAll(/(\d+(?:\.\d+)?)\s*mm\b/g)]
      .map((match) => Number(match[1]));
  }).filter((number) => Number.isFinite(number) && number >= 3 && number <= 30);

  return thicknesses.length ? Math.min(...thicknesses) : null;
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
  const categoryIdentity = normalizeText([
    detail.category,
    ...(Array.isArray(detail.categories) ? detail.categories : []),
  ].filter(Boolean).join(" "));
  const primaryCategory = normalizeText(detail.category);
  const isPhone = primaryCategory === "dien thoai";
  const isTablet = primaryCategory === "may tinh bang";
  const isLaptop = primaryCategory === "laptop";
  const ramGb = parseMemoryGb(valuesByLabel(rows, /(^|\b)(ram|bo nho ram|dung luong ram)(\b|$)/i));
  const storageGb = parseMemoryGb(valuesByLabel(rows, /bo nho trong|dung luong luu tru|dung luong o cung|o cung|storage|(^|\b)rom(\b|$)|(^|\b)ssd(\b|$)|(^|\b)hdd(\b|$)/i));
  // Chỉ đọc các dòng nói rõ kích thước/đường chéo. Nhãn chung "Màn hình"
  // còn chứa độ phân giải, độ sáng và tần số quét nên không được dùng để
  // suy ra số inch.
  const screenSizeInch = parseScreenSizeInch(valuesByLabel(
    rows,
    /kich thuoc (?:man hinh|display)|duong cheo man hinh|screen size|display size|display diagonal|thong so man hinh/i,
  ));
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
  const chipsetText = textByLabel(rows, /chipset|chip xu ly|bo vi xu ly|vi xu ly|processor|(^|\b)cpu(\b|$)/i);
  const weightGram = parseWeightGram(valuesByLabel(rows, /trong luong|khoi luong|weight/i));
  const thicknessMm = parseThicknessMm(valuesByLabel(rows, /do day|kich thuoc than may|kich thuoc|dimensions|thickness/i));
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
  ]);
  const combinedIdentity = `${productIdentity} ${categoryIdentity} ${specialFeatureText}`;
  const explicitGaming = /gaming|choi game|\bgame\b|rog phone|red\s*magic|black shark|legion phone|poco f\d|gt neo/.test(combinedIdentity);
  const highPerformance = /(?:apple\s*)?a(?:1[5-9]|2\d)(?:\s*pro)?\b|snapdragon\s*(?:8|7\+)|dimensity\s*(?:8|9)\d{3}|exynos\s*2\d{3}|tensor\s*g[3-9]|apple m[1-9]|core\s*(?:ultra\s*)?[789]|ryzen\s*[789]|rtx\s*\d{4}/.test(`${chipsetText} ${combinedIdentity}`)
    || (Number.isFinite(ramGb) && ramGb >= 12);
  const photographyScore = camera.reduce((score, tag) => score + ({
    ois: 1,
    zoom: 1,
    night: 1,
    "leica-zeiss-hasselblad": 1,
    ultrawide: 0.5,
    "4k": 0.5,
    "ai-camera": 0.25,
  }[tag] || 0), 0);
  const explicitCreator = /livestream|live stream|sang tao noi dung|content creator|creator laptop|studio/.test(combinedIdentity);
  const explicitOffice = /van phong|office|hoc tap|student|expertbook|probook|latitude|vostro/.test(combinedIdentity);
  const explicitDesign = /do hoa|thiet ke|ky thuat|workstation|creator|dci-p3|adobe rgb|rtx\s*\d{4}|quadro/.test(`${combinedIdentity} ${displayText} ${chipsetText}`);
  const explicitPremium = /cao cap|sang trong|premium|macbook pro|zenbook|spectre|xps|thinkpad x1/.test(combinedIdentity);
  const explicitKids = /tre em|kids|kid mode|parental control/.test(combinedIdentity);
  const explicitEntertainment = /giai tri|entertainment|dolby vision|dolby atmos/.test(combinedIdentity);
  const explicitStylus = /but cam ung|stylus|apple pencil|s pen|go paint/.test(combinedIdentity);
  const isIphone = /\biphone\b/.test(productIdentity);
  const isLargeIphone = isIphone && /(?:pro\s*max|plus)\b/.test(productIdentity);
  const isLongBatteryPhone = batteryCapacityMah >= LONG_BATTERY_PHONE_MIN_MAH
    || (isIphone && batteryCapacityMah >= 4300)
    || isLargeIphone;
  const isStrongLivestreamPhone = highPerformance
    && camera.includes("4k")
    && (camera.includes("ois") || camera.includes("ai-camera"));

  const usage = [];
  if (isPhone) {
    if (Number.isFinite(storageGb) && storageGb >= 256) usage.push("large-storage");
    if (highPerformance) usage.push("high-performance");
    if (explicitGaming || (highPerformance && refreshRateHz >= 120)) usage.push("gaming");
    if (isLongBatteryPhone) usage.push("long-battery");
    if (photographyScore >= 2) usage.push("photography");
    if (explicitCreator || isStrongLivestreamPhone) usage.push("livestream");
    if (Number.isFinite(screenSizeInch) && screenSizeInch <= 6.1) usage.push("compact");
    if (/mong nhe|thin and light|\bair\b/.test(combinedIdentity)
      || (Number.isFinite(weightGram) && weightGram <= 175)
      || (Number.isFinite(thicknessMm) && thicknessMm <= 7.5)) usage.push("lightweight");
  } else if (isTablet) {
    if (Number.isFinite(storageGb) && storageGb >= 256) usage.push("large-storage");
    if (highPerformance) usage.push("high-performance");
    if (explicitGaming || (highPerformance && refreshRateHz >= 120)) usage.push("gaming");
    if (batteryCapacityMah >= 7000) usage.push("long-battery");
    if (explicitOffice || explicitStylus || /kem ban phim|keyboard/.test(combinedIdentity)) usage.push("office-study");
    if (explicitEntertainment || (Number.isFinite(screenSizeInch) && screenSizeInch >= 10)) usage.push("entertainment");
    if (explicitDesign || explicitStylus) usage.push("design");
    if (explicitKids) usage.push("kids");
  } else if (isLaptop) {
    if (explicitGaming) usage.push("gaming");
    if (explicitOffice || (!explicitGaming && !explicitDesign)) usage.push("office-study");
    if (explicitPremium) usage.push("premium");
    if (/mong nhe|thin and light|ultrabook|\bair\b/.test(combinedIdentity)
      || (Number.isFinite(weightGram) && weightGram <= 1500)) usage.push("lightweight");
    if (explicitDesign) usage.push("design");
    if (explicitCreator) usage.push("creator");
  }

  return Object.fromEntries(Object.entries({
    ramGb,
    storageGb,
    screenSizeInch,
    refreshRateHz,
    batteryCapacityMah,
    weightGram,
    thicknessMm,
    chipsetName: chipsetText || null,
    display,
    camera,
    special,
    usage: uniqueValues(usage),
    specSource: rows.length ? "detailBlob/specifications" : "summary",
  }).filter(([, value]) => Array.isArray(value) ? value.length : value !== null && value !== undefined && value !== ""));
}

module.exports = {
  LONG_BATTERY_PHONE_MIN_MAH,
  buildProductSpecFacets,
  extractBatteryCapacityMah,
  parseBatteryCapacityMah,
};
