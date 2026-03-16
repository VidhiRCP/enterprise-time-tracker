import { signIn } from "@/auth";

export function SignInCard() {
  return (
    <form action={async () => { "use server"; await signIn("microsoft-entra-id"); }}>
      <div className="mx-auto max-w-lg border border-[#808080]/30 p-5 sm:p-6 md:p-8 text-center">
        <h1 className="app-heading-1">RCP Time Tracker</h1>
        <p className="mt-2 text-xs sm:text-sm text-[#D9D9D9] leading-relaxed">
          Sign in with your work email. You will only see projects assigned to you.
        </p>
        <button className="mt-4 sm:mt-6 btn btn-md btn-primary">
          Sign in with Microsoft Entra ID
        </button>
      </div>
    </form>
  );
}
