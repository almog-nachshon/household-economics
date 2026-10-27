# בית 2030

דשבורד אישי למעקב אחרי ההתקדמות לקניית בית.

## הרצה מקומית
```bash
cp .env.example .env
npm install
npx prisma db push
npm run seed   # נתוני דמה בלבד
npm run dev
```

## כניסה
```bash
npm run auth:setup -- "סיסמה של 12 תווים לפחות"
```
מעתיקים את שלוש השורות ל-`.env`, ואת `TOTP_SECRET` מוסיפים ל-Google Authenticator (הזנת מפתח ידנית).

## פריסה
ב-`/opt/finance` על השרת: `.env` עם משתני הכניסה, ואז `docker compose up -d --build`. השירות `finance-app` מתחבר לרשת `voltshare_default`, ו-Caddy של VoltShare מפנה אליו את `finance.2-31-65-97.sslip.io`. ה-DB נשמר ב-`./data` ולא נכנס ל-git.

> נתונים פיננסיים אמיתיים לא נכנסים לריפו.
