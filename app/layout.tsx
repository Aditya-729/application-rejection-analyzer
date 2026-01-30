import "./globals.css";

export const metadata = {
  title: "Application Rejection Analyzer",
  description: "Find likely rejection reasons from eligibility rules.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
