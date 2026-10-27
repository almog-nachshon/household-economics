import "./globals.css";

export const metadata = { title: "בית 2030" };

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <nav>
          <a href="/">ראשי</a>
          <a href="/expenses">הוצאות / הכנסות</a>
          <a href="/invest">השקעות</a>
          <a href="/funds">קרנות ופנסיה</a>
          <a href="/settings">הגדרות</a>
          <a href="/login" className="nav-end">יציאה</a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
