import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "YTAudio",
  description: "Search your YouTube audio library",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${geist.className} bg-white text-gray-900 antialiased min-h-full flex flex-col`}>
        <header className="border-b border-gray-100">
          <nav className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
            <Link href="/" className="font-semibold text-lg tracking-tight text-gray-900">
              YTAudio
            </Link>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Library
            </Link>
            <Link href="/import" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Import
            </Link>
            <Link href="/jobs" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Jobs
            </Link>
            <Link href="/connect" className="text-sm text-gray-500 hover:text-gray-900 transition-colors ml-auto flex items-center gap-1">
              Connect YouTube
            </Link>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
