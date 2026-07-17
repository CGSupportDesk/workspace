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

$status      = $data['status']       ?? $task['status'];
$title       = $data['title']        ?? $task['title'];
$assigned_to = $data['assigned_to']  ?? $task['assigned_to'];
$order       = isset($data['sort_order']) ? intval($data['sort_order']) : $task['sort_order'];
$priority    = $data['priority']     ?? $task['priority'];
$time_est    = array_key_exists('time_estimate',$data) ? (($data['time_estimate']??'')?:null) : $task['time_estimate'];
$description = array_key_exists('description',$data)  ? (($data['description']??'')?:null)   : $task['description'];
$due_date    = array_key_exists('due_date',$data)      ? (($data['due_date']??'')?:null)      : $task['due_date'];
$labels      = array_key_exists('labels',$data)
    ? (is_array($data['labels']) ? json_encode($data['labels']) : null)
    : $task['labels'];
$is_recurring = array_key_exists('is_recurring',$data) ? (!empty($data['is_recurring']) ? 1 : 0) : (int)$task['is_recurring'];
$recurrence_pattern = array_key_exists('recurrence_pattern',$data)
    ? (($data['recurrence_pattern']??'') ?: null)
    : $task['recurrence_pattern'];

$upd = $pdo->prepare("UPDATE tasks SET status=?,title=?,assigned_to=?,sort_order=?,priority=?,time_estimate=?,description=?,due_date=?,labels=?,is_recurring=?,recurrence_pattern=?,updated_at=CURRENT_TIMESTAMP WHERE id=?");
$upd->execute([$status,$title,$assigned_to,$order,$priority,$time_est,$description,$due_date,$labels,$is_recurring,$recurrence_pattern,$id]);

// Auto-spawn next recurring instance when a recurring task becomes completed
$justCompleted = ($status === 'completed' && $task['status'] !== 'completed');
$wasRecurring = !empty($task['is_recurring']) && !empty($task['recurrence_pattern']);
if ($justCompleted && $wasRecurring) {
    // Calculate next due date based on the original due date (or today if none)
    $baseDate = $task['due_date'] ?: date('Y-m-d');
    $pattern  = $task['recurrence_pattern'];
    $nextDate = $baseDate;
    if ($pattern === 'daily')   $nextDate = date('Y-m-d', strtotime($baseDate . ' +1 day'));
    if ($pattern === 'weekly')  $nextDate = date('Y-m-d', strtotime($baseDate . ' +7 days'));
    if ($pattern === 'monthly') $nextDate = date('Y-m-d', strtotime($baseDate . ' +1 month'));

    // Make sure the next date is in the future (skip past dates if completing late)
    $today = date('Y-m-d');
    while ($nextDate <= $today) {
        if ($pattern === 'daily')   $nextDate = date('Y-m-d', strtotime($nextDate . ' +1 day'));
        elseif ($pattern === 'weekly')  $nextDate = date('Y-m-d', strtotime($nextDate . ' +7 days'));
        elseif ($pattern === 'monthly') $nextDate = date('Y-m-d', strtotime($nextDate . ' +1 month'));
        else break;
    }

    // Parent reference — link back to the original template (or use this task if it IS the template)
    $parentId = $task['recurrence_parent_id'] ?: $id;

    // Get next sort_order in the same status the original lived in (use 'today' as default for fresh instance)
    $newStatus = 'today';
    $so = $pdo->prepare("SELECT COALESCE(MAX(sort_order),0)+1 FROM tasks WHERE status=?");
    $so->execute([$newStatus]);
    $newOrder = (int)$so->fetchColumn();

    $spawn = $pdo->prepare("INSERT INTO tasks
        (title,assigned_to,status,sort_order,due_date,description,priority,time_estimate,labels,is_recurring,recurrence_pattern,recurrence_parent_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
    $spawn->execute([
        $task['title'], $task['assigned_to'], $newStatus, $newOrder, $nextDate,
        $task['description'], $task['priority'], $task['time_estimate'], $task['labels'],
        1, $pattern, $parentId
    ]);

    $pdo->prepare("INSERT INTO activity_logs (user_name,action) VALUES (?,?)")
        ->execute([$assigned_to, $assigned_to.' completed recurring "'.$title.'" — next instance scheduled for '.$nextDate]);
}

// Activity logs
if ($status !== $task['status']) {
    $label = ucwords(str_replace('_',' ',$status));
    $pdo->prepare("INSERT INTO activity_logs (user_name,action) VALUES (?,?)")
        ->execute([$assigned_to, $assigned_to.' moved "'.$title.'" to '.$label]);
}
if (($due_date??'') !== ($task['due_date']??'')) {
    $pdo->prepare("INSERT INTO activity_logs (user_name,action) VALUES (?,?)")
        ->execute([$assigned_to, $assigned_to.' updated due date on "'.$title.'"']);
}

$upd2 = $pdo->prepare("SELECT * FROM tasks WHERE id=?");
$upd2->execute([$id]);
$t = $upd2->fetch();
$t['labels'] = $t['labels'] ? json_decode($t['labels'],true) : [];
$t['is_recurring'] = (int)($t['is_recurring'] ?? 0);
$t['recurrence_parent_id'] = $t['recurrence_parent_id'] !== null ? (int)$t['recurrence_parent_id'] : null;

// Attach checklist summary
$cs = $pdo->prepare("SELECT COUNT(*) as total, SUM(checked) as done FROM checklist_items WHERE task_id=?");
$cs->execute([$id]);
$row = $cs->fetch();
$t['checklist_summary'] = ['total'=>(int)$row['total'],'done'=>(int)$row['done']];

echo json_encode(['success'=>true,'task'=>$t]);
?>
