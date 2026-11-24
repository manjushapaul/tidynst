import Image from "next/image";
import heroImage from "@/assets/hero-small-apartment.jpg";
import type { PublicImage } from "@/server/public-content";

const BUILT_IN_ALT =
  "A sunlit, organised small apartment with glass jars on open kitchen shelves, a tidy bathroom, an open wardrobe and a cream sofa";

/** Framed photo for the home hero. A library image replaces the built-in picture when one is chosen. */
export function HeroArt({ image }: { image?: PublicImage | null }) {
  return (
    <div className="relative mx-auto hidden aspect-[3/4] w-full max-w-sm lg:block home-hero__art ">
      <div aria-hidden="true" className="absolute inset-0 rounded-[2rem] bg-oak-pale home-hero__decoration" />
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 size-28 hero-orbit rounded-full bg-[#e3cba6] mix-blend-multiply home-hero__decoration"
      />
      <div className="absolute inset-5 overflow-hidden rounded-[1.5rem] shadow-[0_22px_45px_-20px_rgb(122_92_52/0.55)] ring-1 ring-[#e3cba6]/70 home-hero__photo">
        {image ? (
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes="(min-width: 1024px) 21rem, 100vw"
            fetchPriority="high"
            className="h-full w-full object-cover object-[50%_72%]"
          />
        ) : (
          <Image
            src={heroImage}
            alt={BUILT_IN_ALT}
            placeholder="blur"
            sizes="21rem"
            fetchPriority="high"
            className="h-full w-full object-cover object-[50%_72%]"
          />
        )}
      </div>
    </div>
  );
}
