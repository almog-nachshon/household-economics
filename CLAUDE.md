# בית 2030 — הנחיות לעבודה

דשבורד פיננסי אישי למעקב אחרי ההתקדמות לקניית בית ב-2030. ממשק בעברית, RTL.

## סטאק
- Next.js 14 (app router, JavaScript, בלי TypeScript), Server Actions לטפסים
- Prisma + SQLite (`prisma/schema.prisma`), גרפים עם Recharts
- Docker עם output standalone; ה-DB בתיקיית `data/` כ-volume

## מבנה
- `app/page.js` — דף ראשי: מד יעד הבית (`homeGoal` ב-`lib/goal.js`: חיסכון לבית + קרנות ״לבית״ שנזילות עד היעד) ואריחים לכל דף
- `app/expenses` — ״הוצאות / הכנסות״: תקציב החודש (`lib/budget.js`) + הטבלה הקבועה `components/BaseBudget.js`: הכנסות (`Income`, חודשיות או שנתיות), הוצאות קבועות לפי תחום דירה/רכב/שוטף (`Expense` עם חודש התחלה וסיום), כרטיסי אשראי (`Card`, אופן תשלום לכל הוצאה), שורת ״כרטיס אשראי / מזומן״ = חיוב הכרטיס הכולל שממנו מקוזזות הוצאות אשראי מפורטות (`cardBillRest`, בלי ספירה כפולה), והלוואות (`Loan`: תשלום+יתרה → חודשים; עם ריבית → ריבית שנותרה). החישובים ב-`lib/base.js`
- `app/funds` — קרנות השתלמות ופנסיה (`Fund`, כרטיס לכל קופה עם מסלול, דמי ניהול, צפי הקופה וכיסויים), תחזית צבירה ב-`lib/funds.js`, ובדיקת מסלולים מול השוק עם Claude (`lib/fund-advisor.js`, נשמר ב-`FundReview`; ידנית או ב-cron של ה-10)
- `app/invest` — 6 החזקות להפקדה ב-10 לחודש: 4 קבוצות קבועות (מדדים 45% / סקטוריאליות 10% / ביטחוניות 25% / סיכון 20%) ומועמדים ב-`lib/portfolio.js`; מחירים מ-Yahoo ב-`lib/market.js` (cache של 12 שעות). `lib/advisor.js` שולח ל-Claude (`claude-opus-5-5`, web search) את הנתונים וההחזקות ומקבל בחירות + המלצות add/hold/reduce/sell; נשמר ב-`AiPlan` לפי חודש ההפקדה. בלי Claude, `completePicks` בוחר לפי ציון. ״קניתי״ שומר `InvestPick` עם יחידות ומחיר קנייה; `lib/holdings.js` מחשב את התיק (עלות, שווי, רווח) והוא נכנס להון העצמי בדף הראשי. צריך `ANTHROPIC_API_KEY` ב-`.env`
- בדיקה אוטומטית: `/etc/cron.d/finance-invest` בשרת מריץ ב-10 לחודש ב-08:00 שעון ישראל (השרת ב-UTC) את `POST /api/cron/invest` עם `Authorization: Bearer $CRON_SECRET`; ההרצה ב-10 סופית ולא נדרסת. בשאר הימים המשתמש מריץ ידנית מהכפתור בדף (לבחירתו, בגלל העלות). לוג: `/var/log/finance-invest.log`
- כניסה: `middleware.js` + `lib/session.js` (cookie חתום) + `lib/auth.js` (scrypt; TOTP רק אם `TOTP_SECRET` מוגדר — כרגע כבוי, כניסה בסיסמה בלבד). משתנים ב-`.env`, יוצרים עם `npm run auth:setup`

## כללים
- אסור להכניס נתונים פיננסיים אמיתיים לריפו. רק נתוני דמה ב-`prisma/seed.mjs`. קבצי `.db` ו-`.env` נשארים מחוץ ל-git.
- הריפו פרטי.
- פריסה: שרת Hetzner של VoltShare, תיקייה `/opt/finance`, שירות `finance-app` בלי `ports:` על רשת `voltshare_default`. Caddy של VoltShare מפנה את `finance.2.31.65.97.sslip.io` ל-`finance-app:3000`. הבלוק נמצא בשרת ב-`/opt/caddy-sites/finance.caddy` (מחוץ לריפו של VoltShare, שה-Caddyfile שלו רק עושה `import` לתיקייה), כך ש-deploy של VoltShare לא דורס אותו. אחרי עריכה: `docker exec voltshare-web-1 caddy reload --config /etc/caddy/Caddyfile`.
- עדכון השרת: tar של הריפו (בלי node_modules, .next, .git, .env, *.db) ל-`/opt/finance`, ואז `docker compose up -d --build`.
- לעולם לא לקרוא לשירות `api`, `web` או `db` (מתנגש עם VoltShare).

- היתרות (קרן חירום, חיסכון לבית, תיק השקעות) נשמרות כ-`Snapshot` של החודש מבלוק ״יתרות החודש״ (`components/Balances.js`)

## מסכים מתוכננים
קרנות השתלמות, תיק ETF מול חלוקת יעד, סילוק חובות עם סימולציית פירעון מוקדם.
