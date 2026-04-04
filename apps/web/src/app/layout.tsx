import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navigation from "@/components/Navigation";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mycologs - きのこ同定プラットフォーム",
  description: "きのこ同定と菌類探索のためのプラットフォーム。採集仲間とつながり、コミュニティから学びましょう。",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Navigation />
        <main className="flex-1">{children}</main>
        <footer className="bg-gray-900 text-white py-8">
          <div className="container mx-auto px-4 text-center">
            <p>&copy; 2026 Mycologs. きのこ愛好家をつなぐプラットフォーム。</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
