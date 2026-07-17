<?php
require_once 'db.php';
$pdo = getDB();

$id = isset($_GET['id']) ? intval($_GET['id']) : 0;
if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit(); }

$stmt = $pdo->prepare("SELECT * FROM tasks WHERE id = ?");
$stmt->execute([$id]);
$task = $stmt->fetch();
if (!$task) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit(); }

$task['labels'] = $task['labels'] ? json_decode($task['labels'], true) : [];
$task['is_recurring'] = (int)($task['is_recurring'] ?? 0);
$task['recurrence_parent_id'] = $task['recurrence_parent_id'] !== null ? (int)$task['recurrence_parent_id'] : null;

$chk = $pdo->prepare("SELECT * FROM checklist_items WHERE task_id = ? ORDER BY sort_order ASC, id ASC");
$chk->execute([$id]);
$task['checklist'] = $chk->fetchAll();
foreach ($task['checklist'] as &$item) $item['checked'] = (bool)$item['checked'];

$cmt = $pdo->prepare("SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC");
$cmt->execute([$id]);
$task['comments'] = $cmt->fetchAll();

echo json_encode(['success' => true, 'task' => $task]);
?>
