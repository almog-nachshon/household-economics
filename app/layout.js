import "./globals.css";

export const metadata = { title: "תכנית פיננסית לבית ב-2030" };

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <nav>
          <a href="/" className="brand">🏠 <span className="btn-long">תכנית פיננסית לבית ב-</span>2030</a>
          <a href="/expenses">הוצאות / הכנסות</a>
          <a href="/invest">השקעות</a>
          <a href="/funds">קרנות ופנסיה</a>
          <a href="/settings">הגדרות</a>
          <a href="/login" className="nav-end">יציאה</a>
        </nav>
        <main>{children}</main>
        <footer className="site-footer">
          <a href="/" className="brand">תכנית פיננסית לבית ב-2030</a>
          <span>
            <a href="/expenses">הוצאות / הכנסות</a> · <a href="/invest">השקעות</a> · <a href="/funds">קרנות ופנסיה</a> · <a href="/settings">הגדרות</a>
          </span>
          <span className="label">© {new Date().getFullYear()} · כלי מעקב אישי, לא ייעוץ השקעות</span>
        </footer>
      </body>
    </html>
  );
}
