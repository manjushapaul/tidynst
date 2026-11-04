import Image from "next/image";
import Link from "next/link";
import type { PublicImage } from "@/server/public-content";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" fill="#86643f" />
      <path
        d="M8 17.5c2.2 4 5 6 8 6s5.8-2 8-6M10 14.5c1.8 2.4 3.8 3.6 6 3.6s4.2-1.2 6-3.6M16 8.5v5"
        fill="none"
        stroke="#faf7f2"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ name, image }: { name: string; image?: PublicImage | null }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5 rounded-lg" aria-label={`${name} home`}>
      {image ? (
        <Image src={image.src} alt="" width={32} height={32} className="size-8 rounded-lg object-cover" />
      ) : (
        <LogoMark className="size-8 transition-transform duration-300 ease-(--ease-gentle) group-hover:-rotate-6" />
      )}
      <span className="font-serif text-[calc(1.35rem*var(--text-scale))] font-medium tracking-tight">{name}</span>
    </Link>
  );
}
