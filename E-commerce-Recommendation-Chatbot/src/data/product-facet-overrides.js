const PRODUCT_FACET_OVERRIDES = [
  {
    id: "iphone-17-pro-max",
    match: /(?:^|\s)iphone 17 pro max(?:\s|$)|(?:^|-)iphone-17-pro-max(?:-|$)/i,
    facets: {
      ramGb: 12,
      chipset: "apple-a",
      chipsetName: "Chip A19 Pro",
    },
    sources: {
      ramGb: "https://cellphones.com.vn/iphone-17-pro-max.html",
      chipset: "https://www.apple.com/vn/iphone-17-pro/specs/",
    },
    verifiedAt: "2026-07-15",
  },
];

function getProductFacetOverride(detail = {}) {
  const identity = [detail.name, detail.productName, detail.title, detail.slug, detail.sku]
    .filter(Boolean)
    .join(" ");
  return PRODUCT_FACET_OVERRIDES.find((entry) => entry.match.test(identity)) || null;
}

module.exports = {
  PRODUCT_FACET_OVERRIDES,
  getProductFacetOverride,
};
