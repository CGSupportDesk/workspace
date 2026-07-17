<?php
require_once 'db.php';

$action = $_GET['action'] ?? '';
$pdo = getDB();
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

if ($action === 'check') {
    if (isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true) {
        $_SESSION['last_activity'] = time();
        echo json_encode(['authenticated' => true]);
    } else {
        echo json_encode(['authenticated' => false]);
    }
    exit();
}

if ($action === 'login') {
    $data = jsonBody();
    $password = $data['password'] ?? '';

    // Rate limit: max 5 failures from same IP in last 15 minutes
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND success = 0 AND attempted_at > datetime('now', '-15 minutes')");
    $stmt->execute([$ip]);
    $fails = (int)$stmt->fetchColumn();
    if ($fails >= 5) {
        http_response_code(429);
        echo json_encode(['error' => 'Too many failed attempts. Try again in 15 minutes.']);
        exit();
    }

    $hash = settingGet($pdo, 'password_hash');
    if (!$hash) {
        http_response_code(500);
        echo json_encode(['error' => 'Auth not configured']);
        exit();
    }

    if (password_verify($password, $hash)) {
        session_regenerate_id(true);
        $_SESSION['logged_in'] = true;
        $_SESSION['last_activity'] = time();
        $pdo->prepare("INSERT INTO login_attempts (ip, success) VALUES (?, 1)")->execute([$ip]);
        // Clean old fail records
        $pdo->prepare("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-1 day')")->execute();
        echo json_encode(['success' => true]);
    } else {
        $pdo->prepare("INSERT INTO login_attempts (ip, success) VALUES (?, 0)")->execute([$ip]);
        sleep(1); // slow down brute force
        http_response_code(401);
        echo json_encode(['error' => 'Incorrect password']);
    }
    exit();
}

if ($action === 'logout') {
    session_unset();
    session_destroy();
    echo json_encode(['success' => true]);
    exit();
}

if ($action === 'change_password') {
    requireAuth();
    $data = jsonBody();
    $current = $data['current'] ?? '';
    $new = $data['new'] ?? '';
    if (strlen($new) < 8) {
        http_response_code(400);
        echo json_encode(['error' => 'New password must be at least 8 characters']);
        exit();
    }
    $hash = settingGet($pdo, 'password_hash');
    if (!password_verify($current, $hash)) {
        http_response_code(401);
        echo json_encode(['error' => 'Current password is incorrect']);
        exit();
    }
    settingSet($pdo, 'password_hash', password_hash($new, PASSWORD_BCRYPT));
    logActivity($pdo, 'Password changed');
    echo json_encode(['success' => true]);
    exit();
}

http_response_code(400);
echo json_encode(['error' => 'Unknown action']);
?>
