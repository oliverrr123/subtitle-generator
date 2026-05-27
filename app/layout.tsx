import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Subtitle Generator",
  description: "Generate word-by-word short-form subtitles for horizontal videos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
