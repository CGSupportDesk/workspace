<?php
require_once 'db.php';
$pdo    = getDB();
$action = $_GET['action'] ?? '';

if ($action === 'add') {
    $data   = json_decode(file_get_contents('php://input'), true);
    $taskId = intval($data['task_id'] ?? 0);
    $author = trim($data['author'] ?? '');
    $body   = trim($data['body'] ?? '');
    if (!$taskId || !$author || !$body) { http_response_code(400); echo json_encode(['error'=>'Missing fields']); exit(); }
    $ins = $pdo->prepare("INSERT INTO comments (task_id,author,body) VALUES (?,?,?)");
    $ins->execute([$taskId,$author,$body]);
    $id = $pdo->lastInsertId();

    // Get task title for activity log
    $t = $pdo->prepare("SELECT title FROM tasks WHERE id=?"); $t->execute([$taskId]);
    $taskTitle = $t->fetchColumn();
    $pdo->prepare("INSERT INTO activity_logs (user_name,action) VALUES (?,?)")
        ->execute([$author, $author.' commented on "'.$taskTitle.'"']);

    echo json_encode(['success'=>true,'comment'=>['id'=>$id,'task_id'=>$taskId,'author'=>$author,'body'=>$body,'created_at'=>date('Y-m-d H:i:s')]]);

} else {
    http_response_code(400); echo json_encode(['error'=>'Unknown action']);
}
?>
