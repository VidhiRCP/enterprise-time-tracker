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
      className={`bg-[#181818] border border-[#232323]/40 ${accent ? "border-t-2 border-t-[#F40000]/40" : ""} p-6 sm:p-7 rounded-none ${className}`}
    >
      {children}
    </section>
  );
}