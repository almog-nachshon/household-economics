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

## פריסה
`docker compose up -d --build` על השרת. ה-DB נשמר ב-`./data` ולא נכנס ל-git.

> נתונים פיננסיים אמיתיים לא נכנסים לריפו.
