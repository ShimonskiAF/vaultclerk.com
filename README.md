# vaultclerk.com

Landing page for Vault Clerk, a local-first desktop app for independent musicians by Craving Sofa Entertainment.

- Static pages: `index.html` (landing + beta sign-up), `privacy.html`, `thanks.html`, `404.html`
- Search and AI-answer files: `robots.txt`, `sitemap.xml`, `llms.txt`, JSON-LD inside `index.html`
- `api/beta.js`: Vercel serverless function that appends beta sign-ups to a private Google Sheet

Copy follows the project doc "Vault Clerk: what the app does today (for the landing page)". Keep it in step with that doc.

## Environment variables (Vercel only, never commit)

- `GOOGLE_SERVICE_ACCOUNT_JSON`: service account key JSON, editor on the sign-up sheet only
- `BETA_SHEET_ID`: the sign-up sheet's ID
- `BETA_SHEET_RANGE` (optional): defaults to `A1`, the first tab
