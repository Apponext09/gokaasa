import { SearchWidget } from '@/features/search/components/SearchWidget.jsx';
import { StaggeredReveal } from '@/components/shared/StaggeredReveal.jsx';
import { ShowcaseCard } from '@/features/home/ShowcaseCard.jsx';
import { HeroMessageRotator } from '@/features/home/HeroMessageRotator.jsx';
import { SearchNearMeButton } from '@/features/home/SearchNearMeButton.jsx';
import { destinationSearchPath } from '@/features/search/searchParams.js';

const PROMO_CARDS = [
  { title: 'Explore Mumbai', subtitle: "Hidden gems across the city", href: destinationSearchPath('mumbai') },
  { title: 'Navi Mumbai stays', subtitle: 'Flexible options for every plan', href: destinationSearchPath('navi-mumbai') },
];

/**
 * The homepage hero: unchanged background-image carousel and floating white search card (owned by
 * HomePage.jsx -- heroSlides/heroIndex stay there since that's also where homepageBackgrounds() is
 * fetched), plus the new rotating quote and floating promo cards. `onSearch` is passed straight through
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

          <div className="customer-hero-promos" aria-hidden={PROMO_CARDS.length === 0}>
            {PROMO_CARDS.map((card, index) => (
              <StaggeredReveal key={card.title} index={index}>
                <ShowcaseCard {...card} className="customer-hero-promo-card" />
              </StaggeredReveal>
            ))}
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
