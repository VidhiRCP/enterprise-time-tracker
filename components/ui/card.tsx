export function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl sm:rounded-2xl border border-[#808080]/30 p-3 sm:p-4 md:p-6">
      {children}
    </section>
  );
}