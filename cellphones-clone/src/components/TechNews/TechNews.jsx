import './TechNews.css';
import { techNews } from '../../data/mockData';

export default function TechNews() {
  return (
    <section className="tech-news section-gap" aria-labelledby="tech-news-title">
      <div className="container">
        <div className="tech-news-header">
          <h2 id="tech-news-title">Tin tức</h2>
          <span className="tech-news-divider" aria-hidden="true" />
          <a className="tech-news-view-all" href="#">
            Xem tất cả
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        </div>

        <ul className="tech-news-grid">
          {techNews.map((article) => (
            <li className="tech-news-card" key={article.id}>
              <a href="#">
                <img src={article.thumbnail} alt={article.title} loading="lazy" />
                <span>{article.title}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
