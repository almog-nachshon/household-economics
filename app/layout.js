import "./globals.css";

export const metadata = { title: "בית 2030" };

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <nav>
          <a href="/">יעד הבית</a>
          <a href="/deposit">הפקדה החודש</a>
          <a href="/year">תוכנית שנתית</a>
          <a href="/cashflow">תזרים</a>
          <a href="/emergency">קרן חירום</a>
          <a href="/update">עדכון חודשי</a>
          <a href="/settings">הגדרות</a>
          <a href="/login">יציאה</a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
