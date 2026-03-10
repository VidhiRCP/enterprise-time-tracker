import { signIn } from "@/auth";

export function SignInCard() {
  return (
    <form action={async () => { "use server"; await signIn("microsoft-entra-id"); }}>
      <div style={{maxWidth:640,margin:"80px auto",background:"#000000",border:"1px solid #808080",borderRadius:24,padding:32,textAlign:"center" as const}}>
        <h1 style={{margin:"0 0 8px",fontSize:36,fontFamily:"Arial, Helvetica, sans-serif",color:"#F8F8F8",fontWeight:700}}>PM Time Tracker</h1>
        <p style={{margin:"0 0 24px",color:"#D9D9D9",fontSize:15,fontFamily:"Arial, Helvetica, sans-serif",lineHeight:1.6}}>Sign in with your work email. You will only see projects assigned to you.</p>
        <button style={{padding:"14px 24px",borderRadius:16,background:"#F40000",color:"#F8F8F8",border:0,cursor:"pointer",fontFamily:"Arial, Helvetica, sans-serif",fontSize:15,fontWeight:600,transition:"background 0.2s"}}>Sign in with Microsoft Entra ID</button>
      </div>
    </form>
  );
}
