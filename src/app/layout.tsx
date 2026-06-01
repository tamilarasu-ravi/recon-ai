import { AppShell } from "@/app/components/app-shell";

export const metadata = {
  title: "ReconAI",
  description: "CFO operations platform — capstone demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#fff" }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
