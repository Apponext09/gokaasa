import { SearchWidget } from '@/features/search/components/SearchWidget.jsx';
import { HeroMessageRotator } from '@/features/home/HeroMessageRotator.jsx';
import { SearchNearMeButton } from '@/features/home/SearchNearMeButton.jsx';

/**
 * The homepage hero: unchanged background-image carousel and floating white search card (owned by
 * HomePage.jsx -- heroSlides/heroIndex stay there since that's also where homepageBackgrounds() is
 * fetched), plus the rotating quote. `onSearch` is passed straight through
 * to SearchWidget exactly as HomePage.jsx did inline, so the embedded results listing keeps working.
 */
export function HeroSection({ heroSlides, heroIndex, setHeroIndex, onSearch }) {
  return (
    <section className="customer-booking-hero">
      <div className="customer-hero-arch">
        <div className="customer-hero-slides" aria-hidden="true">
          {heroSlides.map((slide, index) => (
            <img
              key={slide.src}
              src={slide.src}
              alt=""
              fetchPriority={index === 0 ? 'high' : 'auto'}
              decoding="async"
              className={`customer-hero-slide ${index === heroIndex ? 'is-active' : ''}`}
            />
          ))}
        </div>

        <div className="customer-hero-overlay" aria-hidden="true" />

        <div className="customer-hero-split">
          <div className="customer-hero-content">
            <h1>Your Next Getaway, Made Easy.</h1>
            <p>Discover handpicked stays and enjoy a smoother journey with Gokaasa.</p>
            <HeroMessageRotator className="mt-3" />
            <SearchNearMeButton className="mt-4" />
          </div>

        </div>

        {heroSlides.length > 1 && (
          <div className="customer-hero-dots" role="group" aria-label="Choose hero image">
            {heroSlides.map((slide, index) => (
              <button
                key={slide.src}
                type="button"
                aria-label={`Show ${slide.label}`}
                aria-current={index === heroIndex ? 'true' : undefined}
                onClick={() => setHeroIndex(index)}
                className={index === heroIndex ? 'is-active' : ''}
              />
            ))}
          </div>
        )}
      </div>

      <div className="customer-search-shell">
        <SearchWidget variant="hero" onSearch={onSearch} />
      </div>
    </section>
  );
}
