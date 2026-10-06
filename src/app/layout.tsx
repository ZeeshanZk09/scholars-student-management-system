import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scholars Student Management System",
  description: "School management system for academic administration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background min-h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <Toaster closeButton position="top-right" />
            {children}
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
