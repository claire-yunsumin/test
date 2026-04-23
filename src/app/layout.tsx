import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS App",
  description: "Next.js SaaS Starter with Supabase Auth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
