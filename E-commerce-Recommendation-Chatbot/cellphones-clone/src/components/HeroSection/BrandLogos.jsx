// src/components/HeroSection/BrandLogos.jsx
import React from "react";

export function SafeBrandImage({ src, alt }) {
  const [hasError, setHasError] = React.useState(false);

  if (hasError) {
    return <span className="fallback-brand-text">{alt}</span>;
  }

  return (
    <img
      src={src}
      alt={alt}
      className="mega-brand-img-fluid"
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
    />
  );
}
