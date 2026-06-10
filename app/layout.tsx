import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

const sora = Sora({ subsets: ["latin"], weight: ["300","400","500","600"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "LifeOS — Tomar Jibon, Tomar Control",
  description: "Personal life & finance management app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={sora.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
