import type { Metadata, Viewport } from "next";
import { ColourStrip } from "@/components/Brand";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { PushPrompt } from "@/components/PushPrompt";
import "./globals.css";

export const metadata: Metadata = {
  title: "Joy House",
  description: "A private community for House of Joy Youth · RCCG Pretoria.",
  applicationName: "Joy House",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Joy House",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1A2A72",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        <div className="app">
          <ColourStrip />
          {children}
          <PushPrompt />
        </div>
      </body>
    </html>
  );
}
