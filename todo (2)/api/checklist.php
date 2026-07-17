<?php
require_once 'db.php';
$pdo    = getDB();
$action = $_GET['action'] ?? '';

if ($action === 'add') {
    $data   = json_decode(file_get_contents('php://input'), true);
    $taskId = intval($data['task_id'] ?? 0);
    $text   = trim($data['text'] ?? '');
    if (!$taskId || !$text) { http_response_code(400); echo json_encode(['error'=>'Missing fields']); exit(); }
    $ord = $pdo->prepare("SELECT COALESCE(MAX(sort_order),0)+1 FROM checklist_items WHERE task_id=?");
    $ord->execute([$taskId]); $order = (int)$ord->fetchColumn();
    $ins = $pdo->prepare("INSERT INTO checklist_items (task_id,text,sort_order) VALUES (?,?,?)");
    $ins->execute([$taskId,$text,$order]);
    echo json_encode(['success'=>true,'id'=>$pdo->lastInsertId(),'text'=>$text,'checked'=>false,'sort_order'=>$order]);

} elseif ($action === 'toggle') {
    $data  = json_decode(file_get_contents('php://input'), true);
    $id    = intval($data['id'] ?? 0);
    $check = isset($data['checked']) ? (int)$data['checked'] : 0;
    $pdo->prepare("UPDATE checklist_items SET checked=? WHERE id=?")->execute([$check,$id]);
    echo json_encode(['success'=>true]);

} elseif ($action === 'delete') {
    $data = json_decode(file_get_contents('php://input'), true);
    $id   = intval($data['id'] ?? 0);
    $pdo->prepare("DELETE FROM checklist_items WHERE id=?")->execute([$id]);
    echo json_encode(['success'=>true]);

} else {
    http_response_code(400); echo json_encode(['error'=>'Unknown action']);
}
?>
