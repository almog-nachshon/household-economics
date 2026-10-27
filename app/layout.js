import "./globals.css";

export const metadata = { title: "בית 2030" };

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <nav>
          <a href="/">יעד הבית</a>
          <a href="/update">עדכון חודשי</a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
