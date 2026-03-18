import { signIn } from "@/auth";
import Image from "next/image";

export function SignInCard() {
  return (
    <form action={async () => { "use server"; await signIn("microsoft-entra-id"); }}>
      <div className="flex items-center min-h-screen w-full bg-black overflow-hidden">
        {/* Red diamond image — left 60% */}
        <div className="relative w-[60%] h-screen flex items-center justify-center pointer-events-none select-none">
          <Image
            src="/RCP Icon.png"
            alt=""
            width={800}
            height={800}
            priority
            className="h-[80%] w-auto max-w-full object-contain opacity-50"
            draggable={false}
          />
        </div>

        {/* Text content — right 40% */}
        <div className="w-[40%] flex flex-col items-center text-center px-8">
          <h1
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-white leading-none"
            style={{ textShadow: "2px 2px 0 #dc2626, 0 6px 20px rgba(0,0,0,0.6)" }}
          >
            RCP Pulse
          </h1>
          <p className="mt-4 text-sm sm:text-base text-[#D9D9D9]">
            Track your time, meetings and expenses in one place.
          </p>
          <button className="mt-8 border border-[#808080]/40 px-7 py-3 text-sm text-[#D9D9D9] bg-transparent hover:border-[#F40000] transition-colors">
            Sign in with Microsoft Entra ID
          </button>
        </div>
      </div>
    </form>
  );
}
