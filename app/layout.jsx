import "./globals.css";
import { AppProvider } from "@/lib/AppContext";

export const metadata = {
  title: "ContentAI MVP",
  description: "ContentAI prototype-aligned fullstack MVP",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
