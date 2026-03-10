export function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#808080]/30 p-6">
      {children}
    </section>
  );
}