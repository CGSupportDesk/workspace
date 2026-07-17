# Finora — Closing Gap Finance Suite

A premium invoice, quote, and finance webapp for Beyond Closinggap Private Limited.

---

## 🚀 Hostinger Deployment

### 1. Upload Files

Upload the entire `Finora` folder into `public_html/` on Hostinger so the final path is:

```
public_html/Finora/
├── index.html
├── .htaccess
├── api/
│   ├── *.php
│   └── database/    ← must be writable
└── assets/
    └── logo.png
```

You can use Hostinger's File Manager or any FTP client (FileZilla, etc.) to upload. Final URL:

**https://theclosinggap.net/Finora/**

### 2. Set Permissions

In Hostinger File Manager, **right-click `api/database/` → Permissions → set to `755`** (or `775` if the web user can't write).

Sometimes Hostinger needs `777` for SQLite WAL mode to work. If you see "DB error" on first load, set it to `777` temporarily.

### 3. First Visit

1. Open `https://theclosinggap.net/Finora/` in your browser
2. The database (`finora.db`) is automatically created on first visit, seeded with your company details and default categories
3. Before the first request, set `FINORA_INITIAL_PASSWORD` in the hosting environment to a unique password of at least 12 characters.
4. Sign in with that environment-provided password.

### 4. Change Your Password Immediately

For a fresh deployment, you may also set `FINORA_BANK_ACCOUNT_NUMBER`, `FINORA_BANK_BRANCH`, and `FINORA_BANK_IFSC` in the hosting environment. Existing databases retain their current settings.

Settings → Account → Change Password. The system enforces minimum 8 characters; longer + mixed characters = better.

---

## 🔒 Security Notes

| Protection | How it works |
|------------|------|
| Password storage | bcrypt-hashed in DB, never stored or logged in plaintext |
| Session security | HttpOnly + SameSite=Lax + Secure cookies |
| Rate limiting | 5 failed attempts per IP per 15 min → blocked |
| Brute force defense | 1-second delay on every failed login |
| Session timeout | Auto-logout after 60 min idle (editable in Settings) |
| SQL injection | All queries use PDO prepared statements |
| Clickjacking | X-Frame-Options: DENY |
| Database privacy | `.htaccess` blocks all direct DB file access |
| Directory listing | Disabled via `Options -Indexes` |

The `.htaccess` file also has a commented-out **Force HTTPS** rule. Uncomment those lines once you've confirmed Hostinger's free SSL is active on the domain. Easy way to test SSL: open `https://theclosinggap.net/Finora/` directly. If it loads without a browser warning, SSL is good.

---

## 📦 What's Inside

- **Dashboard** — Net profit, income/expense, outstanding, overdue, 12-month chart, top clients, recent invoices, expense breakdown
- **Invoices** — Full builder with line items, discount, GST auto-detection, multi-currency, premium PDF print view
- **Quotes** — Same builder, with one-click conversion to invoice
- **Clients** — Card grid, save/reuse, per-client billed total
- **Income & Expense** — Track money in and out, auto-entries from paid invoices, category breakdown
- **Settings** — All company details, bank info, tax rates, prefixes, payment terms, currency, password

---

## 💾 Backups

The entire database is one file: `api/database/finora.db`.

Download it periodically through Hostinger File Manager → right-click → Download. Keep it somewhere safe (Google Drive, Dropbox, etc.).

To restore: replace the file. Done.

---

## 🛠 Troubleshooting

**"DB error: unable to open database file"**
→ The `api/database/` folder isn't writable. Set permissions to 755 or 775 or 777.

**"Not authenticated" on every action**
→ Cookies may be blocked. Make sure you're accessing via HTTPS and the browser allows cookies.

**Print view looks off in the browser preview but fine in the PDF**
→ The browser preview can be misleading. Always save to PDF and check the actual file.

**Need to reset the password and locked out?**
→ Open `api/database/finora.db` with a SQLite tool (e.g., DB Browser for SQLite) and update the `settings` table where `key = 'password_hash'`. You can use `password_hash('YourNewPassword', PASSWORD_BCRYPT)` in a PHP script to generate a new bcrypt hash.

---

## 📞 Built For

**Beyond Closinggap Private Limited**
Suite No. 36, 3rd Floor, Sharon Bliss, Pattom, Trivandrum, Kerala 695003, India
+91 90742 94791 · admin@theclosinggap.net · www.theclosinggap.net
CIN: U62099KL2025PTC096924

---

*Made with care · Finora v1.0*
