import { signIn } from "@/auth";
import Image from "next/image";

export function SignInCard() {
  return (
    <form action={async () => { "use server"; await signIn("microsoft-entra-id"); }}>
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 md:flex-row md:gap-16">
        {/* Icon */}
        <div className="flex-shrink-0">
          <Image
            src="/RCP Icon.png"
            alt="RCP Pulse"
            width={320}
            height={320}
            priority
            className="w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 object-contain"
          />
        </div>

        {/* Text + Button */}
        <div className="text-center md:text-left">
          <h1
            className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-white"
            style={{ textShadow: "0 0 30px rgba(244,0,0,0.6), 0 0 60px rgba(244,0,0,0.35), 0 4px 12px rgba(0,0,0,0.5)" }}
          >
            RCP Pulse
          </h1>
          <p className="mt-3 text-sm sm:text-base text-[#D9D9D9]">
            Track your time, meetings and expenses in one place.
          </p>
          <button className="mt-6 border border-[#808080]/40 px-6 py-3 text-sm text-[#D9D9D9] hover:border-[#F40000] hover:text-white transition-colors">
            Sign in with Microsoft Entra ID
          </button>
        </div>
      </div>
    </form>
  );
}
