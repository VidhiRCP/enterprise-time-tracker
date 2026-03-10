import { signIn } from "@/auth";

export function SignInCard() {
  return (
    <form action={async () => { "use server"; await signIn("microsoft-entra-id"); }}>
      <div className="mx-auto max-w-lg rounded-2xl border border-[#808080]/30 p-8 text-center">
        <h1 className="text-2xl font-bold text-[#F8F8F8]">PM Time Tracker</h1>
        <p className="mt-2 text-sm text-[#D9D9D9] leading-relaxed">
          Sign in with your work email. You will only see projects assigned to you.
        </p>
        <button className="mt-6 rounded-xl bg-[#F40000] px-6 py-3 text-sm font-semibold text-[#F8F8F8] hover:opacity-90 transition-opacity">
          Sign in with Microsoft Entra ID
        </button>
      </div>
    </form>
  );
}
