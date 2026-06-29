import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { LifeOSInit } from "@/components/lifeos-init";

const sora = Sora({ subsets: ["latin"], weight: ["300","400","500","600"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "LifeOS — Tomar Jibon, Tomar Control",
  description: "Personal life & finance monthly planner",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "LifeOS", statusBarStyle: "black-translucent" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={sora.className}>
        <LifeOSInit />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
