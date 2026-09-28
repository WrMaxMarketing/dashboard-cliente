import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, Rajdhani } from "next/font/google";
import { BottomNav } from "@/components/trafego/bottom-nav";
import "./trafego.css";

// Fontes só do painel (não afetam o resto do portal).
const display = Rajdhani({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-t-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-t-body" });

export const metadata: Metadata = {
  title: "Tráfego Pago - WRMAX",
  description: "Resultados de Meta Ads em tempo quase real.",
};

export const viewport: Viewport = { themeColor: "#07070a", viewportFit: "cover" };

export default function TrafegoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`trafego-root ${display.variable} ${body.variable} flex-1`}>
      {children}
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
