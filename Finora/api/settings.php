<?php
require_once 'db.php';
requireAuth();

$pdo = getDB();
$action = $_GET['action'] ?? 'get';

if ($action === 'get') {
    $rows = $pdo->query("SELECT key, value FROM settings WHERE key != 'password_hash'")->fetchAll();
    $out = [];
    foreach ($rows as $r) $out[$r['key']] = $r['value'];
    echo json_encode(['success' => true, 'settings' => $out]);
    exit();
}

if ($action === 'save') {
    $data = jsonBody();
    $allowed = [
        'company_name','company_trading_name','company_cin',
        'company_address','company_city','company_state','company_postal','company_country',
        'company_phone','company_email','company_website',
        'gst_number','home_state',
        'cgst_default','sgst_default','igst_default',
        'bank_account_name','bank_account_number','bank_branch','bank_ifsc',
        'invoice_prefix','invoice_next_number','quote_prefix','quote_next_number',
        'payment_terms_days','thank_you_message','currency','currency_symbol',
        'session_timeout_min'
    ];
    foreach ($allowed as $k) {
        if (array_key_exists($k, $data)) settingSet($pdo, $k, $data[$k]);
    }
    logActivity($pdo, 'Settings updated');
    echo json_encode(['success' => true]);
    exit();
}

if ($action === 'categories_list') {
    $rows = $pdo->query("SELECT * FROM categories ORDER BY type, name")->fetchAll();
    echo json_encode(['success' => true, 'categories' => $rows]);
    exit();
}

if ($action === 'categories_add') {
    $data = jsonBody();
    $type = $data['type'] ?? 'expense';
    $name = trim($data['name'] ?? '');
    if (!$name) { http_response_code(400); echo json_encode(['error' => 'Name required']); exit(); }
    $stmt = $pdo->prepare("INSERT INTO categories (type, name) VALUES (?, ?)");
    $stmt->execute([$type, $name]);
    echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
    exit();
}

if ($action === 'categories_delete') {
    $data = jsonBody();
    $id = (int)($data['id'] ?? 0);
    $pdo->prepare("DELETE FROM categories WHERE id = ?")->execute([$id]);
    echo json_encode(['success' => true]);
    exit();
}

http_response_code(400);
echo json_encode(['error' => 'Unknown action']);
?>
