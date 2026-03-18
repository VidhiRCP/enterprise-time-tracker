import { signIn } from "@/auth";

export function SignInCard() {
  return (
    <form action={async () => { "use server"; await signIn("microsoft-entra-id"); }}>
      <div
        className="flex items-center justify-center min-h-screen w-full bg-black"
      >
        <div className="flex flex-col items-center text-center">
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
