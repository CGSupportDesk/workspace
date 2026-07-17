<?php
require_once 'db.php';
requireAuth();
$pdo = getDB();
$action = $_GET['action'] ?? 'list';

if ($action === 'list') {
    // Optional filters: type, from, to, limit
    $type = $_GET['type'] ?? '';   // 'income' | 'expense' | ''
    $from = $_GET['from'] ?? '';
    $to   = $_GET['to'] ?? '';
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 0;

    $sql = "SELECT l.*, i.doc_number FROM ledger l
            LEFT JOIN invoices i ON i.id = l.invoice_id
            WHERE 1=1";
    $params = [];
    if ($type === 'income' || $type === 'expense') { $sql .= " AND l.type = ?"; $params[] = $type; }
    if ($from) { $sql .= " AND l.entry_date >= ?"; $params[] = $from; }
    if ($to)   { $sql .= " AND l.entry_date <= ?"; $params[] = $to; }
    $sql .= " ORDER BY l.entry_date DESC, l.id DESC";
    if ($limit > 0) $sql .= " LIMIT " . $limit;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    echo json_encode(['success' => true, 'entries' => $stmt->fetchAll()]);
    exit();
}

if ($action === 'get') {
    $id = (int)($_GET['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT * FROM ledger WHERE id = ?");
    $stmt->execute([$id]);
    $r = $stmt->fetch();
    if (!$r) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit(); }
    echo json_encode(['success' => true, 'entry' => $r]);
    exit();
}

if ($action === 'save') {
    $d = jsonBody();
    $type = $d['type'] ?? 'expense';
    $name = trim($d['name'] ?? '');
    $amount = (float)($d['amount'] ?? 0);
    $category = trim($d['category'] ?? '');
    $entryDate = $d['entry_date'] ?? date('Y-m-d');
    $description = trim($d['description'] ?? '');
    $invoiceId = !empty($d['invoice_id']) ? (int)$d['invoice_id'] : null;

    if (!in_array($type, ['income','expense'])) { http_response_code(400); echo json_encode(['error' => 'Type must be income or expense']); exit(); }
    if (!$name) { http_response_code(400); echo json_encode(['error' => 'Name is required']); exit(); }
    if ($amount <= 0) { http_response_code(400); echo json_encode(['error' => 'Amount must be greater than 0']); exit(); }

    if (!empty($d['id'])) {
        $id = (int)$d['id'];
        $stmt = $pdo->prepare("UPDATE ledger SET type=?, name=?, amount=?, category=?, entry_date=?, description=?, invoice_id=? WHERE id=?");
        $stmt->execute([$type, $name, $amount, $category, $entryDate, $description, $invoiceId, $id]);
        logActivity($pdo, ucfirst($type) . " entry updated: $name");
        echo json_encode(['success' => true, 'id' => $id]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO ledger (type, name, amount, category, entry_date, description, invoice_id) VALUES (?,?,?,?,?,?,?)");
        $stmt->execute([$type, $name, $amount, $category, $entryDate, $description, $invoiceId]);
        $id = $pdo->lastInsertId();
        logActivity($pdo, ucfirst($type) . " recorded: $name (" . number_format($amount, 2) . ")");
        echo json_encode(['success' => true, 'id' => $id]);
    }
    exit();
}

if ($action === 'delete') {
    $d = jsonBody();
    $id = (int)($d['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT name, type FROM ledger WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    $pdo->prepare("DELETE FROM ledger WHERE id = ?")->execute([$id]);
    if ($row) logActivity($pdo, ucfirst($row['type']) . " deleted: {$row['name']}");
    echo json_encode(['success' => true]);
    exit();
}

http_response_code(400);
echo json_encode(['error' => 'Unknown action']);
?>
