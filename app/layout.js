import "./globals.css";

export const metadata = {
  title: "Auretix | AI Decision Engine for Supply Chain",
  description:
    "Auretix is an AI-powered decision engine that helps supply chain teams predict inventory risks, optimize operations, and act with confidence.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
