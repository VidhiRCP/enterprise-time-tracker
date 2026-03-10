import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SignInCard } from "@/components/sign-in-card";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.email) return <main><SignInCard /></main>;

  const [projects, entries, activeSession] = await Promise.all([
    prisma.project.findMany({
      where: { assignments: { some: { user: { email: session.user.email.toLowerCase() }, active: true } } },
      orderBy: { projectName: "asc" }
    }),
    prisma.timeEntry.findMany({
      where: { user: { email: session.user.email.toLowerCase() } },
      include: { project: true },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: 50
    }),
    prisma.timerSession.findFirst({
      where: { user: { email: session.user.email.toLowerCase() }, status: { in: ["RUNNING", "PAUSED"] } },
      include: { project: true },
      orderBy: { updatedAt: "desc" }
    })
  ]);

  return (
    <main style={{maxWidth:1200,margin:"0 auto",padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,marginBottom:24,background:"#000000",border:"1px solid #808080",borderRadius:24,padding:24}}>
        <div>
          <h1 style={{margin:0,fontSize:32,fontFamily:"Arial, Helvetica, sans-serif",color:"#F8F8F8"}}>PM Time Tracker</h1>
          <p style={{margin:"8px 0 0",color:"#D9D9D9",fontSize:14,fontFamily:"Arial, Helvetica, sans-serif"}}>Signed in as {session.user.email}</p>
        </div>
        <form action={async()=>{ "use server"; await signOut({ redirectTo: "/" }); }}>
          <button style={{padding:"10px 14px",borderRadius:14,border:"1px solid #808080",background:"#000000",color:"#F8F8F8",cursor:"pointer",fontFamily:"Arial, Helvetica, sans-serif",fontSize:14,transition:"background 0.2s"}}>Sign out</button>
        </form>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:24}}>
        <div style={{background:"#000000",border:"1px solid #808080",borderRadius:20,padding:20}}><div style={{color:"#D9D9D9",fontSize:13,fontFamily:"Arial, Helvetica, sans-serif",textTransform:"uppercase" as const,letterSpacing:1}}>Assigned projects</div><div style={{fontSize:36,fontWeight:700,color:"#F40000",fontFamily:"Arial, Helvetica, sans-serif"}}>{projects.length}</div></div>
        <div style={{background:"#000000",border:"1px solid #808080",borderRadius:20,padding:20}}><div style={{color:"#D9D9D9",fontSize:13,fontFamily:"Arial, Helvetica, sans-serif",textTransform:"uppercase" as const,letterSpacing:1}}>My entries</div><div style={{fontSize:36,fontWeight:700,color:"#F40000",fontFamily:"Arial, Helvetica, sans-serif"}}>{entries.length}</div></div>
        <div style={{background:"#000000",border:"1px solid #808080",borderRadius:20,padding:20}}><div style={{color:"#D9D9D9",fontSize:13,fontFamily:"Arial, Helvetica, sans-serif",textTransform:"uppercase" as const,letterSpacing:1}}>Recovered session</div><div style={{fontSize:36,fontWeight:700,color:"#F40000",fontFamily:"Arial, Helvetica, sans-serif"}}>{activeSession ? "Yes" : "No"}</div></div>
      </div>

      <div style={{background:"#000000",border:"1px solid #808080",borderRadius:20,padding:20,marginBottom:24}}>
        <h2 style={{marginTop:0,color:"#F8F8F8",fontSize:20,fontFamily:"Arial, Helvetica, sans-serif"}}>Assigned projects</h2>
        <ul style={{listStyle:"none",padding:0,margin:0}}>
          {projects.map(p => <li key={p.id} style={{padding:"10px 0",borderBottom:"1px solid #808080",color:"#D9D9D9",fontSize:14,fontFamily:"Arial, Helvetica, sans-serif"}}><span style={{color:"#F40000",fontWeight:600}}>{p.projectId}</span> — {p.projectName}</li>)}
        </ul>
      </div>

      <div style={{background:"#000000",border:"1px solid #808080",borderRadius:20,padding:20}}>
        <h2 style={{marginTop:0,color:"#F8F8F8",fontSize:20,fontFamily:"Arial, Helvetica, sans-serif"}}>Recent entries</h2>
        <ul style={{listStyle:"none",padding:0,margin:0}}>
          {entries.map(e => <li key={e.id} style={{padding:"10px 0",borderBottom:"1px solid #808080",color:"#D9D9D9",fontSize:14,fontFamily:"Arial, Helvetica, sans-serif"}}>{e.project.projectName} — <span style={{color:"#F40000",fontWeight:600}}>{e.durationMinutes} min</span></li>)}
        </ul>
      </div>
    </main>
  );
}
