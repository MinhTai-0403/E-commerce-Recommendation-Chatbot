import { useState } from 'react';

export default function CategoryBannerCarousel({
  tracks,
  label,
  getBannerHref,
}) {
  const [bannerPositions, setBannerPositions] = useState(() => tracks.map(() => 0));
  const visibleBanners = tracks.map((track, trackIndex) => (
    track[bannerPositions[trackIndex] % track.length]
  ));

  const changeBanner = (trackIndex, direction) => {
    setBannerPositions((current) => current.map((position, index) => {
      if (index !== trackIndex) return position;
      const trackLength = tracks[trackIndex].length;
      return (position + direction + trackLength) % trackLength;
    }));
  };

  const selectBanner = (trackIndex, position) => {
    setBannerPositions((current) => current.map((value, index) => (
      index === trackIndex ? position : value
    )));
  };

  if (tracks.length < 2 || tracks.some((track) => track.length === 0)) return null;

  return (
    <div
      className="phone-category-banner-carousel"
      aria-label={label}
      aria-roledescription="carousel"
    >
      <div className="phone-category-banners">
        {visibleBanners.map((banner, index) => (
          <div className="phone-category-banner-slide" key={`${banner.name}-${index}`}>
            <a href={getBannerHref(banner)}>
              <img src={banner.image} alt={banner.name} loading="eager" />
            </a>

            {tracks[index].length > 1 && (
              <>
                <button
                  type="button"
                  className="phone-category-banner-arrow phone-category-banner-prev"
                  aria-label={`Xem banner trước ${banner.name}`}
                  onClick={() => changeBanner(index, -1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="phone-category-banner-arrow phone-category-banner-next"
                  aria-label={`Xem banner tiếp theo ${banner.name}`}
                  onClick={() => changeBanner(index, 1)}
                >
                  ›
                </button>

                <div
                  className="phone-category-banner-dots"
                  aria-label={`Chọn banner ở vị trí ${index + 1}`}
                >
                  {tracks[index].map((item, position) => (
                    <button
                      type="button"
                      className={bannerPositions[index] === position ? 'active' : ''}
                      aria-label={`Xem ${item.name}`}
                      aria-current={bannerPositions[index] === position ? 'true' : undefined}
                      onClick={() => selectBanner(index, position)}
                      key={`${index}-${item.name}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
