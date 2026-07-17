<?php
require_once 'db.php';
requireAuth();
$pdo = getDB();
$action = $_GET['action'] ?? 'list';

if ($action === 'list') {
    $rows = $pdo->query("SELECT * FROM clients ORDER BY name COLLATE NOCASE ASC")->fetchAll();
    echo json_encode(['success' => true, 'clients' => $rows]);
    exit();
}

if ($action === 'get') {
    $id = (int)($_GET['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT * FROM clients WHERE id = ?");
    $stmt->execute([$id]);
    $c = $stmt->fetch();
    if (!$c) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit(); }
    echo json_encode(['success' => true, 'client' => $c]);
    exit();
}

if ($action === 'save') {
    $d = jsonBody();
    $name = trim($d['name'] ?? '');
    if (!$name) { http_response_code(400); echo json_encode(['error' => 'Name is required']); exit(); }

    $fields = ['name'=>$name,
        'email' => trim($d['email'] ?? ''),
        'phone' => trim($d['phone'] ?? ''),
        'address' => trim($d['address'] ?? ''),
        'city' => trim($d['city'] ?? ''),
        'state' => trim($d['state'] ?? ''),
        'postal_code' => trim($d['postal_code'] ?? ''),
        'country' => trim($d['country'] ?? 'India'),
        'gst_number' => trim($d['gst_number'] ?? ''),
        'notes' => trim($d['notes'] ?? ''),
    ];

    if (!empty($d['id'])) {
        $id = (int)$d['id'];
        $set = []; $vals = [];
        foreach ($fields as $k=>$v) { $set[] = "$k = ?"; $vals[] = $v; }
        $vals[] = $id;
        $stmt = $pdo->prepare("UPDATE clients SET ".implode(', ', $set)." WHERE id = ?");
        $stmt->execute($vals);
        logActivity($pdo, "Updated client: $name");
        echo json_encode(['success' => true, 'id' => $id]);
    } else {
        $cols = implode(',', array_keys($fields));
        $place = implode(',', array_fill(0, count($fields), '?'));
        $stmt = $pdo->prepare("INSERT INTO clients ($cols) VALUES ($place)");
        $stmt->execute(array_values($fields));
        $id = $pdo->lastInsertId();
        logActivity($pdo, "Added client: $name");
        echo json_encode(['success' => true, 'id' => $id]);
    }
    exit();
}

if ($action === 'delete') {
    $d = jsonBody();
    $id = (int)($d['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT name FROM clients WHERE id = ?");
    $stmt->execute([$id]);
    $name = $stmt->fetchColumn();
    $pdo->prepare("DELETE FROM clients WHERE id = ?")->execute([$id]);
    if ($name) logActivity($pdo, "Deleted client: $name");
    echo json_encode(['success' => true]);
    exit();
}

http_response_code(400);
echo json_encode(['error' => 'Unknown action']);
?>
