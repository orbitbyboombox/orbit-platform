import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "ORBIT by BOOMBOX",
  description: "La plataforma operativa de BOOMBOX.",
  icons: {
    icon: [
      { url: "/brand/orbit-icon-light.png", media: "(prefers-color-scheme: light)" },
      { url: "/brand/orbit-icon-dark.png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/brand/orbit-icon-light.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="dark" lang="es" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
