<?php
require_once 'db.php';
$data = json_decode(file_get_contents('php://input'), true);
if (!isset($data['id'])) { http_response_code(400); echo json_encode(['error'=>'Missing id']); exit(); }

$pdo  = getDB();
$id   = intval($data['id']);
$stmt = $pdo->prepare("SELECT * FROM tasks WHERE id=?");
$stmt->execute([$id]);
$task = $stmt->fetch();
if (!$task) { http_response_code(404); echo json_encode(['error'=>'Not found']); exit(); }

$pdo->prepare("DELETE FROM tasks WHERE id=?")->execute([$id]);
$pdo->prepare("INSERT INTO activity_logs (user_name,action) VALUES (?,?)")
    ->execute([$task['assigned_to'], $task['assigned_to'].' deleted "'.$task['title'].'"']);

echo json_encode(['success'=>true]);
?>
