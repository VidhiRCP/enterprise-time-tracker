import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RCP Timer",
};

export default function TimerPopupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
