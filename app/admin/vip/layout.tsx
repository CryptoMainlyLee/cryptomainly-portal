import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VIP Admin | CryptoMainly",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function VipAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
