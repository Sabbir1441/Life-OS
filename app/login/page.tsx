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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { login, register, loginWithGoogle, forgotPassword } = useAuth();
  const router = useRouter();

  const mapAuthCode = (msg: string | undefined) => {
    if (!msg) return "Kono problem hoyeche. Try again koro.";
    if (msg === "auth/user-not-found" || msg === "auth/invalid-credential") return "Account paoa jaini. Register koro!";
    if (msg === "auth/wrong-password") return "Password vul!";
    if (msg === "auth/email-already-in-use") return "Ei email already registered!";
    if (msg === "auth/invalid-email") return "Valid email deo!";
    if (msg === "auth/popup-closed-by-user") return "Popup bondho kore felcho — abar try koro.";
    if (msg === "auth/popup-blocked") return "Popup block ache browser e — popup allow koro.";
    if (msg === "auth/account-exists-with-different-credential") return "Ei email diye age email/password diye account ache.";
    if (msg === "auth/missing-email") return "Email likho age.";
    return "Kono problem hoyeche. Try again koro.";
  };

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
      setError(mapAuthCode(e?.code));
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    setError("");
    setResetSent(false);
    if (!email.trim()) {
      setError("Age email likho — inbox e reset link jabe");
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setResetSent(true);
    } catch (e: any) {
      setError(mapAuthCode(e?.code));
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      router.replace("/dashboard");
    } catch (e: any) {
      setError(mapAuthCode(e?.code));
    }
    setGoogleLoading(false);
  };

  return (
    <div style={styles.page}>
      <div style={styles.orb1}/><div style={styles.orb2}/>
      <div className="lifeos-login-card" style={styles.card}>
        <div style={styles.logo}>Life<span style={{color:"var(--accent)"}}>OS</span></div>
        <div style={styles.tagline}>tomar jibon, tomar control</div>

        {error && <div style={styles.error}>{error}</div>}
        {resetSent && <div style={styles.success}>Reset email pathano hoiche — inbox/spam check koro.</div>}

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
          <div style={styles.passwordWrap}>
            <input
              style={styles.passwordInput}
              type={showPass ? "text" : "password"}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onKeyDown={(e) => e.key === "Enter" && handle()}
            />
            <button
              type="button"
              style={styles.showPassBtn}
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? "Password lukao" : "Password dekhao"}
            >
              {showPass ? "Lukao" : "Dekhao"}
            </button>
          </div>
        </div>

        <button style={{...styles.btn, opacity: loading || googleLoading ? 0.7 : 1}} onClick={handle} disabled={loading || googleLoading}>
          {loading ? "Loading..." : mode === "login" ? "Login koro" : "Register koro"}
        </button>

        {mode === "login" && (
          <button type="button" style={styles.forgotBtn} onClick={handleForgotPassword} disabled={loading || googleLoading}>
            Forgot password?
          </button>
        )}

        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>ba</span>
          <span style={styles.dividerLine} />
        </div>

        <button
          type="button"
          style={{...styles.googleBtn, opacity: googleLoading || loading ? 0.7 : 1}}
          onClick={handleGoogle}
          disabled={loading || googleLoading}
        >
          {googleLoading ? "Loading..." : (
            <>
              <GoogleGlyph />
              Google diye login
            </>
          )}
        </button>

        <div style={styles.switchText}>
          {mode === "login" ? (
            <>Notun? <span style={styles.link} onClick={()=>{setMode("register");setError("");setResetSent(false);}}>Register koro</span></>
          ) : (
            <>Already account ache? <span style={styles.link} onClick={()=>{setMode("login");setError("");setResetSent(false);}}>Login koro</span></>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden style={{ flexShrink: 0 }}>
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
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
  success: { background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:8, padding:"10px 14px", color:"var(--green)", fontSize:12, marginBottom:14 },
  field: { display:"flex", flexDirection:"column", gap:6, marginBottom:12 },
  label: { fontSize:10, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.08em" },
  input: { background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, padding:"11px 14px", color:"var(--text)", fontSize:14, outline:"none", width:"100%" },
  passwordWrap: { position:"relative" as const, width:"100%" },
  passwordInput: {
    background:"var(--bg3)",
    border:"1px solid var(--border)",
    borderRadius:8,
    padding:"11px 72px 11px 14px",
    color:"var(--text)",
    fontSize:14,
    outline:"none",
    width:"100%",
    boxSizing:"border-box" as const,
  },
  showPassBtn: {
    position:"absolute" as const,
    right:6,
    top:"50%",
    transform:"translateY(-50%)",
    background:"transparent",
    border:"none",
    color:"var(--accent)",
    fontSize:12,
    fontWeight:600,
    cursor:"pointer",
    padding:"6px 8px",
    borderRadius:6,
  },
  btn: { width:"100%", background:"var(--accent)", border:"none", borderRadius:8, padding:13, color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", marginTop:8 },
  forgotBtn: { width:"100%", marginTop:10, background:"transparent", border:"none", color:"var(--accent)", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", padding:4, opacity:0.9 },
  divider: { display:"flex", alignItems:"center", gap:12, margin:"18px 0 14px" },
  dividerLine: { flex:1, height:1, background:"var(--border)" },
  dividerText: { fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.06em" },
  googleBtn: {
    width:"100%",
    display:"flex",
    alignItems:"center",
    justifyContent:"center",
    gap:10,
    background:"var(--bg3)",
    border:"1px solid var(--border)",
    borderRadius:8,
    padding:13,
    color:"var(--text)",
    fontSize:14,
    fontWeight:600,
    cursor:"pointer",
  },
  switchText: { color:"var(--text3)", fontSize:13, marginTop:20, textAlign:"center" as const },
  link: { color:"var(--accent)", cursor:"pointer" },
};
