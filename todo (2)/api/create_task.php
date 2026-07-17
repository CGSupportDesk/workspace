<?php
require_once 'db.php';
$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['title'], $data['assigned_to'])) {
    http_response_code(400); echo json_encode(['error' => 'Missing fields']); exit();
}

$pdo         = getDB();
$title       = trim($data['title']);
$assigned_to = trim($data['assigned_to']);
$status      = $data['status']        ?? 'backlog';
$due_date    = ($data['due_date'] ?? '') ?: null;
$description = ($data['description'] ?? '') ?: null;
$priority    = $data['priority']      ?? 'medium';
$time_est    = ($data['time_estimate'] ?? '') ?: null;
$labels      = isset($data['labels']) && is_array($data['labels']) ? json_encode($data['labels']) : null;
$is_recurring = !empty($data['is_recurring']) ? 1 : 0;
$recurrence_pattern = $is_recurring ? ($data['recurrence_pattern'] ?? 'weekly') : null;
$recurrence_parent_id = isset($data['recurrence_parent_id']) ? (int)$data['recurrence_parent_id'] : null;

$stmt = $pdo->prepare("SELECT COALESCE(MAX(sort_order),0)+1 FROM tasks WHERE status=?");
$stmt->execute([$status]);
$order = (int)$stmt->fetchColumn();

$ins = $pdo->prepare("INSERT INTO tasks (title,assigned_to,status,sort_order,due_date,description,priority,time_estimate,labels,is_recurring,recurrence_pattern,recurrence_parent_id)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
$ins->execute([$title,$assigned_to,$status,$order,$due_date,$description,$priority,$time_est,$labels,$is_recurring,$recurrence_pattern,$recurrence_parent_id]);
$id = $pdo->lastInsertId();

$log = $pdo->prepare("INSERT INTO activity_logs (user_name,action) VALUES (?,?)");
$log->execute([$assigned_to, $assigned_to.' created "'.$title.'"']);

$task = $pdo->prepare("SELECT * FROM tasks WHERE id=?");
$task->execute([$id]);
$t = $task->fetch();
$t['labels'] = $t['labels'] ? json_decode($t['labels'],true) : [];
$t['is_recurring'] = (int)($t['is_recurring'] ?? 0);
$t['recurrence_parent_id'] = $t['recurrence_parent_id'] !== null ? (int)$t['recurrence_parent_id'] : null;
$t['checklist_summary'] = ['total'=>0,'done'=>0];

echo json_encode(['success'=>true,'task'=>$t]);
?>
