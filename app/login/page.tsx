"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const [mode, setMode] = useState<"login"|"register">("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const router = useRouter();

  const handle = async () => {
    setError(""); setLoading(true);
    try {
      if (mode === "login") {
        await login(email, pass);
      } else {
        if (!name.trim()) { setError("Name dite hobe"); setLoading(false); return; }
        if (pass.length < 6) { setError("Password kom se kom 6 character"); setLoading(false); return; }
        await register(email, pass, name);
      }
      router.replace("/dashboard");
    } catch (e: any) {
      const msg = e.code;
      if (msg === "auth/user-not-found" || msg === "auth/invalid-credential") setError("Account paoa jaini. Register koro!");
      else if (msg === "auth/wrong-password") setError("Password vul!");
      else if (msg === "auth/email-already-in-use") setError("Ei email already registered!");
      else if (msg === "auth/invalid-email") setError("Valid email deo!");
      else setError("Kono problem hoyeche. Try again koro.");
    }
    setLoading(false);
  };

  return (
    <div style={styles.page}>
      <div style={styles.orb1}/><div style={styles.orb2}/>
      <div style={styles.card}>
        <div style={styles.logo}>Life<span style={{color:"var(--accent)"}}>OS</span></div>
        <div style={styles.tagline}>tomar jibon, tomar control</div>

        {error && <div style={styles.error}>{error}</div>}

        {mode === "register" && (
          <div style={styles.field}>
            <label style={styles.label}>Name</label>
            <input style={styles.input} value={name} onChange={e=>setName(e.target.value)} placeholder="Tomar naam"/>
          </div>
        )}
        <div style={styles.field}>
          <label style={styles.label}>Email</label>
          <input style={styles.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tumi@gmail.com"
            onKeyDown={e=>e.key==="Enter"&&handle()}/>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Password</label>
          <input style={styles.input} type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••"
            onKeyDown={e=>e.key==="Enter"&&handle()}/>
        </div>

        <button style={{...styles.btn, opacity: loading ? 0.7 : 1}} onClick={handle} disabled={loading}>
          {loading ? "Loading..." : mode === "login" ? "Login koro" : "Register koro"}
        </button>

        <div style={styles.switchText}>
          {mode === "login" ? (
            <>Notun? <span style={styles.link} onClick={()=>{setMode("register");setError("");}}>Register koro</span></>
          ) : (
            <>Already account ache? <span style={styles.link} onClick={()=>{setMode("login");setError("");}}>Login koro</span></>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: any = {
  page: { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)", position:"relative", overflow:"hidden" },
  orb1: { position:"absolute", width:400, height:400, borderRadius:"50%", background:"var(--accent)", filter:"blur(80px)", opacity:0.1, top:-100, right:-100 },
  orb2: { position:"absolute", width:300, height:300, borderRadius:"50%", background:"var(--teal)", filter:"blur(80px)", opacity:0.08, bottom:-50, left:-50 },
  card: { position:"relative", zIndex:1, background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:24, padding:"48px 40px", width:380, maxWidth:"95vw" },
  logo: { fontSize:28, fontWeight:600, color:"var(--text)", marginBottom:6, letterSpacing:-0.5 },
  tagline: { fontSize:12, color:"var(--text3)", marginBottom:32 },
  error: { background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:8, padding:"10px 14px", color:"var(--red)", fontSize:12, marginBottom:14 },
  field: { display:"flex", flexDirection:"column", gap:6, marginBottom:12 },
  label: { fontSize:10, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.08em" },
  input: { background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, padding:"11px 14px", color:"var(--text)", fontSize:14, outline:"none", width:"100%" },
  btn: { width:"100%", background:"var(--accent)", border:"none", borderRadius:8, padding:13, color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", marginTop:8 },
  switchText: { color:"var(--text3)", fontSize:13, marginTop:20, textAlign:"center" as const },
  link: { color:"var(--accent)", cursor:"pointer" },
};
