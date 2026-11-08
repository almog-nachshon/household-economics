# המחקר של ChatGPT

מדביקים ב-ChatGPT (עם חיפוש ברשת) את ההוראה למטה, מחליפים את רשימת הסימולים, ומדביקים את ה-JSON שחוזר ב-Claude Code.
הוא נשמר עם `scripts/save-gpt-research.js`, והאתר עושה ממוצע 50/50 עם המחקר של Claude.

```
Research these stocks/ETFs as of today using web search: <SYMBOLS>
For each, use 6+ current, dated sources (analyst aggregators like StockAnalysis/MarketBeat/TipRanks, recent rating and
target changes, the latest earnings report, technicals: price vs 50/200-day moving average and RSI, forward P/E,
sentiment incl. named analysts). Never invent numbers; if not found, say so and score that part 0.
Score five parts from -2 to +2: analysts, revisions (rating changes + earnings), technicals, valuation, sentiment.
Return ONLY JSON:
{"asOf":"YYYY-MM-DD","results":[{"symbol":"","confidence":1-5,"summary_he":"one Hebrew sentence",
"reasons_he":["short Hebrew facts with numbers"],
"components":{"analysts":{"score":0,"note_he":""},"revisions":{"score":0,"note_he":""},"technicals":{"score":0,"note_he":""},
"valuation":{"score":0,"note_he":""},"sentiment":{"score":0,"note_he":""}},
"sources":[{"name":"","url":"","kind":"analysts|revisions|technicals|valuation|sentiment","date":"YYYY-MM-DD","note_he":""}]}]}
```
