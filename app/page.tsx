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
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,marginBottom:24,background:"#fff",border:"1px solid #e2e8f0",borderRadius:24,padding:24}}>
        <div>
          <h1 style={{margin:0,fontSize:32}}>PM Time Tracker</h1>
          <p style={{margin:"8px 0 0",color:"#475569"}}>Signed in as {session.user.email}</p>
        </div>
        <form action={async()=>{ "use server"; await signOut({ redirectTo: "/" }); }}>
          <button style={{padding:"10px 14px",borderRadius:14,border:"1px solid #cbd5e1",background:"#fff",cursor:"pointer"}}>Sign out</button>
        </form>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:24}}>
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:20,padding:20}}><div style={{color:"#64748b",fontSize:14}}>Assigned projects</div><div style={{fontSize:32,fontWeight:700}}>{projects.length}</div></div>
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:20,padding:20}}><div style={{color:"#64748b",fontSize:14}}>My entries</div><div style={{fontSize:32,fontWeight:700}}>{entries.length}</div></div>
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:20,padding:20}}><div style={{color:"#64748b",fontSize:14}}>Recovered session</div><div style={{fontSize:32,fontWeight:700}}>{activeSession ? "Yes" : "No"}</div></div>
      </div>

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:20,padding:20,marginBottom:24}}>
        <h2 style={{marginTop:0}}>Assigned projects</h2>
        <ul>
          {projects.map(p => <li key={p.id}>{p.projectId} — {p.projectName}</li>)}
        </ul>
      </div>

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:20,padding:20}}>
        <h2 style={{marginTop:0}}>Recent entries</h2>
        <ul>
          {entries.map(e => <li key={e.id}>{e.project.projectName} — {e.durationMinutes} minutes</li>)}
        </ul>
      </div>
    </main>
  );
}
