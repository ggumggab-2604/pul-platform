import { MarketHelpMenu } from "./MarketHelpMenu";
export function MarketPageHero({ search = "" }: { search?: string }) {
  return (
    <section className="flex min-w-0 items-center justify-between gap-2 py-1">
      <h1 className="text-2xl font-bold text-pul-deep sm:text-3xl">PUL 장터</h1>
      <MarketHelpMenu search={search} />
    </section>
  );
}
