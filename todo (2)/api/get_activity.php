<?php
require_once 'db.php';
$pdo   = getDB();
$limit = isset($_GET['limit']) ? intval($_GET['limit']) : 30;
$stmt  = $pdo->prepare("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?");
$stmt->execute([$limit]);
echo json_encode(['success'=>true,'logs'=>$stmt->fetchAll()]);
?>
