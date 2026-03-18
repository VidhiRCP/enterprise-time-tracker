import { signIn } from "@/auth";
import Image from "next/image";

export function SignInCard() {
  return (
    <form action={async () => { "use server"; await signIn("microsoft-entra-id"); }}>
      <div className="relative flex items-center justify-center min-h-screen w-full bg-black overflow-hidden">
        {/* Left — Image (60% width, 50% opacity, pinned left) */}
        <div className="absolute left-0 top-0 h-full w-[60%] flex items-center justify-center pointer-events-none select-none">
          <Image
            src="/RCP Icon.png"
            alt=""
            width={800}
            height={800}
            priority
            className="h-[85%] w-auto max-w-full object-contain opacity-50"
            draggable={false}
          />
        </div>

        {/* Right — Content (occupies right ~40%, vertically centred) */}
        <div className="relative z-10 ml-auto w-full md:w-[45%] flex flex-col items-center md:items-start justify-center px-8 md:pr-16">
          <h1
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold text-white leading-none"
            style={{ textShadow: "0 0 40px rgba(244,0,0,0.55), 0 0 80px rgba(244,0,0,0.3), 0 4px 16px rgba(0,0,0,0.6)" }}
          >
            RCP Pulse
          </h1>
          <p className="mt-4 text-sm sm:text-base text-[#D9D9D9]">
            Track your time, meetings and expenses in one place.
          </p>
          <button className="mt-8 border border-[#F40000] px-7 py-3 text-sm text-[#D9D9D9] hover:bg-[#F40000]/10 hover:text-white transition-colors">
            Sign in with Microsoft Entra ID
          </button>
        </div>
      </div>
    </form>
  );
}
