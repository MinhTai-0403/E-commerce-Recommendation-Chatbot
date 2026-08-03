import './NotFoundPage.css';

export default function NotFoundPage({ onGoHome }) {
  return (
    <section className="not-found-page" aria-labelledby="not-found-title">
      <div className="not-found-card">
        <span className="not-found-code">404</span>
        <h1 id="not-found-title">Trang không tồn tại</h1>
        <p>Đường dẫn bạn truy cập không tồn tại hoặc đã được thay đổi.</p>
        <a
          href="/"
          onClick={(event) => {
            if (!onGoHome) return;
            event.preventDefault();
            onGoHome();
          }}
        >
          Quay lại trang chủ
        </a>
      </div>
    </section>
  );
}
