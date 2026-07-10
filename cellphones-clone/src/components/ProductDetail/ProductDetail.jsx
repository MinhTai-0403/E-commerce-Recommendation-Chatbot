import { useEffect, useMemo, useState } from 'react';
import './ProductDetail.css';
import { formatPrice } from '../../data/mockData';
import { getProductId, getProductPath } from '../../data/productCatalog';
import { buildCategoryPath, getRouteForLabel } from '../../utils/linkRoutes';
import {
  createProductQuestion,
  createProductReview,
  fetchProductQuestions,
  fetchProductReviews,
} from '../../services/apiInteractions';
import { getStoredUser } from '../../services/apiAuth';
import {
  addCustomerWishlistItem,
  fetchCustomerWishlist,
  removeCustomerWishlistItem,
} from '../../services/apiCustomer';
import { CART_ADD_EVENT } from '../../hooks/useCart';

function Price({ value, className }) {
  if (typeof value !== 'number') return <span className={className}>Liên hệ</span>;
  return <span className={className}>{formatPrice(value)}</span>;
}

const normalizeOptionKey = (value = '') => (
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
);

const getRelatedProductsPath = (product = {}) => {
  const brand = product.brandName || product.brand || '';
  const trailCategory = [...(product.categoryTrail || [])]
    .reverse()
    .find((item) => {
      const name = item?.name || item?.label || '';
      return name && name !== brand && item?.id !== 'home';
    })?.name;
  const category = product.category || trailCategory || 'Sản phẩm';

  return buildCategoryPath(category, {
    brand,
    keyword: category,
    title: category,
  });
};

const normalizeImageUrl = (value = '') => (
  String(value || '').trim().split('?')[0]
);

const getOptionId = (option = {}, prefix = 'option') => (
  String(option.id || option.productId || option.slug || option.name || `${prefix}-unknown`)
);

const toLocalCellphonesPath = (url = '') => {
  if (!url) return '';

  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.hostname.includes('cellphones.com.vn')
      ? `${parsed.pathname}${parsed.search || ''}${parsed.hash || ''}`
      : parsed.toString();
  } catch {
    return url;
  }
};

const getVariantHref = (variant = {}, product) => {
  if (variant.active) return getProductPath(product);
  if (variant.href) return variant.href;
  if (variant.url) return toLocalCellphonesPath(variant.url);

  const slug = String(variant.slug || '').replace(/^\/+|\/+$/g, '').replace(/\.html$/i, '');
  return slug ? `/${slug}.html` : getProductPath(product);
};

const findColorForMedia = (mediaItem = {}, colors = []) => {
  const mediaImage = normalizeImageUrl(mediaItem.src || mediaItem.thumbnail);
  const mediaLabel = normalizeOptionKey(mediaItem.label || mediaItem.alt);

  return colors.find((color) => {
    const colorImage = normalizeImageUrl(color.image);
    const colorLabel = normalizeOptionKey(color.name);
    return (
      (mediaImage && colorImage && mediaImage === colorImage) ||
      (mediaLabel && colorLabel && mediaLabel === colorLabel)
    );
  });
};

const findMediaForColor = (color = {}, mediaItems = []) => {
  const colorImage = normalizeImageUrl(color.image);
  const colorLabel = normalizeOptionKey(color.name);

  return mediaItems.find((mediaItem) => {
    const mediaImage = normalizeImageUrl(mediaItem.src || mediaItem.thumbnail);
    const mediaLabel = normalizeOptionKey(mediaItem.label || mediaItem.alt);
    return (
      (colorImage && mediaImage && colorImage === mediaImage) ||
      (colorLabel && mediaLabel && colorLabel === mediaLabel)
    );
  });
};

function RatingStars({ rating = 0 }) {
  return (
    <span className="pdp-rating-stars" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <svg key={index} width="14" height="14" viewBox="0 0 24 24" fill={index < Math.round(rating) ? '#f59e0b' : '#e5e7eb'}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

function sanitizeProductHtml(html = '') {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*\/?>/gi, '')
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*(javascript:|data:text\/html)[^'"]*\2/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*(javascript:|data:text\/html)[^\s>]*/gi, ' $1="#"');
}

function SpecValue({ value }) {
  if (Array.isArray(value)) {
    return (
      <ul className="pdp-spec-list">
        {value.map((item) => <li key={item}>{item}</li>)}
      </ul>
    );
  }

  if (value && typeof value === 'object' && value.html) {
    return <span className="pdp-spec-html" dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(value.html) }} />;
  }

  return <span>{value}</span>;
}

function RelatedProductCard({ product }) {
  return (
    <a className="pdp-related-product" href={getProductPath(product)} data-product-id={getProductId(product)}>
      {product.discount > 0 && <span className="pdp-related-badge">Giảm {product.discount}%</span>}
      {product.installment && <span className="pdp-related-installment">Trả góp 0%</span>}
      <div className="pdp-related-image-wrap">
        <img src={product.image} alt={product.name} loading="lazy" />
      </div>
      <h3>{product.name}</h3>
      <div className="pdp-related-price-row">
        <Price value={product.currentPrice} className="pdp-related-current-price" />
        {product.originalPrice > product.currentPrice && (
          <Price value={product.originalPrice} className="pdp-related-original-price" />
        )}
      </div>
      <div className="pdp-related-meta">
        <RatingStars rating={product.rating} />
        <span>({product.ratingCount || 0})</span>
      </div>
    </a>
  );
}

function normalizeHeading(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function ArticleSection({ section, hideHeading = false }) {
  return (
    <section className="pdp-article-section" id={`article-${section.id}`}>
      {!hideHeading && <h3>{section.heading}</h3>}
      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}

      {section.list?.length > 0 && (
        <ul className="pdp-article-list">
          {section.list.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}

      {section.table && (
        <div className="pdp-article-table-wrap">
          <table className="pdp-article-table">
            <thead>
              <tr>
                {section.table.headers.map((header) => <th key={header}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row, rowIndex) => (
                <tr key={`${section.id}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => <td key={`${section.id}-cell-${rowIndex}-${cellIndex}`}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section.image && (
        <img className="pdp-article-image" src={section.image} alt={section.imageAlt || section.heading} loading="lazy" />
      )}
    </section>
  );
}

function OfferListCard({ title, items = [], className = '' }) {
  if (!items.length) return null;

  return (
    <section className={`pdp-offer-card ${className}`}>
      <h2>{title}</h2>
      <div className="pdp-offer-list">
        {items.map((item, index) => (
          <div className="pdp-offer-item" key={item.id || item.title}>
            <span className="pdp-offer-icon">{index + 1}</span>
            <div>
              {item.href ? <a href={item.href === '#' ? getRouteForLabel(item.title) : item.href}><strong>{item.title}</strong></a> : <strong>{item.title}</strong>}
              {item.description && <p>{item.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const FEATURED_SPEC_LABELS = [
  'Kích thước màn hình',
  'Công nghệ màn hình',
  'Tần số quét',
  'Chipset',
  'Bộ nhớ trong',
  'Camera trước',
  'Hỗ trợ mạng',
  'Cổng sạc',
];

function FeaturedSpecsCard({ specifications = [] }) {
  const allRows = specifications.flatMap((group) => group.rows || []);
  const rows = FEATURED_SPEC_LABELS
    .map((label) => allRows.find((row) => row.label === label))
    .filter(Boolean);

  if (!rows.length) return null;

  return (
    <section className="pdp-featured-spec-card">
      <div className="pdp-card-heading">
        <h2>Thông số nổi bật</h2>
        <a href="#pdp-specifications">Xem đầy đủ</a>
      </div>
      <div className="pdp-featured-spec-list">
        {rows.map((row) => (
          <div className="pdp-featured-spec-row" key={`featured-${row.id}`}>
            <span>{row.label}</span>
            <SpecValue value={row.value} />
          </div>
        ))}
      </div>
    </section>
  );
}

function SourceArticle({ html }) {
  if (!html) return null;

  return (
    <div
      className="pdp-source-article"
      dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(html) }}
    />
  );
}

function NewsListCard({ news = [] }) {
  if (!news.length) return null;

  return (
    <section className="pdp-news-card">
      <h2>Tin tức về sản phẩm</h2>
      <div className="pdp-news-list">
        {news.map((item) => (
          <a href={item.href && item.href !== '#' ? item.href : getRouteForLabel(item.title, 'news')} key={item.id} className="pdp-news-item">
            <span>{item.title}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        ))}
      </div>
    </section>
  );
}

function createDefaultReviewSummary(rating = 5, total = 0) {
  return {
    rating: Number(rating || 5),
    total: Number(total || 0),
    distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0 })),
    samples: [],
  };
}

function ReviewSummaryCard({
  summary,
  productName,
  reviewForm,
  showReviewForm,
  isInteractionLoggedIn,
  reviewMessage,
  reviewError,
  submittingReview,
  onToggleReviewForm,
  onReviewFieldChange,
  onSubmitReview,
}) {
  const safeSummary = summary || createDefaultReviewSummary();
  const total = Number(safeSummary.total || 0);
  const distribution = safeSummary.distribution?.length
    ? safeSummary.distribution
    : createDefaultReviewSummary().distribution;

  return (
    <section className="pdp-review-card" id="pdp-reviews">
      <h2>Đánh giá &amp; nhận xét {productName}</h2>
      <div className="pdp-review-overview">
        <div className="pdp-review-score">
          <strong>{safeSummary.rating?.toFixed ? safeSummary.rating.toFixed(1) : safeSummary.rating || 5}</strong>
          <RatingStars rating={safeSummary.rating || 5} />
          <span>{total} đánh giá</span>
        </div>
        <div className="pdp-review-bars">
          {distribution.map((row) => {
            const percent = total ? Math.round((row.count / total) * 100) : 0;
            return (
              <div className="pdp-review-bar-row" key={row.stars}>
                <span>{row.stars} sao</span>
                <div><i style={{ width: `${percent}%` }} /></div>
                <span>{row.count}</span>
              </div>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        className="pdp-review-action"
        onClick={onToggleReviewForm}
        title={isInteractionLoggedIn ? undefined : 'Cần đăng nhập Smember để đánh giá'}
      >
        {showReviewForm ? 'Đóng đánh giá' : (isInteractionLoggedIn ? 'Đánh giá ngay' : 'Đăng nhập để đánh giá')}
      </button>
      {!showReviewForm && reviewError && <p className="pdp-form-message error">{reviewError}</p>}
      {showReviewForm && (
        <form className="pdp-review-form" onSubmit={onSubmitReview}>
          <label>
            Số sao
            <select
              value={reviewForm.rating}
              onChange={(event) => onReviewFieldChange('rating', event.target.value)}
            >
              {[5, 4, 3, 2, 1].map((star) => (
                <option key={star} value={star}>{star} sao</option>
              ))}
            </select>
          </label>
          <label>
            Tên của bạn
            <input
              value={reviewForm.authorName}
              onChange={(event) => onReviewFieldChange('authorName', event.target.value)}
              placeholder="Nhập tên hiển thị"
            />
          </label>
          <label>
            Email/Số điện thoại
            <input
              value={reviewForm.contact}
              onChange={(event) => onReviewFieldChange('contact', event.target.value)}
              placeholder="Để CellphoneS liên hệ khi cần"
            />
          </label>
          <label>
            Nhận xét
            <textarea
              value={reviewForm.content}
              onChange={(event) => onReviewFieldChange('content', event.target.value)}
              rows="4"
              placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm..."
            />
          </label>
          {reviewMessage && <p className="pdp-form-message success">{reviewMessage}</p>}
          {reviewError && <p className="pdp-form-message error">{reviewError}</p>}
          <button type="submit" disabled={submittingReview}>
            {submittingReview ? 'Đang gửi...' : 'Gửi đánh giá'}
          </button>
        </form>
      )}
      {safeSummary.samples?.length > 0 && (
        <div className="pdp-review-samples">
          {safeSummary.samples.map((item) => (
            <article key={item.id} className="pdp-review-sample">
              <div>
                <strong>{item.author}</strong>
                <RatingStars rating={item.rating || 5} />
              </div>
              <p>{item.content}</p>
              {item.adminReply?.content && (
                <p className="pdp-admin-reply"><strong>CellphoneS:</strong> {item.adminReply.content}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ProductDetail({ product, currentUser, onGoLogin, onAddToCart, onGoCart }) {
  const mediaItems = product.media?.length
    ? product.media
    : [{ id: 'main', type: 'image', src: product.image || product.thumbnail, alt: product.name, label: 'Ảnh chính' }];
  const [activeMediaId, setActiveMediaId] = useState(mediaItems[0]?.id);
  const activeMedia = mediaItems.find((item) => item.id === activeMediaId) || mediaItems[0];
  const initialColor = product.colors?.find((color) => color.active) || product.colors?.[0] || null;
  const [selectedColorId, setSelectedColorId] = useState(initialColor ? getOptionId(initialColor, 'color') : '');
  const selectedColor = product.colors?.find((color) => getOptionId(color, 'color') === selectedColorId) ||
    initialColor;
  const productId = getProductId(product);
  const saving = typeof product.originalPrice === 'number' && typeof product.currentPrice === 'number'
    ? product.originalPrice - product.currentPrice
    : 0;
  const productIdentifier = useMemo(() => (
    product.slug || product.sku || productId
  ), [product.slug, product.sku, productId]);
  const storedUser = useMemo(() => getStoredUser(), []);
  const accountUser = currentUser === undefined ? storedUser : currentUser;
  const accountDisplayName = accountUser?.fullName || accountUser?.name || accountUser?.username || accountUser?.email || '';
  const accountContact = accountUser?.email || accountUser?.phone || '';
  const isInteractionLoggedIn = Boolean(accountUser);
  const [reviewPayload, setReviewPayload] = useState(null);
  const [questionsPayload, setQuestionsPayload] = useState(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [questionMessage, setQuestionMessage] = useState('');
  const [questionError, setQuestionError] = useState('');
  const [cartMessage, setCartMessage] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    authorName: accountDisplayName,
    contact: accountContact,
    content: '',
  });
  const [questionForm, setQuestionForm] = useState({
    authorName: accountDisplayName,
    contact: accountContact,
    question: '',
  });
  const liveReviewSummary = reviewPayload?.summary || null;
  const displayReviewSummary = liveReviewSummary || product.reviewSummary || createDefaultReviewSummary(product.rating, product.ratingCount);
  const productQuestions = questionsPayload?.data || [];

  useEffect(() => {
    let mounted = true;
    const nextColor = product.colors?.find((color) => color.active) || product.colors?.[0] || null;
    const nextMedia = nextColor ? findMediaForColor(nextColor, mediaItems) : null;

    queueMicrotask(() => {
      if (!mounted) return;
      setSelectedColorId(nextColor ? getOptionId(nextColor, 'color') : '');
      setActiveMediaId(nextMedia?.id || mediaItems[0]?.id);
    });

    return () => {
      mounted = false;
    };
    // mediaItems is derived from product.media/image; these product-level keys are enough to reset gallery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIdentifier, product.colors, product.media]);

  const refreshInteractions = () => {
    if (!productIdentifier) return;
    const controller = new AbortController();

    Promise.all([
      fetchProductReviews(productIdentifier, controller.signal).catch(() => null),
      fetchProductQuestions(productIdentifier, controller.signal).catch(() => null),
    ]).then(([reviews, questions]) => {
      if (reviews) setReviewPayload(reviews);
      if (questions) setQuestionsPayload(questions);
    });
  };

  useEffect(() => {
    if (!isInteractionLoggedIn || !productIdentifier) {
      setIsFavorite(false);
      return undefined;
    }

    let mounted = true;

    fetchCustomerWishlist()
      .then((items) => {
        if (!mounted) return;

        const normalizedIdentifier = String(productIdentifier || "").replace(/\.html$/i, "");

        const existed = items.some((item) => {
          const candidates = [
            item.id,
            item.productId,
            item.productSlug,
            item.productSku,
            item.snapshot?.id,
            item.snapshot?.mongoId,
            item.snapshot?.slug,
            item.snapshot?.sku,
          ].filter(Boolean);

          return candidates.some((value) =>
            String(value).replace(/\.html$/i, "") === normalizedIdentifier
          );
        });

        setIsFavorite(existed);
      })
      .catch(() => {
        if (mounted) setIsFavorite(false);
      });

    return () => {
      mounted = false;
    };
  }, [isInteractionLoggedIn, productIdentifier]);

  useEffect(() => {
    if (!productIdentifier) return undefined;
    const controller = new AbortController();

    Promise.all([
      fetchProductReviews(productIdentifier, controller.signal).catch(() => null),
      fetchProductQuestions(productIdentifier, controller.signal).catch(() => null),
    ]).then(([reviews, questions]) => {
      if (!controller.signal.aborted) {
        if (reviews) setReviewPayload(reviews);
        if (questions) setQuestionsPayload(questions);
      }
    });

    return () => controller.abort();
  }, [productIdentifier]);

  useEffect(() => {
    let mounted = true;

    queueMicrotask(() => {
      if (!mounted) return;

      if (!isInteractionLoggedIn) {
        setShowReviewForm(false);
        setShowQuestionForm(false);
        return;
      }

      setReviewForm((previous) => ({
        ...previous,
        authorName: previous.authorName || accountDisplayName,
        contact: previous.contact || accountContact,
      }));
      setQuestionForm((previous) => ({
        ...previous,
        authorName: previous.authorName || accountDisplayName,
        contact: previous.contact || accountContact,
      }));
    });

    return () => {
      mounted = false;
    };
  }, [accountContact, accountDisplayName, isInteractionLoggedIn]);

  const updateReviewField = (field, value) => {
    setReviewForm((previous) => ({ ...previous, [field]: value }));
  };

  const updateQuestionField = (field, value) => {
    setQuestionForm((previous) => ({ ...previous, [field]: value }));
  };

  const selectMediaItem = (item) => {
    setActiveMediaId(item.id);

    const color = findColorForMedia(item, product.colors || []);
    if (color) {
      setSelectedColorId(getOptionId(color, 'color'));
    }
  };

  const selectColor = (color) => {
    const colorId = getOptionId(color, 'color');
    const mediaForColor = findMediaForColor(color, mediaItems);

    setSelectedColorId(colorId);
    if (mediaForColor) {
      setActiveMediaId(mediaForColor.id);
    }
  };

  const handleAddToCart = async () => {
    const selectedVariant = product.variants?.find((variant) => variant.active) || null;
    const cartProduct = {
      ...product,
      image: selectedColor?.image || activeMedia?.src || product.image || product.thumbnail,
      currentPrice: selectedColor?.price || product.currentPrice || product.price,
      price: selectedColor?.price || product.currentPrice || product.price,
      selectedColor,
      selectedVariant,
      selectedOptions: {
        ...(selectedVariant
          ? {
            variantId: getOptionId(selectedVariant, 'variant'),
            variantName: selectedVariant.name,
          }
          : {}),
        ...(selectedColor
          ? {
            colorId: getOptionId(selectedColor, 'color'),
            colorName: selectedColor.name,
          }
          : {}),
      },
    };

    try {
      if (typeof onAddToCart === 'function') {
        await onAddToCart(cartProduct, { quantity: 1 });
      } else {
        window.dispatchEvent(new CustomEvent(CART_ADD_EVENT, {
          detail: { product: cartProduct, quantity: 1 },
        }));
      }
      setCartMessage('Đã thêm sản phẩm vào giỏ hàng.');
    } catch {
      setCartMessage('Đã lưu tạm sản phẩm vào giỏ hàng.');
    }

    window.setTimeout(() => setCartMessage(''), 2400);
  };

  const handleToggleFavorite = async () => {
    if (!isInteractionLoggedIn) {
      setCartMessage('Bạn cần đăng nhập Smember để lưu sản phẩm yêu thích.');
      if (typeof onGoLogin === 'function') {
        onGoLogin();
      } else {
        window.location.href = '/smember/login';
      }
      return;
    }

    if (favoriteLoading) return;

    setFavoriteLoading(true);
    setCartMessage('');

    try {
      const identifier = product.slug || product.sku || product.mongoId || product.id || productId;

      if (isFavorite) {
        await removeCustomerWishlistItem(identifier);
        setIsFavorite(false);
        setCartMessage('Đã bỏ khỏi danh sách yêu thích.');
      } else {
        await addCustomerWishlistItem({
          productId: product.mongoId || product.id || productId,
          slug: product.slug,
          sku: product.sku,
          url: product.url || window.location.pathname,
        });
        setIsFavorite(true);
        setCartMessage('Đã lưu vào sản phẩm yêu thích.');
      }
    } catch (error) {
      setCartMessage(error.message || 'Không thể cập nhật sản phẩm yêu thích.');
    } finally {
      setFavoriteLoading(false);
      window.setTimeout(() => setCartMessage(''), 2400);
    }
  };


  const handleBuyNow = async () => {
    await handleAddToCart();
    if (typeof onGoCart === 'function') {
      onGoCart();
    } else {
      window.location.href = '/cart';
    }
  };

  const splitContact = (contact = '') => {
    const trimmed = String(contact || '').trim();
    return trimmed.includes('@')
      ? { email: trimmed, phone: '' }
      : { email: '', phone: trimmed };
  };

  const requireInteractionLogin = (type) => {
    const message = type === 'review'
      ? 'Bạn cần đăng nhập Smember để đánh giá sản phẩm.'
      : 'Bạn cần đăng nhập Smember để gửi câu hỏi.';

    if (type === 'review') {
      setReviewMessage('');
      setReviewError(message);
    } else {
      setQuestionMessage('');
      setQuestionError(message);
    }

    if (typeof onGoLogin === 'function') {
      onGoLogin();
    } else {
      window.location.href = '/smember/login';
    }

    return false;
  };

  const handleToggleReviewForm = () => {
    if (!isInteractionLoggedIn) {
      requireInteractionLogin('review');
      return;
    }

    setReviewError('');
    setShowReviewForm((value) => !value);
  };

  const handleToggleQuestionForm = () => {
    if (!isInteractionLoggedIn) {
      requireInteractionLogin('question');
      return;
    }

    setQuestionError('');
    setShowQuestionForm((value) => !value);
  };

  const handleSubmitReview = async (event) => {
    event.preventDefault();
    if (!isInteractionLoggedIn) {
      requireInteractionLogin('review');
      return;
    }

    setSubmittingReview(true);
    setReviewMessage('');
    setReviewError('');

    try {
      const contact = splitContact(reviewForm.contact);
      const payload = await createProductReview(productIdentifier, {
        rating: reviewForm.rating,
        authorName: reviewForm.authorName,
        content: reviewForm.content,
        ...contact,
      });
      setReviewMessage(payload.message || 'Đã gửi đánh giá.');
      setReviewForm((previous) => ({ ...previous, content: '' }));
      refreshInteractions();
    } catch (error) {
      setReviewError(error.message || 'Không thể gửi đánh giá.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSubmitQuestion = async (event) => {
    event.preventDefault();
    if (!isInteractionLoggedIn) {
      requireInteractionLogin('question');
      return;
    }

    setSubmittingQuestion(true);
    setQuestionMessage('');
    setQuestionError('');

    try {
      const contact = splitContact(questionForm.contact);
      const payload = await createProductQuestion(productIdentifier, {
        authorName: questionForm.authorName,
        question: questionForm.question,
        ...contact,
      });
      setQuestionMessage(payload.message || 'Đã gửi câu hỏi.');
      setQuestionForm((previous) => ({ ...previous, question: '' }));
      refreshInteractions();
    } catch (error) {
      setQuestionError(error.message || 'Không thể gửi câu hỏi.');
    } finally {
      setSubmittingQuestion(false);
    }
  };

  return (
    <article className="product-detail-page" data-product-id={productId} data-product-sku={product.sku} data-product-slug={product.slug}>
      <div className="container">
        <nav className="pdp-breadcrumb" aria-label="Breadcrumb">
          {product.categoryTrail?.map((item, index) => (
            <span className="pdp-breadcrumb-node" key={item.id}>
              {index > 0 && <span className="pdp-breadcrumb-separator">/</span>}
              <a href={item.href}>{item.name}</a>
            </span>
          ))}
          <span className="pdp-breadcrumb-separator">/</span>
          <span className="pdp-breadcrumb-current">{product.name}</span>
        </nav>

        <section className="pdp-title-card">
          <div>
            <h1>{product.name}</h1>
            <div className="pdp-title-meta">
              <span className="pdp-rating-pill">
                <RatingStars rating={product.rating} />
                <strong>{product.rating || '5.0'}</strong>
                <span>({product.ratingCount || 0} đánh giá)</span>
              </span>
              <a href="#pdp-qa">Hỏi đáp</a>
              <a href="#pdp-specifications">Thông số</a>
              <a href="#pdp-article">So sánh</a>
            </div>
          </div>
          <button
            type="button"
            className={`pdp-favorite-btn ${isFavorite ? 'active' : ''}`}
            onClick={handleToggleFavorite}
            disabled={favoriteLoading}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
            </svg>
            {favoriteLoading ? 'Đang lưu...' : isFavorite ? 'Đã yêu thích' : 'Yêu thích'}
          </button>
        </section>

        <div className="pdp-top-layout">
          <div className="pdp-main-column">
            <div className="pdp-primary-row">
              <section className="pdp-gallery-card">
                <div className="pdp-main-media">
                  {activeMedia?.type === 'video' ? (
                    <div className="pdp-video-preview">
                      <img src={activeMedia.thumbnail} alt={activeMedia.alt || product.name} />
                      <span className="pdp-play-button" aria-hidden="true">
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </div>
                  ) : (
                    <img src={activeMedia?.src || product.thumbnail} alt={activeMedia?.alt || product.name} />
                  )}
                </div>

                <div className="pdp-thumb-row" aria-label="Ảnh sản phẩm">
                  {mediaItems.map((item) => (
                    <button
                      className={`pdp-thumb ${item.id === activeMedia?.id ? 'active' : ''}`}
                      key={item.id}
                      type="button"
                      onClick={() => selectMediaItem(item)}
                      aria-pressed={item.id === activeMedia?.id}
                    >
                      <img src={item.thumbnail || item.src} alt={item.label || item.alt || product.name} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>

                <div className="pdp-highlight-box">
                  <h2>Tính năng nổi bật</h2>
                  <ul>
                    {product.highlights?.map((highlight) => <li key={highlight}>{highlight}</li>)}
                  </ul>
                </div>

                <OfferListCard
                  title="Đặc quyền khi mua sản phẩm tại CellphoneS"
                  items={product.privileges}
                  className="pdp-privilege-card"
                />
              </section>

              <section className="pdp-buy-card">
                <div className="pdp-location-line">
                  Xem giá tại <strong>{product.city || 'Hồ Chí Minh'}</strong>
                </div>

                <div className="pdp-price-row">
                  <Price value={product.currentPrice} className="pdp-current-price" />
                  {product.originalPrice > product.currentPrice && (
                    <Price value={product.originalPrice} className="pdp-original-price" />
                  )}
                </div>
                {saving > 0 && <p className="pdp-saving">Tiết kiệm {formatPrice(saving)} so với giá niêm yết</p>}

                {product.priceBenefits?.length > 0 && (
                  <div className="pdp-member-benefits">
                    {product.priceBenefits.map((item) => (
                      <div className="pdp-member-benefit" key={item.id}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                )}

                {product.stockNote && (
                  <div className="pdp-stock-note">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span>{product.stockNote}</span>
                  </div>
                )}

                {product.shortNotice && (
                  <div className="pdp-short-notice">{product.shortNotice}</div>
                )}

                {product.variants?.length > 0 && (
                  <div className="pdp-option-group">
                    <h2>Phiên bản</h2>
                    <div className="pdp-option-grid">
                      {product.variants.map((variant) => (
                        <a
                          className={`pdp-option ${variant.active ? 'active' : ''}`}
                          href={getVariantHref(variant, product)}
                          key={variant.id}
                        >
                          <span>{variant.name}</span>
                          <Price value={variant.price} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {product.colors?.length > 0 && (
                  <div className="pdp-option-group">
                    <h2>Màu sắc</h2>
                    <div className="pdp-color-grid">
                      {product.colors.map((color) => {
                        const colorId = getOptionId(color, 'color');
                        const isActiveColor = selectedColor && getOptionId(selectedColor, 'color') === colorId;

                        return (
                          <button
                            className={`pdp-color-option ${isActiveColor ? 'active' : ''}`}
                            key={colorId}
                            type="button"
                            onClick={() => selectColor(color)}
                            aria-pressed={isActiveColor}
                          >
                            <img src={color.image} alt={color.name} />
                            <span>{color.name}</span>
                            <Price value={color.price} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="pdp-promo-card">
                  <h2>Khuyến mãi</h2>
                  {product.promotions?.map((promotion, index) => (
                    <div className="pdp-promo-item" key={promotion.id}>
                      <span>{index + 1}</span>
                      <p>
                        <strong>{promotion.title}</strong>
                        {promotion.description && <>: {promotion.description}</>}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pdp-action-stack">
                  <button type="button" className="pdp-primary-action" onClick={handleBuyNow}>
                    {product.statusLabel === 'Đặt trước' ? 'ĐẶT TRƯỚC NGAY' : 'MUA NGAY'}
                    <span>Thanh toán online hoặc nhận tại cửa hàng</span>
                  </button>
                  <button type="button" className="pdp-secondary-action" onClick={handleAddToCart}>
                    Thêm vào giỏ hàng
                  </button>
                  {cartMessage && <div className="pdp-cart-message">{cartMessage}</div>}
                </div>
              </section>
            </div>
          </div>

          <aside className="pdp-side-column">
            <section className="pdp-policy-card">
              <h2>Yên tâm mua hàng</h2>
              {product.policies?.map((policy) => (
                <div className="pdp-policy-item" key={policy.id}>
                  <span className="pdp-policy-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <div>
                    <strong>{policy.title}</strong>
                    <p>{policy.description}</p>
                  </div>
                </div>
              ))}
            </section>

            <OfferListCard
              title="Ưu đãi thanh toán"
              items={product.paymentOffers}
              className="pdp-payment-card"
            />

            <FeaturedSpecsCard specifications={product.specifications} />
          </aside>
        </div>

        {product.relatedProducts?.length > 0 && (
          <section className="pdp-related-card" aria-labelledby="pdp-related-heading">
            <div className="pdp-related-heading">
              <h2 id="pdp-related-heading">Sản phẩm tương tự</h2>
              <a href={getRelatedProductsPath(product)}>Xem tất cả</a>
            </div>
            <div className="pdp-related-grid">
              {product.relatedProducts.map((item) => (
                <RelatedProductCard product={item} key={item.id} />
              ))}
            </div>
          </section>
        )}

        <div className="pdp-lower-layout">
          <section className="pdp-article-card" id="pdp-article">
            <h2>{product.articleTitle || 'Đặc điểm nổi bật'}</h2>
            {product.articleHtml ? (
              <SourceArticle html={product.articleHtml} />
            ) : (
              product.articleSections?.map((section, index) => (
                <ArticleSection
                  key={section.id}
                  section={section}
                  hideHeading={index === 0 && normalizeHeading(section.heading) === normalizeHeading(product.articleTitle || 'Đặc điểm nổi bật')}
                />
              ))
            )}
          </section>

          <aside className="pdp-lower-side">
            <section className="pdp-spec-card" id="pdp-specifications">
              <div className="pdp-card-heading">
                <h2>Thông số kỹ thuật</h2>
                <a href="#pdp-specifications">Xem tất cả</a>
              </div>
              {product.specifications?.map((group) => (
                <div className="pdp-spec-group" key={group.id}>
                  <h3>{group.groupName}</h3>
                  {group.rows.map((row) => (
                    <div className="pdp-spec-row" key={row.id}>
                      <span>{row.label}</span>
                      <SpecValue value={row.value} />
                    </div>
                  ))}
                </div>
              ))}
            </section>

            <ReviewSummaryCard
              summary={displayReviewSummary}
              productName={product.name}
              reviewForm={reviewForm}
              showReviewForm={showReviewForm}
              isInteractionLoggedIn={isInteractionLoggedIn}
              reviewMessage={reviewMessage}
              reviewError={reviewError}
              submittingReview={submittingReview}
              onToggleReviewForm={handleToggleReviewForm}
              onReviewFieldChange={updateReviewField}
              onSubmitReview={handleSubmitReview}
            />

            <section className="pdp-qa-card" id="pdp-qa">
              <h2>Hỏi và đáp</h2>
              <div className="pdp-question-box">
                <img src="https://cdn2.cellphones.com.vn/insecure/rs:fill:160:0/q:90/plain/https://cellphones.com.vn/media/wysiwyg/ant-hello-2025.png" alt="CellphoneS hỗ trợ" />
                <p>Xin mời để lại câu hỏi, CellphoneS sẽ trả lời trong 1h.</p>
                <button
                  type="button"
                  onClick={handleToggleQuestionForm}
                  title={isInteractionLoggedIn ? undefined : 'Cần đăng nhập Smember để gửi câu hỏi'}
                >
                  {showQuestionForm ? 'Đóng câu hỏi' : (isInteractionLoggedIn ? 'Gửi câu hỏi' : 'Đăng nhập để hỏi')}
                </button>
              </div>
              {!showQuestionForm && questionError && <p className="pdp-form-message error">{questionError}</p>}
              {showQuestionForm && (
                <form className="pdp-question-form" onSubmit={handleSubmitQuestion}>
                  <label>
                    Tên của bạn
                    <input
                      value={questionForm.authorName}
                      onChange={(event) => updateQuestionField('authorName', event.target.value)}
                      placeholder="Nhập tên hiển thị"
                    />
                  </label>
                  <label>
                    Email/Số điện thoại
                    <input
                      value={questionForm.contact}
                      onChange={(event) => updateQuestionField('contact', event.target.value)}
                      placeholder="Để CellphoneS liên hệ khi cần"
                    />
                  </label>
                  <label>
                    Câu hỏi
                    <textarea
                      value={questionForm.question}
                      onChange={(event) => updateQuestionField('question', event.target.value)}
                      rows="4"
                      placeholder="Nhập câu hỏi về sản phẩm..."
                    />
                  </label>
                  {questionMessage && <p className="pdp-form-message success">{questionMessage}</p>}
                  {questionError && <p className="pdp-form-message error">{questionError}</p>}
                  <button type="submit" disabled={submittingQuestion}>
                    {submittingQuestion ? 'Đang gửi...' : 'Gửi câu hỏi'}
                  </button>
                </form>
              )}
              {productQuestions.map((item) => (
                <article className="pdp-question-item" key={item.id}>
                  <div>
                    <strong>{item.authorName || 'Khách hàng CellphoneS'}</strong>
                    <span>{item.status === 'answered' ? 'Đã trả lời' : 'Đang chờ trả lời'}</span>
                  </div>
                  <p>{item.question}</p>
                  {item.answer?.content && (
                    <div className="pdp-question-answer">
                      <strong>CellphoneS hỗ trợ</strong>
                      <p>{item.answer.content}</p>
                    </div>
                  )}
                </article>
              ))}
              {product.faqs?.map((faq) => (
                <details className="pdp-faq-item" key={faq.id}>
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </section>

            <NewsListCard news={product.news} />
          </aside>
        </div>
      </div>
    </article>
  );
}
