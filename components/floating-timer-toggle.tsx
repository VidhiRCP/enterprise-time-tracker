"use client";

import { useState, useEffect } from "react";
import {
  openTimerPopup,
  closeTimerPopup,
  isTimerPopupOpen,
} from "@/lib/timer-broadcast";

export function FloatingTimerToggle() {
  const [popupOpen, setPopupOpen] = useState(false);

  useEffect(() => {
    setPopupOpen(isTimerPopupOpen());
  }, []);

  return (
    <button
      onClick={() => {
        if (popupOpen) {
          closeTimerPopup();
          setPopupOpen(false);
        } else {
          openTimerPopup();
          setPopupOpen(true);
        }
      }}
      className="border border-[#808080]/30 px-4 py-2 text-sm text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors flex items-center gap-1.5"
      title={popupOpen ? "Close floating timer" : "Open floating timer"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
      <span className="hidden sm:inline">{popupOpen ? "Close Timer" : "Float Timer"}</span>
    </button>
  );
}
