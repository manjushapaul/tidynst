import { ButtonLink } from "@/components/ui/button";
import { site } from "@/lib/site";

export default function HomePage() {
  return (
    <main className="container-page py-24">
      <p className="eyebrow">{site.name}</p>
      <h1 className="mt-4 max-w-2xl text-5xl leading-[1.05] sm:text-6xl">{site.tagline}</h1>
      <p className="mt-6 max-w-xl text-lg text-muted">{site.description}</p>
      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/">Primary action</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Secondary action
        </ButtonLink>
      </div>
    </main>
  );
}
