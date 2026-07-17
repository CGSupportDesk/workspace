<?php
// Finora — DB connection + auth/session helpers
ini_set('session.cookie_httponly', 1);
ini_set('session.use_strict_mode', 1);
ini_set('session.cookie_samesite', 'Lax');
if (!empty($_SERVER['HTTPS'])) ini_set('session.cookie_secure', 1);
session_name('finora_sid');
session_start();

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

function getDB() {
    $dbPath = __DIR__ . '/database/finora.db';
    try {
        $pdo = new PDO('sqlite:' . $dbPath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('PRAGMA foreign_keys=ON');

        $pdo->exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");

        $pdo->exec("CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL, email TEXT, phone TEXT,
            address TEXT, city TEXT, state TEXT, postal_code TEXT,
            country TEXT DEFAULT 'India',
            gst_number TEXT, notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )");

        $pdo->exec("CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_type TEXT NOT NULL DEFAULT 'invoice',
            doc_number TEXT NOT NULL UNIQUE,
            client_id INTEGER,
            client_snapshot TEXT NOT NULL,
            issue_date DATE NOT NULL, due_date DATE,
            subject TEXT,
            currency TEXT DEFAULT 'INR',
            currency_symbol TEXT DEFAULT '₹',
            items TEXT NOT NULL,
            subtotal REAL NOT NULL DEFAULT 0,
            discount_type TEXT DEFAULT 'none',
            discount_value REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            taxable REAL DEFAULT 0,
            gst_enabled INTEGER DEFAULT 0,
            gst_type TEXT DEFAULT 'igst',
            cgst_rate REAL DEFAULT 0, sgst_rate REAL DEFAULT 0, igst_rate REAL DEFAULT 0,
            cgst_amount REAL DEFAULT 0, sgst_amount REAL DEFAULT 0, igst_amount REAL DEFAULT 0,
            total REAL NOT NULL DEFAULT 0,
            notes TEXT,
            status TEXT DEFAULT 'draft',
            paid_date DATE,
            converted_from_quote_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )");

        $pdo->exec("CREATE TABLE IF NOT EXISTS ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT,
            entry_date DATE NOT NULL,
            description TEXT,
            invoice_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )");

        $pdo->exec("CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )");

        $pdo->exec("CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )");

        $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            success INTEGER DEFAULT 0,
            attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )");

        // Existing installations keep their password hash. Fresh installs require
        // a deployment secret instead of shipping a public default password.
        $existingPasswordHash = $pdo->query("SELECT value FROM settings WHERE key = 'password_hash'")->fetchColumn();
        $initialPassword = getenv('FINORA_INITIAL_PASSWORD') ?: '';
        if (!$existingPasswordHash && strlen($initialPassword) < 12) {
            throw new RuntimeException('Set FINORA_INITIAL_PASSWORD to at least 12 characters before the first Finora request.');
        }

        // Seed defaults
        $defaults = [
            'password_hash'         => $existingPasswordHash ?: password_hash($initialPassword, PASSWORD_BCRYPT),
            'company_name'          => 'Beyond Closinggap Private Limited',
            'company_trading_name'  => 'Closing Gap',
            'company_cin'           => 'U62099KL2025PTC096924',
            'company_address'       => 'Suite No. 36, 3rd Floor, Sharon Bliss, Pattom',
            'company_city'          => 'Trivandrum',
            'company_state'         => 'Kerala',
            'company_postal'        => '695003',
            'company_country'       => 'India',
            'company_phone'         => '+91 90742 94791',
            'company_email'         => 'admin@theclosinggap.net',
            'company_website'       => 'www.theclosinggap.net',
            'gst_number'            => '',
            'home_state'            => 'Kerala',
            'cgst_default'          => '9',
            'sgst_default'          => '9',
            'igst_default'          => '18',
            'bank_account_name'     => 'Beyond Closinggap Private Limited',
            'bank_account_number'   => getenv('FINORA_BANK_ACCOUNT_NUMBER') ?: '',
            'bank_branch'           => getenv('FINORA_BANK_BRANCH') ?: '',
            'bank_ifsc'             => getenv('FINORA_BANK_IFSC') ?: '',
            'invoice_prefix'        => 'CG-',
            'invoice_next_number'   => '1006',
            'quote_prefix'          => 'Q-',
            'quote_next_number'     => '1001',
            'payment_terms_days'    => '5',
            'thank_you_message'     => 'Thank you for choosing Closing Gap. We appreciate your trust and look forward to serving you again.',
            'currency'              => 'INR',
            'currency_symbol'       => '₹',
            'session_timeout_min'   => '60',
        ];
        $stmt = $pdo->prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
        foreach ($defaults as $k => $v) $stmt->execute([$k, $v]);

        $count = (int)$pdo->query("SELECT COUNT(*) FROM categories")->fetchColumn();
        if ($count === 0) {
            $cats = [
                ['income','Client Payment'],['income','Refund Received'],['income','Other Income'],
                ['expense','Software & Subscriptions'],['expense','Office & Rent'],['expense','Travel & Transport'],
                ['expense','Marketing & Ads'],['expense','Salaries & Payroll'],['expense','Utilities'],
                ['expense','Professional Fees'],['expense','Tax & Statutory'],['expense','Bank Charges'],
                ['expense','Other Expense'],
            ];
            $stmt = $pdo->prepare("INSERT INTO categories (type, name) VALUES (?, ?)");
            foreach ($cats as $c) $stmt->execute($c);
        }

        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'DB error: '.$e->getMessage()]);
        exit();
    }
}

function requireAuth() {
    $timeoutMin = 60;
    if (isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true) {
        if (isset($_SESSION['last_activity']) && time() - $_SESSION['last_activity'] > $timeoutMin * 60) {
            session_unset(); session_destroy();
            http_response_code(401);
            echo json_encode(['error' => 'Session expired', 'code' => 'expired']);
            exit();
        }
        $_SESSION['last_activity'] = time();
        return;
    }
    http_response_code(401);
    echo json_encode(['error' => 'Not authenticated', 'code' => 'auth']);
    exit();
}

function jsonBody() { return json_decode(file_get_contents('php://input'), true) ?: []; }

function logActivity($pdo, $msg) {
    $stmt = $pdo->prepare("INSERT INTO activity_logs (action) VALUES (?)");
    $stmt->execute([$msg]);
}

function settingGet($pdo, $key, $default = '') {
    $stmt = $pdo->prepare("SELECT value FROM settings WHERE key = ?");
    $stmt->execute([$key]);
    $v = $stmt->fetchColumn();
    return $v === false ? $default : $v;
}

function settingSet($pdo, $key, $value) {
    $stmt = $pdo->prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    $stmt->execute([$key, $value]);
}
?>
