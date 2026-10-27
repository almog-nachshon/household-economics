# בית 2030 — הנחיות לעבודה

דשבורד פיננסי אישי למעקב אחרי ההתקדמות לקניית בית ב-2030. ממשק בעברית, RTL.

## סטאק
- Next.js 14 (app router, JavaScript, בלי TypeScript), Server Actions לטפסים
- Prisma + SQLite (`prisma/schema.prisma`), גרפים עם Recharts
- Docker עם output standalone; ה-DB בתיקיית `data/` כ-volume

## מבנה
- `app/page.js` — מסך מד היעד
- `app/update/page.js` — טופס עדכון חודשי (Snapshot לכל חודש)
- `app/expenses` — הוצאות קבועות (הוראות קבע / אשראי, עם חודש סיום לתשלומים) וקניות משתנות; חישובי התקציב ב-`lib/budget.js`
- `app/invest` — חלוקת ההפקדה החודשית באינטראקטיב. מועמדים (מדדים / מתכות / מניות) ופרופילי סיכון ב-`lib/portfolio.js`, מחירים מ-Yahoo ב-`lib/market.js` (cache של 12 שעות). `lib/advisor.js` שולח ל-Claude (`claude-opus-5-5`, web search) את הנתונים ומקבל 5–6 החזקות כ-JSON; נשמר ב-`AiPlan`. ״קניתי״ שומר `InvestPick` ומעדכן את `allocations`. צריך `ANTHROPIC_API_KEY` ב-`.env`
- הרצה אוטומטית ב-10 לחודש: `POST /api/cron/invest` עם `Authorization: Bearer $CRON_SECRET` (רץ פעם בחודש). את ה-cron בשרת צריך להתקין בנפרד
- `app/deposit` (הפקדה ב-1 לחודש + כפתור "הפקדתי"), `app/year`, `app/cashflow`, `app/emergency`, `app/settings`
- `lib/plan.js` — כללי החלוקה: buffer בעו״ש, הפקדה קבועה ל-ETF, מילוי קרן חירום, השאר לבית
- כניסה: `middleware.js` + `lib/session.js` (cookie חתום) + `lib/auth.js` (scrypt; TOTP רק אם `TOTP_SECRET` מוגדר — כרגע כבוי, כניסה בסיסמה בלבד). משתנים ב-`.env`, יוצרים עם `npm run auth:setup`
- `lib/goal.js` — חישובי היעד. הון עצמי לבית = homeSavings + kerenOld (קרן ההשתלמות החדשה נזילה רק ב-2032)

## כללים
- אסור להכניס נתונים פיננסיים אמיתיים לריפו. רק נתוני דמה ב-`prisma/seed.mjs`. קבצי `.db` ו-`.env` נשארים מחוץ ל-git.
- הריפו פרטי.
- פריסה: שרת Hetzner של VoltShare, תיקייה `/opt/finance`, שירות `finance-app` בלי `ports:` על רשת `voltshare_default`. Caddy של VoltShare מפנה את `finance.2.31.65.97.sslip.io` ל-`finance-app:3000`. הבלוק נמצא בשרת ב-`/opt/caddy-sites/finance.caddy` (מחוץ לריפו של VoltShare, שה-Caddyfile שלו רק עושה `import` לתיקייה), כך ש-deploy של VoltShare לא דורס אותו. אחרי עריכה: `docker exec voltshare-web-1 caddy reload --config /etc/caddy/Caddyfile`.
- עדכון השרת: tar של הריפו (בלי node_modules, .next, .git, .env, *.db) ל-`/opt/finance`, ואז `docker compose up -d --build`.
- לעולם לא לקרוא לשירות `api`, `web` או `db` (מתנגש עם VoltShare).

## מסכים מתוכננים
קרנות השתלמות, תיק ETF מול חלוקת יעד, סילוק חובות עם סימולציית פירעון מוקדם.
