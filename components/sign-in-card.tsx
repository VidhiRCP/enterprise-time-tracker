import { signIn } from "@/auth";

export function SignInCard() {
  return (
    <form action={async () => { "use server"; await signIn("microsoft-entra-id"); }}>
      <div style={{maxWidth:640,margin:"80px auto",background:"#fff",border:"1px solid #e2e8f0",borderRadius:24,padding:24}}>
        <h1 style={{margin:"0 0 8px",fontSize:32}}>PM Time Tracker</h1>
        <p style={{margin:"0 0 16px",color:"#475569"}}>Sign in with your work email. You will only see projects assigned to you.</p>
        <button style={{padding:"12px 16px",borderRadius:16,background:"#0f172a",color:"#fff",border:0,cursor:"pointer"}}>Sign in with Microsoft Entra ID</button>
      </div>
    </form>
  );
}
