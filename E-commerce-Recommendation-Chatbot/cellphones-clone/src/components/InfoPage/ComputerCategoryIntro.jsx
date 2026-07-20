import { LaptopHubNavigation } from './LaptopLanding';

const profiles = {
  pc: {
    title: 'PC | Máy tính để bàn',
    needs: [
      ['🧰', 'Build PC', 'productType', 'PC Gaming'],
      ['🖥️', 'PC ráp sẵn CellphoneS', 'productType', 'PC Văn phòng'],
      ['💻', 'Máy tính All in One', 'productType', 'All in One'],
      ['🏢', 'Máy tính đồng bộ', 'productType', 'Máy tính đồng bộ'],
      ['⚙️', 'Linh kiện máy tính', 'href', '/linh-kien.html'],
    ],
  },
  monitor: {
    title: 'Màn hình máy tính',
    needs: [
      ['🎮', 'Gaming', 'usage', 'Gaming'],
      ['📊', 'Văn phòng', 'usage', 'Văn phòng'],
      ['🎨', 'Đồ họa', 'usage', 'Đồ họa - thiết kế'],
      ['⌒', 'Màn hình cong', 'special', 'Màn hình cong'],
      ['⌨️', 'Màn hình lập trình', 'usage', 'Lập trình'],
      ['🧳', 'Màn hình di động', 'usage', 'Màn hình di động'],
      ['🦾', 'Arm màn hình', 'productType', 'Arm màn hình'],
    ],
  },
  components: {
    title: 'Linh kiện máy tính',
    needs: [
      ['🧠', 'CPU', 'productType', 'CPU'],
      ['🔌', 'Mainboard', 'productType', 'Mainboard'],
      ['📏', 'RAM', 'productType', 'RAM'],
      ['💾', 'Ổ cứng SSD', 'productType', 'Ổ cứng SSD'],
      ['🎞️', 'Card màn hình', 'productType', 'Card màn hình'],
      ['🔋', 'Nguồn máy tính', 'productType', 'Nguồn máy tính'],
      ['❄️', 'Tản nhiệt', 'productType', 'Tản nhiệt'],
      ['🗄️', 'Case máy tính', 'productType', 'Case máy tính'],
    ],
  },
  printer: {
    title: 'Máy in',
    needs: [
      ['⬛', 'Máy in laser', 'productType', 'Máy in laser'],
      ['🎨', 'Máy in phun', 'productType', 'Máy in phun'],
      ['📑', 'Máy in đa năng', 'productType', 'Máy in đa năng'],
      ['🧾', 'Máy in hóa đơn', 'productType', 'Máy in hóa đơn'],
      ['🏠', 'Dùng cho gia đình', 'usage', 'Gia đình'],
      ['🏢', 'Dùng cho văn phòng', 'usage', 'Văn phòng'],
    ],
  },
};

const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const hasSelectedValue = (currentValue, expectedValue) =>
  String(currentValue || "")
    .split("|")
    .some((value) => normalize(value) === normalize(expectedValue));

export default function ComputerCategoryIntro({ type, page, buildNeedHref }) {
  const profile = profiles[type];
  if (!profile) return null;

  return (
    <section className="computer-category-intro" aria-labelledby="computer-category-title">
      <LaptopHubNavigation activeKey={type} />
      <h1 id="computer-category-title">{profile.title}</h1>
      <h2>Chọn theo nhu cầu</h2>
      <div className="computer-need-grid">
        {profile.needs.map(([icon, label, key, value]) => (
          <a
            className={`computer-need-card ${key !== 'href' && hasSelectedValue(page?.[key], value) ? 'active' : ''}`}
            href={key === 'href' ? value : buildNeedHref(key, value, label)}
            key={label}
            aria-current={key !== 'href' && hasSelectedValue(page?.[key], value) ? 'page' : undefined}
          >
            <span aria-hidden="true">{icon}</span>
            <strong>{label}</strong>
          </a>
        ))}
      </div>
    </section>
  );
}
