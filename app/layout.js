import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const siteName = "LabLink";
const siteDescription =
  "大学研究の実験日程を確認・予約するためのWebサイトです。";
const siteTitle = "LabLink | 大学研究の実験日程予約サイト";

// Vercelの本番URLに合わせてください。
// 環境変数 NEXT_PUBLIC_SITE_URL を設定している場合は、そちらが優先されます。
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://rits-lab-link.vercel.app";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  metadataBase: new URL(siteUrl),

  title: {
    default: siteTitle,
    template: "%s | LabLink",
  },

  description: siteDescription,
  applicationName: siteName,

  manifest: "/site.webmanifest",

  icons: {
    icon: [
      { url: "/favicon.ico" },
      {
        url: "/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },

  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName,
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    images: [
      {
        url: "/lablink-ogp.png",
        width: 1200,
        height: 630,
        alt: "LabLink",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/lablink-ogp.png"],
  },
};

export const viewport = {
  themeColor: "#10B981",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}