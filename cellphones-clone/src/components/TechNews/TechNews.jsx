import './TechNews.css';
import { techNews } from '../../data/mockData';

export default function TechNews() {
  return (
    <section className="tech-news section-gap" id="tech-news-section">
      <div className="container">
        <div className="tech-news-wrapper">
          <div className="tech-news-header">
            <h2 className="tech-news-title">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
              Tin công nghệ
            </h2>
            <span className="tech-news-source">Sforum.vn</span>
            <a href="#" className="tech-news-viewall">
              Xem tất cả
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </a>
          </div>
          <div className="tech-news-grid">
            {/* Featured Article */}
            <a href="#" className="news-featured">
              <div className="news-thumbnail-large">
                <div className="news-thumb-placeholder">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
              </div>
              <div className="news-featured-info">
                <span className="news-category">{techNews[0].category}</span>
                <h3 className="news-featured-title">{techNews[0].title}</h3>
                <span className="news-date">{techNews[0].date}</span>
              </div>
            </a>

            {/* Article List */}
            <div className="news-list">
              {techNews.slice(1).map(news => (
                <a key={news.id} href="#" className="news-item">
                  <div className="news-thumbnail-small">
                    <div className="news-thumb-placeholder-sm">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                    </div>
                  </div>
                  <div className="news-item-info">
                    <span className="news-category">{news.category}</span>
                    <h4 className="news-item-title">{news.title}</h4>
                    <span className="news-date">{news.date}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
