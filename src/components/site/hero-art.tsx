/** Decorative shelf composition for the home hero. Purely visual. */
export function HeroArt() {
  return (
    <div aria-hidden="true" className="relative mx-auto hidden aspect-[4/5] w-full max-w-sm lg:block">
      <div className="absolute inset-0 rounded-[2rem] bg-sage-pale" />
      <div className="absolute inset-x-8 top-10 bottom-10 rounded-[1.5rem] border border-sage/20 bg-surface/80" />
      {[0, 1, 2].map((shelf) => (
        <div
          key={shelf}
          className="absolute inset-x-12 h-px bg-sage/30"
          style={{ top: `${32 + shelf * 22}%` }}
        />
      ))}
      <div className="absolute top-[19%] left-[22%] h-[12%] w-[13%] rounded-t-xl rounded-b-md bg-sage/80" />
      <div className="absolute top-[22%] left-[38%] h-[9%] w-[11%] rounded-md bg-[#c9b79c]" />
      <div className="absolute top-[24%] left-[52%] h-[7%] w-[22%] rounded-full bg-sand ring-1 ring-line-strong" />
      <div className="absolute top-[41%] left-[24%] h-[13%] w-[30%] rounded-lg bg-sand ring-1 ring-line-strong" />
      <div className="absolute top-[45%] left-[58%] h-[9%] w-[9%] rounded-full bg-sage/60" />
      <div className="absolute top-[45%] left-[69%] h-[9%] w-[9%] rounded-full bg-[#c9b79c]/80" />
      <div className="absolute top-[64%] left-[24%] h-[10%] w-[52%] rounded-lg bg-sage-pale ring-1 ring-sage/25" />
      <div className="absolute right-[-1.5rem] bottom-[-1.5rem] size-28 rounded-full bg-[#efe6d6] mix-blend-multiply" />
    </div>
  );
}
