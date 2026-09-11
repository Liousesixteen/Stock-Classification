import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yidianx",
  description: "本地 A 股产业链股票分类与研究工作台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
