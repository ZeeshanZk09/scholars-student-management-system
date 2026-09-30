import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import { Metadata } from "next";
import { Toaster } from "sonner";

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
    <html lang="en" className="bg-background min-h-full antialiased">
      <body className="min-h-full flex flex-col antialiased">
        <TooltipProvider>
          <Toaster />
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
