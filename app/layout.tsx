import type { Metadata } from "next";
import { Figtree, EB_Garamond } from "next/font/google";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  weight: ["400"],
  style: ["italic"],
});

export const metadata: Metadata = {
  title: "Voice Shopping Assistant",
  description: "AI-powered voice shopping assistant - speak or type to find products",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${figtree.variable} ${ebGaramond.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
