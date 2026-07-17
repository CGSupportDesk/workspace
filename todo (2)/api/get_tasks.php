<?php
require_once 'db.php';
$pdo = getDB();

$tasks = $pdo->query("SELECT * FROM tasks ORDER BY sort_order ASC, created_at ASC")->fetchAll();

// Attach checklist summary to each task
$stmt = $pdo->query("SELECT task_id, COUNT(*) as total, SUM(checked) as done FROM checklist_items GROUP BY task_id");
$chk = [];
foreach ($stmt->fetchAll() as $row) {
    $chk[$row['task_id']] = ['total' => (int)$row['total'], 'done' => (int)$row['done']];
}

foreach ($tasks as &$t) {
    $t['checklist_summary'] = $chk[$t['id']] ?? ['total' => 0, 'done' => 0];
    $t['labels'] = $t['labels'] ? json_decode($t['labels'], true) : [];
    $t['is_recurring'] = (int)($t['is_recurring'] ?? 0);
    $t['recurrence_parent_id'] = $t['recurrence_parent_id'] !== null ? (int)$t['recurrence_parent_id'] : null;
}

echo json_encode(['success' => true, 'tasks' => $tasks]);
?>
