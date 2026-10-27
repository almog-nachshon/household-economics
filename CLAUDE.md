# בית 2030 — הנחיות לעבודה

דשבורד פיננסי אישי למעקב אחרי ההתקדמות לקניית בית ב-2030. ממשק בעברית, RTL.

## סטאק
- Next.js 14 (app router, JavaScript, בלי TypeScript), Server Actions לטפסים
- Prisma + SQLite (`prisma/schema.prisma`), גרפים עם Recharts
- Docker עם output standalone; ה-DB בתיקיית `data/` כ-volume

## מבנה
- `app/page.js` — מסך מד היעד
- `app/update/page.js` — טופס עדכון חודשי (Snapshot לכל חודש)
- `lib/goal.js` — חישובי היעד. הון עצמי לבית = homeSavings + kerenOld (קרן ההשתלמות החדשה נזילה רק ב-2032)

## כללים
- אסור להכניס נתונים פיננסיים אמיתיים לריפו. רק נתוני דמה ב-`prisma/seed.mjs`. קבצי `.db` ו-`.env` נשארים מחוץ ל-git.
- הריפו פרטי.
- הפריסה תהיה לשרת Hetzner (ששם רץ גם VoltShare), מאחורי reverse proxy עם HTTPS ואימות (סיסמה + 2FA).

## מסכים מתוכננים
תזרים חודשי, קרן חירום (יעד 90 אלף), קרנות השתלמות, תיק ETF מול חלוקת יעד, סילוק חובות עם סימולציית פירעון מוקדם, כניסה מאובטחת.
