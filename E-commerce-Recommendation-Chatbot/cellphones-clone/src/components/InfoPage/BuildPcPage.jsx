import { useMemo, useState } from "react";
import { formatPrice } from "../../data/mockData";
import { useApiProducts } from "../../hooks/useApiProducts";
import "./BuildPcPage.css";

const slots = [
  ["cpu", "CPU", "CPU"],
  ["mainboard", "Mainboard", "Mainboard"],
  ["ram", "RAM", "RAM"],
  ["ssd", "Ổ cứng SSD", "SSD"],
  ["hdd", "Ổ cứng HDD", "HDD"],
  ["gpu", "Card màn hình", "GPU"],
  ["case", "Case máy tính", "Case"],
  ["psu", "Nguồn máy tính", "PSU"],
  ["cooler", "Tản nhiệt CPU", "Cooling"],
  ["monitor", "Màn hình", "Màn hình"],
  ["mouse", "Chuột", "Chuột"],
  ["keyboard", "Bàn phím", "Bàn phím"],
  ["headphone", "Tai nghe", "Tai nghe"],
];

const presets = [
  ["PC Gaming", "Gaming", "🎮"],
  ["PC Đồ họa", "Đồ họa", "🎨"],
  ["PC Văn phòng - Học tập", "Văn phòng", "🧑‍💻"],
  ["PC AI", "AI", "✨"],
];

const faq = [
  [
    "Build PC cần chọn linh kiện theo thứ tự nào?",
    "Bạn nên chọn CPU và mainboard trước, sau đó RAM, card đồ họa, nguồn, lưu trữ, tản nhiệt và case. Hệ thống sẽ giữ các lựa chọn và tính tổng tiền tự động.",
  ],
  [
    "Làm sao biết linh kiện có tương thích?",
    "Cần đối chiếu socket CPU/mainboard, chuẩn RAM, kích thước case, công suất nguồn và kích thước card đồ họa. Khi dữ liệu thông số MongoDB đầy đủ, hệ thống ưu tiên chỉ hiển thị linh kiện tương thích.",
  ],
  [
    "Có thể thay đổi hoặc xóa linh kiện đã chọn không?",
    "Có. Bạn có thể thay đổi, tăng giảm số lượng hoặc xóa từng linh kiện trước khi thêm cấu hình vào giỏ hàng.",
  ],
];

function ProductPicker({ slot, onClose, onSelect }) {
  const [brand, setBrand] = useState("");
  const [search, setSearch] = useState("");
  const query = useMemo(
    () => ({
      category: slot[2] === "Màn hình" ? "Màn hình" : "Linh kiện máy tính",
      productType: slot[2],
      brand,
      q: search,
      include: "details",
      displayLimit: 40,
      fetchLimit: 120,
      sort: "latest",
    }),
    [brand, search, slot],
  );
  const { products, loading, error } = useApiProducts(query, []);
  const brands = [
    ...new Set(products.map((item) => item.brand).filter(Boolean)),
  ];

  return (
    <div className="build-pc-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="build-pc-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>{slot[1]}</h2>
            <small>Sản phẩm lấy trực tiếp từ MongoDB</small>
          </div>
          <button onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </header>
        <div className="build-pc-modal-tools">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Bạn cần tìm gì?"
          />
          <select
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
          >
            <option value="">Tất cả thương hiệu</option>
            {brands.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        {loading && <p className="build-pc-status">Đang tải sản phẩm…</p>}
        {error && (
          <p className="build-pc-status error">
            Không thể tải sản phẩm: {error.message}
          </p>
        )}
        {!loading && !products.length && (
          <p className="build-pc-status">
            Chưa có sản phẩm khớp chính xác trong MongoDB.
          </p>
        )}
        <div className="build-pc-product-grid">
          {products.map((product) => (
            <article key={product.id || product.slug}>
              <img src={product.image} alt={product.name} />
              <h3>{product.name}</h3>
              <strong>{formatPrice(product.currentPrice)}</strong>
              <button onClick={() => onSelect(product)}>Chọn</button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function BuildPcPage() {
  const [activeSlot, setActiveSlot] = useState(null);
  const [selected, setSelected] = useState({});
  const [activePreset, setActivePreset] = useState("PC Gaming");
  const total = Object.values(selected).reduce(
    (sum, entry) =>
      sum + (Number(entry.product.currentPrice) || 0) * entry.quantity,
    0,
  );

  const chooseProduct = (product) => {
    setSelected((current) => ({
      ...current,
      [activeSlot[0]]: { product, quantity: 1 },
    }));
    setActiveSlot(null);
  };

  return (
    <div className="build-pc-page">
      <nav className="build-pc-breadcrumb">
        <a href="/">Trang chủ</a>
        <span>/</span>
        <a href="/may-tinh-de-ban.html">Máy tính để bàn</a>
        <span>/</span>
        <b>Build PC</b>
      </nav>
      <div className="build-pc-hero">
        <div>
          <span>PC CPS</span>
          <h1>TỰ BUILD PC THEO NHU CẦU</h1>
          <p>Tư vấn cấu hình · Lắp đặt miễn phí · Dữ liệu sản phẩm MongoDB</p>
        </div>
      </div>
      <h2>Gợi ý cấu hình PC theo nhu cầu</h2>
      <div className="build-pc-presets">
        {presets.map(([label, usage, icon]) => (
          <button
            key={label}
            className={activePreset === label ? "active" : ""}
            onClick={() => setActivePreset(label)}
          >
            <span>{icon}</span>
            <b>{label}</b>
            <small>{usage}</small>
          </button>
        ))}
      </div>
      <div className="build-pc-layout">
        <section className="build-pc-config">
          <div className="build-pc-heading">
            <div>
              <h2>Build PC</h2>
              <p>Chọn các linh kiện để xây dựng cấu hình {activePreset}</p>
            </div>
            <button onClick={() => setSelected({})}>↻ Chọn lại từ đầu</button>
          </div>
          {slots.map((slot) => {
            const entry = selected[slot[0]];
            return (
              <article className="build-pc-slot" key={slot[0]}>
                <div className="build-pc-slot-icon">
                  {entry ? <img src={entry.product.image} alt="" /> : "▣"}
                </div>
                <div className="build-pc-slot-info">
                  {entry ? (
                    <>
                      <b>{entry.product.name}</b>
                      <strong>{formatPrice(entry.product.currentPrice)}</strong>
                      <div className="build-pc-quantity">
                        <button
                          onClick={() =>
                            setSelected((current) => ({
                              ...current,
                              [slot[0]]: {
                                ...entry,
                                quantity: Math.max(1, entry.quantity - 1),
                              },
                            }))
                          }
                        >
                          −
                        </button>
                        <span>{entry.quantity}</span>
                        <button
                          onClick={() =>
                            setSelected((current) => ({
                              ...current,
                              [slot[0]]: {
                                ...entry,
                                quantity: entry.quantity + 1,
                              },
                            }))
                          }
                        >
                          +
                        </button>
                        <button
                          className="remove"
                          onClick={() =>
                            setSelected((current) => {
                              const next = { ...current };
                              delete next[slot[0]];
                              return next;
                            })
                          }
                        >
                          Xóa
                        </button>
                      </div>
                    </>
                  ) : (
                    <b>{slot[1]}</b>
                  )}
                </div>
                <button
                  className="build-pc-select"
                  onClick={() => setActiveSlot(slot)}
                >
                  {entry ? "Thay đổi" : "Chọn"}
                </button>
              </article>
            );
          })}
        </section>
        <aside className="build-pc-summary">
          <h3>Tạm tính</h3>
          <strong>{formatPrice(total)}</strong>
          <p>Giá cấu hình được cập nhật theo sản phẩm đang có trong MongoDB.</p>
          <button disabled={!total}>Thêm cấu hình vào giỏ</button>
          <button className="outline" disabled={!total}>
            Mua ngay
          </button>
        </aside>
      </div>
      <section className="build-pc-faq">
        <h2>Câu hỏi thường gặp</h2>
        {faq.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
      <section className="build-pc-qa">
        <h2>Hỏi và đáp</h2>
        <div>
          <h3>Hãy đặt câu hỏi cho chúng tôi</h3>
          <p>
            CellphoneS sẽ phản hồi câu hỏi về cấu hình và linh kiện phù hợp.
          </p>
          <form onSubmit={(event) => event.preventDefault()}>
            <input placeholder="Viết câu hỏi của bạn tại đây" />
            <button>Gửi câu hỏi</button>
          </form>
        </div>
      </section>
      {activeSlot && (
        <ProductPicker
          slot={activeSlot}
          onClose={() => setActiveSlot(null)}
          onSelect={chooseProduct}
        />
      )}
    </div>
  );
}
