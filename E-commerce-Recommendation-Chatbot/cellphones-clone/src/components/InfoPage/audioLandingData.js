import {
  AUDIO_BRANDS,
  KARAOKE_MIC_BRANDS,
  MICROPHONE_BRANDS,
  SPEAKER_BRANDS,
} from "../HeroSection/brandData";

const cdnBanner = (path) =>
  `https://cdn2.cellphones.com.vn/insecure/rs:fill:595:100/q:100/plain/https://media-asset.cellphones.com.vn/${path}`;

const audioCardImages = {
  headphones:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/chup-taii.png",
  speakers:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/loa-cate.png",
  recordingMic:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/micthu.png",
  karaokeMic:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/karaoke.png",
  turntable:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/image-removebg-preview_43_.png",
  wired:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/coday.png",
  gaming:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/gaming-removebg-preview.png",
  sport:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/thethao-removebg-preview.png",
  monitoring:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/kiem-amm.png",
  translator:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Am-thanh/Tai-nghe/AI-phien-dich_1_.png",
  sub: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Am-thanh/Loa/loa-sub-tram.png",
  column:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Am-thanh/loa-cot.png",
  soundbar:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Am-thanh/Loa/image-removebg-preview_19_1.png",
  live: "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Web/icon/loanhacsong-2026.png",
  bluetoothSpeaker:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:150/q:100/plain/https://cellphones.com.vn/media/wysiwyg/loa-bluetooth.png",
  clipOn:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/kep.png",
  studio:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/phongthu.png",
  livestream:
    "https://cdn2.cellphones.com.vn/insecure/rs:fill:150:0/q:70/plain/https://cellphones.com.vn/media/wysiwyg/micthu.png",
};

const compact = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const mergeUniqueBrands = (...groups) => {
  const seen = new Set();

  return groups.flat().filter((brand) => {
    const key = compact(brand?.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const ALL_AUDIO_FILTER_BRANDS = mergeUniqueBrands(
  AUDIO_BRANDS,
  SPEAKER_BRANDS,
  MICROPHONE_BRANDS,
  KARAOKE_MIC_BRANDS,
);

const getAudioFilterBrands = (profile = {}) =>
  Array.isArray(profile.brands) && profile.brands.length > 0
    ? profile.brands
    : ALL_AUDIO_FILTER_BRANDS;

export const audioCategoryCriteria = [
  { id: "all", label: "Bộ lọc", icon: "filter", dropdown: true },
  {
    id: "in-stock",
    label: "Sẵn hàng",
    icon: "truck",
    filter: "in-stock",
    inStock: true,
  },
  {
    id: "new",
    label: "Hàng mới về",
    icon: "new",
    filter: "new",
    sort: "latest",
  },
  {
    id: "price",
    label: "Xem theo giá",
    icon: "price",
    filter: "price",
    sort: "price_asc",
    dropdown: true,
  },
  {
    id: "brand",
    label: "Hãng sản xuất",
    icon: "brand",
    facet: "brand",
    dropdown: true,
  },
  {
    id: "audio-feature",
    label: "Tính năng",
    icon: "special",
    facet: "audio-feature",
    dropdown: true,
  },
  {
    id: "audio-connection",
    label: "Cổng kết nối",
    icon: "nfc",
    facet: "audio-connection",
    dropdown: true,
  },
  {
    id: "audio-usage",
    label: "Nhu cầu sử dụng",
    icon: "usage",
    facet: "audio-usage",
    dropdown: true,
  },
  {
    id: "audio-power",
    label: "Công suất",
    icon: "chipset",
    facet: "audio-power",
    dropdown: true,
  },
  {
    id: "audio-type",
    label: "Loại sản phẩm",
    icon: "phoneType",
    facet: "audio-type",
    dropdown: true,
  },
];

const headphoneTypeCards = [
  {
    label: "Bluetooth",
    audioType: "Bluetooth",
    href: "/thiet-bi-am-thanh/tai-nghe/tai-nghe-bluetooth.html",
    image: audioCardImages.headphones,
  },
  { label: "Có dây", audioType: "Có dây", image: audioCardImages.wired },
  {
    label: "Chụp tai",
    audioType: "Chụp tai",
    image: audioCardImages.headphones,
  },
  {
    label: "Nhét tai",
    audioType: "Nhét tai",
    image: audioCardImages.recordingMic,
  },
  { label: "Gaming", audioUsage: "Gaming", image: audioCardImages.gaming },
  { label: "Thể thao", audioUsage: "Thể thao", image: audioCardImages.sport },
  {
    label: "Kiểm âm",
    audioUsage: "Kiểm âm",
    image: audioCardImages.monitoring,
  },
  {
    label: "Phiên dịch",
    audioUsage: "Phiên dịch",
    image: audioCardImages.translator,
  },
];

const speakerTypeCards = [
  {
    label: "Loa bluetooth",
    audioType: "Loa bluetooth",
    image: audioCardImages.bluetoothSpeaker,
  },
  {
    label: "Loa Karaoke",
    audioType: "Loa karaoke",
    image: audioCardImages.speakers,
  },
  {
    label: "Loa Soundbar",
    audioType: "Soundbar",
    image: audioCardImages.soundbar,
  },
  {
    label: "Loa vi tính",
    audioType: "Loa vi tính",
    image: audioCardImages.speakers,
  },
  { label: "Loa Sub", audioType: "Loa sub", image: audioCardImages.sub },
  { label: "Loa cột", audioType: "Loa cột", image: audioCardImages.column },
  {
    label: "Loa kiểm âm",
    audioUsage: "Kiểm âm",
    image: audioCardImages.monitoring,
  },
  {
    label: "Loa nhạc sống",
    audioUsage: "Nhạc sống",
    image: audioCardImages.live,
  },
  {
    label: "Loa trợ giảng",
    audioType: "Loa trợ giảng",
    image: audioCardImages.speakers,
  },
];

const audioHubCards = [
  {
    label: "Tai nghe",
    href: "/thiet-bi-am-thanh/tai-nghe.html",
    image: audioCardImages.headphones,
  },
  {
    label: "Loa",
    href: "/thiet-bi-am-thanh/loa.html",
    image: audioCardImages.speakers,
  },
  {
    label: "Mic thu âm",
    href: "/thiet-bi-am-thanh/micro-thu-am.html",
    image: audioCardImages.recordingMic,
  },
  {
    label: "Mic Karaoke",
    href: "/thiet-bi-am-thanh/micro.html",
    image: audioCardImages.karaokeMic,
  },
  {
    label: "Đầu đĩa than",
    href: "/thiet-bi-am-thanh/dia-than.html",
    image: audioCardImages.turntable,
  },
];

const micNeedCards = [
  { label: "Cài áo", audioUsage: "Cài áo", image: audioCardImages.clipOn },
  {
    label: "Podcast / Phòng thu",
    audioUsage: "Podcast",
    image: audioCardImages.studio,
  },
  {
    label: "Livestream",
    audioUsage: "Livestream",
    image: audioCardImages.livestream,
  },
];

const profiles = [
  {
    key: "audio-root",
    paths: ["/thiet-bi-am-thanh.html"],
    title: "Thiết bị âm thanh",
    category: "Âm thanh",
    brandTitle: "Danh mục âm thanh",
    brands: [],
    cardsTitle: "Chọn loại sản phẩm",
    cards: audioHubCards,
    banners: [
      [
        {
          name: "Tai nghe Xiaomi",
          image: cdnBanner(
            "dashboard-v1/manage-banner/tai-nghe-chup-tai-xiaomi-redmi-neo.jpg",
          ),
          href: "/tai-nghe-chup-tai-xiaomi-redmi-neo.html",
        },
      ],
      [
        {
          name: "Loa Sony ULT Field",
          image: cdnBanner(
            "dashboard-v1/manage-banner/loa-bluetooth-sony-ult-field.jpg",
          ),
          href: "/loa-bluetooth-sony-ult-field-3.html",
        },
      ],
    ],
    railCategory: "Âm thanh",
  },
  {
    key: "headphones",
    paths: ["/thiet-bi-am-thanh/tai-nghe.html"],
    title: "Tai nghe",
    category: "Tai nghe",
    brandTitle: "Tai nghe",
    brands: AUDIO_BRANDS,
    cardsTitle: "Chọn loại tai nghe",
    cards: headphoneTypeCards,
    banners: [
      [
        {
          name: "Redmi Headphones Neo",
          image: cdnBanner(
            "dashboard-v1/manage-banner/tai-nghe-chup-tai-xiaomi-redmi-neo.jpg",
          ),
          href: "/tai-nghe-chup-tai-xiaomi-redmi-neo.html",
        },
      ],
      [
        {
          name: "Galaxy Buds 3 Pro",
          image: cdnBanner(
            "dashboard-v1/manage-banner/tai-nghe-samsung-galaxy-buds-3-pro-t5.jpg",
          ),
          href: "/tai-nghe-samsung-galaxy-buds-3-pro.html",
        },
      ],
    ],
    railCategory: "Tai nghe",
  },
  {
    key: "airpods",
    paths: ["/thiet-bi-am-thanh/tai-nghe/apple.html"],
    title: "Tai nghe AirPods",
    category: "Tai nghe",
    brand: "apple",
    cardsTitle: "Dòng sản phẩm",
    cards: [
      {
        label: "AirPods Pro",
        audioLine: "AirPods Pro",
        image: audioCardImages.headphones,
      },
    ],
    banners: [
      [
        {
          name: "AirPods 4",
          image: cdnBanner("dashboard-v1/manage-banner/airpods4-pro-2026.png"),
          href: "/apple-airpods-4.html",
        },
      ],
      [
        {
          name: "AirPods Pro 3",
          image: cdnBanner("dashboard-v1/manage-banner/airpods3-2026.png"),
          href: "/apple-airpods-pro-3.html",
        },
      ],
    ],
    railCategory: "Tai nghe",
    railBrand: "apple",
  },
  {
    key: "bluetooth-headphones",
    paths: ["/thiet-bi-am-thanh/tai-nghe/tai-nghe-bluetooth.html"],
    title: "Tai nghe Bluetooth",
    category: "Tai nghe Bluetooth",
    brandTitle: "Tai nghe Bluetooth",
    brands: AUDIO_BRANDS,
    banners: [
      [
        {
          name: "Redmi Headphones Neo",
          image: cdnBanner(
            "dashboard-v1/manage-banner/tai-nghe-chup-tai-xiaomi-redmi-neo.jpg",
          ),
          href: "/tai-nghe-chup-tai-xiaomi-redmi-neo.html",
        },
      ],
      [
        {
          name: "Loa LC900",
          image: cdnBanner("dashboard-v1/595x100-lc900.jpg"),
          href: "/loa-karaoke-paramax-lc900.html",
        },
      ],
    ],
    railCategory: "Tai nghe Bluetooth",
  },
  {
    key: "speakers",
    paths: ["/thiet-bi-am-thanh/loa.html"],
    title: "Loa",
    category: "Loa",
    brandTitle: "Loa",
    brands: SPEAKER_BRANDS,
    cardsTitle: "Chọn loại loa",
    cards: speakerTypeCards,
    banners: [
      [
        {
          name: "Loa Edifier",
          image: cdnBanner("dashboard-v1/manage-banner/loa-edifer-2026.jpg"),
          href: "/thiet-bi-am-thanh/loa/edifier.html",
        },
      ],
      [
        {
          name: "Sony ULT Field",
          image: cdnBanner(
            "dashboard-v1/manage-banner/loa-bluetooth-sony-ult-field.jpg",
          ),
          href: "/loa-bluetooth-sony-ult-field-3.html",
        },
      ],
    ],
    railCategory: "Loa",
  },
  {
    key: "recording-mic",
    paths: ["/thiet-bi-am-thanh/micro-thu-am.html"],
    title: "Microphone thu âm không dây",
    category: "Micro thu âm",
    brandTitle: "Microphone thu âm không dây",
    brands: MICROPHONE_BRANDS,
    cardsTitle: "Nhu cầu sử dụng",
    cards: micNeedCards,
    banners: [
      [
        {
          name: "GoChek Ultra S24",
          image: cdnBanner("dashboard-v1/mic-gochek.png"),
          href: "/micro-thu-am-gochek-ultra-s24.html",
        },
      ],
      [
        {
          name: "Boya K3",
          image: cdnBanner("dashboard-v1/mic-boya.png"),
          href: "/micro-thu-am-boya-k3.html",
        },
      ],
    ],
    railCategory: "Micro thu âm",
    railTitle: "SẢN PHẨM NỔI BẬT",
  },
  {
    key: "karaoke-mic",
    paths: ["/thiet-bi-am-thanh/micro.html"],
    title: "Micro không dây Karaoke",
    category: "Micro không dây",
    brandTitle: "Micro không dây Karaoke",
    brands: KARAOKE_MIC_BRANDS,
    railCategory: "Micro không dây",
  },
  {
    key: "turntable",
    paths: ["/thiet-bi-am-thanh/dia-than.html"],
    title: "Đĩa than",
    category: "Đĩa than",
    brandTitle: "Đĩa than",
    brands: [{ name: "JBL" }, { name: "TEAC" }],
    banners: [
      [
        {
          name: "Đĩa than TEAC",
          image: cdnBanner("dashboard-v1/manage-banner/dia-than-teac.jpg"),
          href: "/dau-dia-than-teac-tn-180bt-a3.html",
        },
      ],
      [
        {
          name: "Đĩa than TEAC",
          image: cdnBanner("dashboard-v1/manage-banner/dia-than-teac.jpg"),
          href: "/dau-dia-than-teac-tn-180bt-a3.html",
        },
      ],
    ],
    railCategory: "Đĩa than",
  },
];

export const audioFilterGroups = {
  brand: (profile = {}) => [
    {
      title: "Hãng sản xuất",
      param: "brand",
      options: getAudioFilterBrands(profile).map((brand) => ({
        label: brand.name,
        value: compact(brand.name === "AirPods" ? "apple" : brand.name),
        logo: brand.logo || "",
      })),
    },
  ],
  "audio-feature": [
    {
      title: "Tính năng",
      param: "audioFeature",
      options: [
        "Chống ồn",
        "Chống nước",
        "Có mic",
        "Âm thanh Hi-Res",
        "Gaming",
        "Karaoke",
      ].map((value) => ({ label: value, value })),
    },
  ],
  "audio-connection": [
    {
      title: "Cổng kết nối",
      param: "audioConnection",
      options: [
        "Bluetooth",
        "USB-C",
        "Lightning",
        "Jack 3.5mm",
        "USB-A",
        "HDMI",
        "Optical",
      ].map((value) => ({ label: value, value })),
    },
  ],
  "audio-usage": [
    {
      title: "Nhu cầu sử dụng",
      param: "audioUsage",
      options: [
        "Gaming",
        "Thể thao",
        "Kiểm âm",
        "Podcast",
        "Livestream",
        "Cài áo",
        "Karaoke",
        "Du lịch",
      ].map((value) => ({ label: value, value })),
    },
  ],
  "audio-power": [
    {
      title: "Công suất",
      param: "audioPower",
      options: ["Dưới 10W", "10W - 30W", "30W - 100W", "Trên 100W"].map(
        (value) => ({ label: value, value }),
      ),
    },
  ],
  "audio-type": (profile = {}) => {
    const key = profile.key || "";
    // Nếu đứng ở trang Tai nghe
    if (["headphones", "bluetooth-headphones", "airpods"].includes(key)) {
      return [
        {
          title: "Loại tai nghe",
          param: "audioType",
          options: ["Bluetooth", "Có dây", "Chụp tai", "Nhét tai"].map((v) => ({
            label: v,
            value: v,
          })),
        },
      ];
    }
    // Nếu đứng ở trang Loa
    if (key === "speakers") {
      return [
        {
          title: "Loại loa",
          param: "audioType",
          options: [
            "Loa bluetooth",
            "Loa karaoke",
            "Soundbar",
            "Loa vi tính",
            "Loa sub",
            "Loa cột",
            "Loa trợ giảng",
          ].map((v) => ({ label: v, value: v })),
        },
      ];
    }
    // Ngược lại (Trang root Âm thanh tổng) mới hiện tất cả
    return [
      {
        title: "Loại sản phẩm",
        param: "audioType",
        options: [
          "Tai nghe Bluetooth",
          "Tai nghe có dây",
          "Tai nghe chụp tai",
          "Tai nghe nhét tai",
          "Loa bluetooth",
          "Loa karaoke",
          "Soundbar",
          "Loa vi tính",
          "Micro thu âm",
          "Micro karaoke",
          "Đĩa than",
        ].map((v) => ({ label: v, value: v })),
      },
    ];
  },
  "audio-design": [
    {
      title: "Thiết kế",
      param: "audioDesign",
      options: ["In-ear", "Earbuds", "Over-ear", "On-ear", "True Wireless"].map(
        (value) => ({ label: value, value }),
      ),
    },
  ],
  "audio-line": [
    {
      title: "Dòng tai nghe",
      param: "audioLine",
      options: ["AirPods Pro", "AirPods 4", "AirPods Max", "AirPods 3"].map(
        (value) => ({ label: value, value }),
      ),
    },
  ],
};

export function getAudioLandingProfile(page = {}) {
  const path = page.path || "";
  const normalizedCategory = compact(
    page.category || page.categoryParam || page.keyword || page.title,
  );
  return (
    profiles.find((profile) => profile.paths.includes(path)) ||
    profiles.find(
      (profile) => compact(profile.category) === normalizedCategory,
    ) ||
    null
  );
}

export function getAudioCategoryCriteriaForProfile(profile) {
  if (!profile) return audioCategoryCriteria;
  const key = profile.key || "";

  if (key === "airpods") {
    return audioCategoryCriteria
      .filter((item) => !["audio-power", "audio-type"].includes(item.id))
      .concat([
        {
          id: "audio-design",
          label: "Thiết kế",
          icon: "display",
          facet: "audio-design",
          dropdown: true,
        },
        {
          id: "audio-line",
          label: "Dòng tai nghe",
          icon: "phoneType",
          facet: "audio-line",
          dropdown: true,
        },
      ]);
  }
  // Loại bỏ hoàn toàn bộ lọc "Công suất" khi xem Tai nghe
  if (["headphones", "bluetooth-headphones"].includes(key)) {
    return audioCategoryCriteria.filter((item) => item.id !== "audio-power");
  }
  // Loại bỏ các bộ lọc đặc thù không liên quan cho phân hệ hẹp
  if (key === "karaoke-mic" || key === "turntable") {
    return audioCategoryCriteria.filter((item) =>
      ["all", "in-stock", "new", "price", "brand"].includes(item.id),
    );
  }
  if (key === "recording-mic") {
    return audioCategoryCriteria.filter((item) =>
      [
        "all",
        "in-stock",
        "new",
        "price",
        "brand",
        "audio-type",
        "audio-usage",
      ].includes(item.id),
    );
  }
  return audioCategoryCriteria;
}
