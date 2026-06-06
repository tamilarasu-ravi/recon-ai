import { Inter } from "next/font/google";

import { AppShell } from "@/app/components/app-shell";
import { AppProviders } from "@/app/providers";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "ReconAI",
  description: "ReconAI — event-driven CFO platform for close tagging, policy gates, and payables",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
