<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

function getDB() {
    $dbPath = __DIR__ . '/database/tasks.db';
    try {
        $pdo = new PDO('sqlite:' . $dbPath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA journal_mode=WAL');

        // Tasks table
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS tasks (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                title         TEXT NOT NULL,
                assigned_to   TEXT NOT NULL,
                status        TEXT NOT NULL DEFAULT 'backlog',
                sort_order    INTEGER DEFAULT 0,
                due_date      DATE DEFAULT NULL,
                description   TEXT DEFAULT NULL,
                priority      TEXT DEFAULT 'medium',
                time_estimate TEXT DEFAULT NULL,
                labels        TEXT DEFAULT NULL,
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ");

        // Migrate older installs
        $cols = array_column($pdo->query("PRAGMA table_info(tasks)")->fetchAll(), 'name');
        foreach (['due_date','description','priority','time_estimate','labels'] as $col) {
            if (!in_array($col, $cols)) {
                $default = $col === 'priority' ? "'medium'" : 'NULL';
                $pdo->exec("ALTER TABLE tasks ADD COLUMN $col TEXT DEFAULT $default");
            }
        }

        // v8 — recurring task columns (safe migration, defaults preserve existing rows)
        $cols = array_column($pdo->query("PRAGMA table_info(tasks)")->fetchAll(), 'name');
        if (!in_array('is_recurring', $cols)) {
            $pdo->exec("ALTER TABLE tasks ADD COLUMN is_recurring INTEGER DEFAULT 0");
        }
        if (!in_array('recurrence_pattern', $cols)) {
            $pdo->exec("ALTER TABLE tasks ADD COLUMN recurrence_pattern TEXT DEFAULT NULL");
        }
        if (!in_array('recurrence_parent_id', $cols)) {
            $pdo->exec("ALTER TABLE tasks ADD COLUMN recurrence_parent_id INTEGER DEFAULT NULL");
        }

        // Checklist items
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS checklist_items (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id    INTEGER NOT NULL,
                text       TEXT NOT NULL,
                checked    INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        ");

        // Comments
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS comments (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id    INTEGER NOT NULL,
                author     TEXT NOT NULL,
                body       TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        ");

        // Activity logs
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS activity_logs (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_name  TEXT NOT NULL,
                action     TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ");

        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'DB error: ' . $e->getMessage()]);
        exit();
    }
}
?>
