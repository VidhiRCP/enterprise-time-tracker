export function Card({
  children,
  className = "",
  accent = true,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <section
      className={`border border-[#808080]/15 ${accent ? "border-t-2 border-t-[#F40000]/40" : ""} p-4 sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}