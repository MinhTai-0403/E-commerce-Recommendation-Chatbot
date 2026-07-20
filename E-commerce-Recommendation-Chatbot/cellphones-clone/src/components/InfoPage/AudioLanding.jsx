import PhoneWeekendSale from '../PhoneWeekendSale/PhoneWeekendSale';
import { SafeBrandImage } from '../HeroSection/BrandLogos';
import CategoryBannerCarousel from './CategoryBannerCarousel';
import { getAudioLandingProfile } from './audioLandingData';
import { buildCategoryPath } from '../../utils/linkRoutes';

const resetAudioListing = {
  filter: '',
  facet: '',
  priceMin: '',
  priceMax: '',
  audioFeature: '',
  audioConnection: '',
  audioUsage: '',
  audioType: '',
  audioPower: '',
  audioDesign: '',
  audioLine: '',
};

const getBrandValue = (brand = {}) => (
  String(brand.name || '').trim().toLowerCase() === 'airpods'
    ? 'apple'
    : String(brand.name || '').trim().toLowerCase()
);

const buildAudioHref = (profile, overrides = {}, pathname = '') => {
  const href = buildCategoryPath(overrides.category || profile.category, {
    keyword: overrides.keyword || profile.title,
    title: overrides.title || profile.title,
    category: overrides.category || profile.category,
    brand: overrides.brand ?? profile.brand ?? '',
    q: overrides.q || '',
    sort: overrides.sort || 'latest',
    ...resetAudioListing,
    ...overrides,
  });
  if (!pathname) return href;
  const queryIndex = href.indexOf('?');
  return `${pathname}${queryIndex >= 0 ? href.slice(queryIndex) : ''}`;
};

export function AudioLandingIntro({ page, profile = getAudioLandingProfile(page) }) {
  if (!profile) return null;

  const brandHref = (brand) => {
    if (profile.key === 'headphones' && brand.name === 'AirPods') {
      return '/thiet-bi-am-thanh/tai-nghe/apple.html';
    }
    return buildAudioHref(profile, {
      brand: getBrandValue(brand),
      keyword: `${profile.title} ${brand.name}`,
      title: `${profile.title} ${brand.name}`,
    }, profile.paths?.[0]);
  };

  const cardHref = (card) => {
    if (card.href) return card.href;
    return buildAudioHref(profile, {
      audioType: card.audioType || '',
      audioUsage: card.audioUsage || '',
      audioLine: card.audioLine || '',
      keyword: card.label,
      title: `${profile.title} ${card.label}`,
    }, profile.paths?.[0]);
  };

  return (
    <section className="audio-category-intro">
      {profile.banners?.length > 0 && (
        <CategoryBannerCarousel
          tracks={profile.banners}
          label={`Banner ${profile.title}`}
          getBannerHref={(banner) => banner.href || '#'}
        />
      )}

      <h1>{profile.title}</h1>

      {profile.brands?.length > 0 && (
        <>
          <div className="audio-category-brand-grid" aria-label={profile.brandTitle || profile.title}>
            {profile.brands.map((brand) => (
              <a className="audio-category-brand-card" href={brandHref(brand)} key={brand.name}>
                {brand.logo ? <SafeBrandImage src={brand.logo} alt={brand.name} /> : <span>{brand.name}</span>}
              </a>
            ))}
          </div>
        </>
      )}

      {profile.cards?.length > 0 && (
        <>
          <h2>{profile.cardsTitle}</h2>
          <div className="audio-category-card-grid">
            {profile.cards.map((card) => {
              const filtersInCurrentPage = !card.href;
              return (
                <a
                  className="audio-category-need-card"
                  href={cardHref(card)}
                  data-preserve-scroll={filtersInCurrentPage ? 'true' : undefined}
                  key={card.label}
                >
                  {card.image && <img src={card.image} alt="" loading="lazy" />}
                  <span>{card.label}</span>
                </a>
              );
            })}
          </div>
        </>
      )}

      <PhoneWeekendSale
        category={profile.railCategory || profile.category}
        brand={profile.railBrand || profile.brand || ''}
        title={profile.railTitle || 'HOT SALE CUỐI TUẦN'}
        showCountdown
      />
    </section>
  );
}
