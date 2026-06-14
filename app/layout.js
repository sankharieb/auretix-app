import "./globals.css";

export const metadata = {
  title: "Auretix | Advisor for Inventory, Procurement, and Supply Chain",
  description:
    "Auretix helps sellers find inventory, procurement, and supply chain risks before they cost money.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
