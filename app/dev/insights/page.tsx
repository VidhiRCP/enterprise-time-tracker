import { InsightsPanel } from "@/components/time/insights-panel";

export default function DevInsightsPage() {
  const data = { entries: [], allocations: [], currentWeekISO: new Date().toISOString() };
  return (
    <main className="p-6">
      <h1 style={{ color: '#fff' }}>Dev Insights Preview</h1>
      <InsightsPanel data={data} />
    </main>
  );
}
