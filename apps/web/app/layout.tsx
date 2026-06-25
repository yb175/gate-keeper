import type { Metadata } from "next";
import localFont from "next/font/local";
import Navbar from "../components/Navbar";
import StoreProvider from "../store/StoreProvider";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "GateKeeper Dashboard",
  description: "Internal security operations dashboard for LLM agent control",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-zinc-950 text-zinc-100 min-h-screen flex flex-col antialiased`}
      >
        <StoreProvider>
          <Navbar />
          <main className="flex-1 w-full mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </StoreProvider>
      </body>
    </html>
  );
}
