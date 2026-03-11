export function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="border border-[#808080]/30 p-4 sm:p-5">
      {children}
    </section>
  );
}