import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShagunWala | Pooja & Festival Essentials",
  description: "Shop diyas, murtis, pooja essentials, malas, aasan and festive decorations from ShagunWala.",
  applicationName: "ShagunWala",
};

export const viewport: Viewport = {
  themeColor: "#7d2627",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
