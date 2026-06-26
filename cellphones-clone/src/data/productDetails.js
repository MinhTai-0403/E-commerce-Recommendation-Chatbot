const djiPocketMediaBase = 'https://cdn2.cellphones.com.vn/x/media/catalog/product/m/a';

// Shape này cố ý bám sát document MongoDB sau này:
// _id của MongoDB có thể đi kèm, nhưng frontend luôn có fallback id/slug/sku ổn định.
// Admin chỉ cần CRUD các mảng media, variants, colors, specifications, articleSections.
export const productDetails = [
  {
    id: 'prod_dji_osmo_pocket_3_creator_combo',
    sku: 'may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k',
    slug: 'may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k',
    name: 'Camera DJI Osmo Pocket 3 Creator Combo',
    brand: 'DJI',
    categoryTrail: [
      { id: 'home', name: 'Trang chủ', href: '/' },
      { id: 'phu-kien', name: 'Phụ kiện', href: '#' },
      { id: 'camera', name: 'Camera', href: '#' },
      { id: 'dji', name: 'DJI', href: '#' },
    ],
    currentPrice: 12800000,
    originalPrice: 17990000,
    discount: 29,
    rating: 4.9,
    ratingCount: 15,
    installment: true,
    statusLabel: 'Đặt trước',
    city: 'Hồ Chí Minh',
    thumbnail: `${djiPocketMediaBase}/may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k_2.png`,
    media: [
      {
        id: 'video-review',
        type: 'video',
        label: 'Video',
        thumbnail: 'https://img.youtube.com/vi/_Bpwo7JlmII/maxresdefault.jpg',
        alt: 'Video đánh giá DJI Osmo Pocket 3 Creator Combo',
      },
      {
        id: 'gallery-main',
        type: 'image',
        label: 'Ảnh chính',
        src: `${djiPocketMediaBase}/may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k.png`,
        alt: 'Camera DJI Osmo Pocket 3 Creator Combo',
      },
      {
        id: 'gallery-ksp-8',
        type: 'image',
        label: 'Bộ combo',
        src: `${djiPocketMediaBase}/may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k-ksp_8_.png`,
        alt: 'Bộ phụ kiện DJI Osmo Pocket 3 Creator Combo',
      },
      {
        id: 'gallery-ksp-2',
        type: 'image',
        label: 'Phụ kiện',
        src: `${djiPocketMediaBase}/may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k-ksp_2_.png`,
        alt: 'Phụ kiện trong hộp DJI Osmo Pocket 3 Creator Combo',
      },
      {
        id: 'gallery-ksp-3',
        type: 'image',
        label: 'Thiết kế',
        src: `${djiPocketMediaBase}/may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k-ksp_3_.png`,
        alt: 'Thiết kế DJI Osmo Pocket 3',
      },
      {
        id: 'gallery-ksp-4',
        type: 'image',
        label: 'Quay vlog',
        src: `${djiPocketMediaBase}/may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k-ksp_4_.png`,
        alt: 'DJI Osmo Pocket 3 hỗ trợ quay vlog',
      },
      {
        id: 'gallery-ksp-6',
        type: 'image',
        label: 'Màn hình',
        src: `${djiPocketMediaBase}/may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k-ksp_6_.png`,
        alt: 'Màn hình cảm ứng DJI Osmo Pocket 3',
      },
    ],
    highlights: [
      'ActiveTrack 6.0 theo dõi chủ thể và giữ khung hình ổn định khi di chuyển.',
      'Cảm biến CMOS 1 inch hỗ trợ quay chụp tốt hơn trong nhiều điều kiện ánh sáng.',
      'Quay 4K/120fps, màu D-Log M và HLG 10-bit cho hậu kỳ linh hoạt.',
      'Combo đi kèm DJI Mic 2, tay cầm pin, chân máy mini và túi đựng.',
    ],
    variants: [
      {
        id: 'osmo-pocket-3-basic',
        name: 'Osmo Pocket 3',
        slug: 'dji-osmo-pocket-3',
        price: 11019000,
      },
      {
        id: 'osmo-pocket-3-creator-combo',
        name: 'Osmo Pocket 3 Creator Combo',
        slug: 'may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k',
        price: 12800000,
        active: true,
      },
    ],
    colors: [
      {
        id: 'black',
        name: 'Đen',
        price: 12800000,
        image: `${djiPocketMediaBase}/may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k_2.png`,
        active: true,
      },
    ],
    promotions: [
      {
        id: 'installment-zero',
        title: 'Trả góp 0%',
        description: 'Hỗ trợ trả góp linh hoạt qua thẻ hoặc công ty tài chính.',
      },
      {
        id: 'smember',
        title: 'Ưu đãi Smember',
        description: 'Giảm thêm cho thành viên Smember theo hạng tài khoản.',
      },
      {
        id: 'fast-delivery',
        title: 'Giao nhanh 2 giờ',
        description: 'Áp dụng tại khu vực còn hàng trong nội thành.',
      },
    ],
    relatedProducts: [
      {
        id: 'prod_dji_osmo_pocket_3_basic',
        sku: 'dji-osmo-pocket-3',
        slug: 'dji-osmo-pocket-3',
        name: 'DJI Osmo Pocket 3',
        image: `${djiPocketMediaBase}/may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k_1_.png`,
        currentPrice: 11019000,
        originalPrice: 13990000,
        discount: 21,
        rating: 5,
        ratingCount: 8,
        installment: true,
      },
      {
        id: 'prod_dji_osmo_pocket_3_accessory_combo',
        sku: 'bo-phu-kien-dji-osmo-pocket-3-creator',
        slug: 'bo-phu-kien-dji-osmo-pocket-3-creator',
        name: 'Bộ phụ kiện quay vlog DJI Pocket 3',
        image: `${djiPocketMediaBase}/may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k-ksp_8_.png`,
        currentPrice: 2790000,
        originalPrice: 3490000,
        discount: 20,
        rating: 4.8,
        ratingCount: 32,
        installment: false,
      },
      {
        id: 'prod_dji_mic_2_pocket_3',
        sku: 'micro-khong-day-dji-mic-2-pocket-3',
        slug: 'micro-khong-day-dji-mic-2-pocket-3',
        name: 'Micro không dây DJI Mic 2 cho Pocket 3',
        image: `${djiPocketMediaBase}/may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k-ksp_2_.png`,
        currentPrice: 2490000,
        originalPrice: 3190000,
        discount: 22,
        rating: 4.9,
        ratingCount: 24,
        installment: false,
      },
      {
        id: 'prod_osmo_pocket_3_battery_handle',
        sku: 'tay-cam-pin-dji-osmo-pocket-3',
        slug: 'tay-cam-pin-dji-osmo-pocket-3',
        name: 'Tay cầm pin DJI Osmo Pocket 3',
        image: `${djiPocketMediaBase}/may-quay-chong-rung-dji-osmo-pocket-3-advanced-4k-ksp_6_.png`,
        currentPrice: 1890000,
        originalPrice: 2490000,
        discount: 24,
        rating: 4.8,
        ratingCount: 19,
        installment: false,
      },
    ],
    policies: [
      { id: 'official', title: 'Hàng chính hãng', description: 'Xuất VAT đầy đủ, bảo hành theo chính sách hãng.' },
      { id: 'return', title: '1 đổi 1 nhanh', description: 'Hỗ trợ kiểm tra và đổi mới khi sản phẩm lỗi đủ điều kiện.' },
      { id: 'store-test', title: 'Test tại cửa hàng', description: 'Có thể kiểm tra máy trực tiếp trước khi nhận hàng.' },
    ],
    specifications: [
      {
        id: 'camera',
        groupName: 'Camera',
        rows: [
          { id: 'camera-line', label: 'Dòng camera', value: 'Camera hành động' },
          { id: 'sensor', label: 'Cảm biến', value: 'CMOS 1 inch' },
          { id: 'stabilization', label: 'Chống rung', value: 'Chống rung 3 trục, ActiveTrack 6.0' },
          { id: 'zoom', label: 'Zoom', value: 'Zoom kỹ thuật số 4x' },
        ],
      },
      {
        id: 'screen',
        groupName: 'Màn hình',
        rows: [
          { id: 'display', label: 'Thông số màn hình', value: ['Màn hình cảm ứng 2.0 inch', 'Độ phân giải 314×556', 'Độ sáng 700 nits'] },
        ],
      },
      {
        id: 'video',
        groupName: 'Video',
        rows: [
          { id: 'video-resolution', label: 'Độ phân giải quay', value: ['4K 16:9: 3840×2160 đến 60fps', '2.7K 16:9: 2688×1512 đến 60fps', '1080p 16:9: 1920×1080 đến 60fps'] },
          { id: 'slow-motion', label: 'Slow motion', value: '4K/120fps, hỗ trợ Glamour Effects 2.0' },
          { id: 'color-profile', label: 'Màu sắc', value: 'D-Log M và HLG 10-bit' },
        ],
      },
      {
        id: 'battery-connectivity',
        groupName: 'Pin và kết nối',
        rows: [
          { id: 'battery', label: 'Pin', value: '1300 mAh' },
          { id: 'wireless', label: 'Kết nối không dây', value: ['Bluetooth', 'Wi‑Fi'] },
          { id: 'accessory-port', label: 'Kết nối phụ kiện rời', value: 'Có' },
          { id: 'app', label: 'Ứng dụng', value: 'DJI Mimo' },
          { id: 'memory', label: 'Thẻ nhớ', value: 'microSD tối đa 512GB' },
        ],
      },
      {
        id: 'body',
        groupName: 'Thiết kế',
        rows: [
          { id: 'size', label: 'Kích thước', value: '139.7 × 42.2 × 33.5 mm' },
          { id: 'weight', label: 'Khối lượng', value: '179 g' },
          { id: 'manufacturer', label: 'Hãng sản xuất', value: 'DJI' },
        ],
      },
    ],
    articleSections: [
      {
        id: 'overview',
        heading: 'Đặc điểm nổi bật',
        paragraphs: [
          'DJI Osmo Pocket 3 Creator Combo là bộ máy quay bỏ túi dành cho vlog, du lịch và sáng tạo nội dung. Điểm mạnh của máy nằm ở cảm biến lớn, chống rung 3 trục và bộ phụ kiện Creator Combo giúp quay hình, thu âm, dựng góc máy linh hoạt hơn.',
        ],
      },
      {
        id: 'compare-basic',
        heading: 'So sánh DJI Pocket 3 Creator Combo với bản Basic',
        paragraphs: [
          'Bản Creator Combo phù hợp hơn nếu bạn cần thu âm không dây, quay ngoài trời nhiều hoặc muốn có sẵn chân máy, tay cầm pin và túi đựng. Bản Basic gọn chi phí hơn nhưng phụ kiện đi kèm ít hơn.',
        ],
        table: {
          headers: ['Phụ kiện', 'Creator Combo', 'Basic'],
          rows: [
            ['Osmo Pocket 3', '1', '1'],
            ['Cáp Type‑C to Type‑C', '1', '1'],
            ['Vỏ bảo vệ và dây đeo', '1', '1'],
            ['Ống kính góc rộng', '1', '0'],
            ['DJI Mic 2', '1', '0'],
            ['Tay cầm pin', '1', '0'],
            ['Chân máy mini và túi đựng', '1', '0'],
          ],
        },
        image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:0/q:100/plain/https://cellphones.com.vn/media/wysiwyg/camera/camera-hanh-trinh/DJI/dji-osmo-pocket-3-advanced-4k-6.jpg',
        imageAlt: 'So sánh bộ phụ kiện DJI Osmo Pocket 3 Creator Combo',
      },
      {
        id: 'stabilization',
        heading: 'Chống rung 3 trục, quay ổn định khi di chuyển',
        paragraphs: [
          'Cụm gimbal 3 trục giúp khung hình mượt hơn khi cầm tay quay phố, du lịch hoặc chạy theo chủ thể. ActiveTrack 6.0 giúp máy bám đối tượng tốt hơn, rất hợp cho vlog một người.',
        ],
        image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:0/q:100/plain/https://cellphones.com.vn/media/wysiwyg/camera/camera-hanh-trinh/DJI/dji-osmo-pocket-3-advanced-4k-5.jpg',
        imageAlt: 'DJI Osmo Pocket 3 chống rung khi di chuyển',
      },
      {
        id: 'screen-recording',
        heading: 'Màn hình xoay và chất lượng quay 4K',
        paragraphs: [
          'Màn hình cảm ứng 2 inch xoay ngang dọc giúp đổi khung hình nhanh. Máy hỗ trợ quay 4K, màu 10-bit và các chế độ chuyển động chậm để dùng được cả video thường ngày lẫn hậu kỳ nghiêm túc hơn.',
        ],
        image: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:0/q:100/plain/https://cellphones.com.vn/media/wysiwyg/camera/camera-hanh-trinh/DJI/dji-osmo-pocket-3-advanced-4k-3.jpg',
        imageAlt: 'Màn hình cảm ứng xoay của DJI Osmo Pocket 3',
      },
    ],
    faqs: [
      {
        id: 'included-items',
        question: 'DJI Osmo Pocket 3 Creator Combo gồm những gì?',
        answer: 'Combo gồm Osmo Pocket 3, DJI Mic 2, tay cầm pin, chân máy mini, túi đựng và một số phụ kiện hỗ trợ quay.',
      },
      {
        id: 'who-should-buy',
        question: 'Ai nên chọn bản Creator Combo?',
        answer: 'Người quay vlog, review sản phẩm, du lịch hoặc cần thu âm tốt nên chọn bản Creator Combo vì bộ phụ kiện đầy đủ hơn.',
      },
    ],
  },
];
