# בית 2030 — הנחיות לעבודה

דשבורד פיננסי אישי למעקב אחרי ההתקדמות לקניית בית ב-2030. ממשק בעברית, RTL.

## סטאק
- Next.js 14 (app router, JavaScript, בלי TypeScript), Server Actions לטפסים
- Prisma + SQLite (`prisma/schema.prisma`), גרפים עם Recharts
- Docker עם output standalone; ה-DB בתיקיית `data/` כ-volume

## מבנה
- `app/page.js` — מסך מד היעד
- `app/update/page.js` — טופס עדכון חודשי (Snapshot לכל חודש)
- `app/deposit` (הפקדה ב-1 לחודש + כפתור "הפקדתי"), `app/year`, `app/cashflow`, `app/emergency`, `app/settings`
- `lib/plan.js` — כללי החלוקה: buffer בעו״ש, הפקדה קבועה ל-ETF, מילוי קרן חירום, השאר לבית
- כניסה: `middleware.js` + `lib/session.js` (cookie חתום) + `lib/auth.js` (scrypt + TOTP). משתנים ב-`.env`, יוצרים עם `npm run auth:setup`
- `lib/goal.js` — חישובי היעד. הון עצמי לבית = homeSavings + kerenOld (קרן ההשתלמות החדשה נזילה רק ב-2032)

## כללים
- אסור להכניס נתונים פיננסיים אמיתיים לריפו. רק נתוני דמה ב-`prisma/seed.mjs`. קבצי `.db` ו-`.env` נשארים מחוץ ל-git.
- הריפו פרטי.
- פריסה: שרת Hetzner של VoltShare, תיקייה `/opt/finance`, שירות `finance-app` בלי `ports:` על רשת `voltshare_default`. Caddy של VoltShare מפנה את `finance.2-31-65-97.sslip.io` ל-`finance-app:3000`; הבלוק נערך ב-`deploy/Caddyfile` בריפו של VoltShare.
- לעולם לא לקרוא לשירות `api`, `web` או `db` (מתנגש עם VoltShare).

## מסכים מתוכננים
קרנות השתלמות, תיק ETF מול חלוקת יעד, סילוק חובות עם סימולציית פירעון מוקדם.
