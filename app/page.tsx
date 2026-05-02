"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? "/dashboard" : "/login");
    }
  }, [user, loading, router]);

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"var(--bg)" }}>
      <div style={{ display:"flex", gap:6 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width:8, height:8, borderRadius:"50%", background:"var(--accent)",
            animation:"pulse 1.2s ease infinite",
            animationDelay:`${i*0.2}s`, opacity:0.6
          }}/>
        ))}
      </div>
      <style>{`@keyframes pulse{0%,60%,100%{transform:scale(0.8);opacity:0.3}30%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
