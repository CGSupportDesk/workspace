<?php
require_once 'db.php';
requireAuth();
$pdo = getDB();

// Mark overdue invoices automatically on each dashboard load
$today = date('Y-m-d');
$pdo->prepare("UPDATE invoices SET status = 'overdue'
    WHERE doc_type = 'invoice' AND status = 'sent'
    AND due_date IS NOT NULL AND due_date < ?")->execute([$today]);

// Date range: defaults to this month, but accepts ?from=YYYY-MM-DD&to=YYYY-MM-DD
$from = $_GET['from'] ?? date('Y-m-01');
$to   = $_GET['to']   ?? date('Y-m-t');

$yearStart = date('Y-01-01');
$yearEnd   = date('Y-12-31');

/* ───── INVOICE METRICS ───── */

// Total invoiced (subtotal + GST = total) in selected range
$stmt = $pdo->prepare("SELECT COALESCE(SUM(total), 0) AS sum FROM invoices
    WHERE doc_type = 'invoice' AND status != 'cancelled'
    AND issue_date BETWEEN ? AND ?");
$stmt->execute([$from, $to]);
$invoiced_range = (float)$stmt->fetchColumn();

// Total invoiced this year
$stmt = $pdo->prepare("SELECT COALESCE(SUM(total), 0) FROM invoices
    WHERE doc_type = 'invoice' AND status != 'cancelled'
    AND issue_date BETWEEN ? AND ?");
$stmt->execute([$yearStart, $yearEnd]);
$invoiced_year = (float)$stmt->fetchColumn();

// Outstanding — unpaid (sent / overdue) invoices, all time
$stmt = $pdo->query("SELECT COALESCE(SUM(total), 0) FROM invoices
    WHERE doc_type = 'invoice' AND status IN ('sent','overdue')");
$outstanding = (float)$stmt->fetchColumn();

// Paid in range
$stmt = $pdo->prepare("SELECT COALESCE(SUM(total), 0) FROM invoices
    WHERE doc_type = 'invoice' AND status = 'paid'
    AND paid_date BETWEEN ? AND ?");
$stmt->execute([$from, $to]);
$paid_range = (float)$stmt->fetchColumn();

// Overdue count + sum
$stmt = $pdo->query("SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0) AS sum FROM invoices
    WHERE doc_type = 'invoice' AND status = 'overdue'");
$overdue = $stmt->fetch();

// Invoice status breakdown (all time)
$stmt = $pdo->query("SELECT status, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS sum
    FROM invoices WHERE doc_type = 'invoice'
    GROUP BY status");
$statusBreakdown = [];
foreach ($stmt->fetchAll() as $r) $statusBreakdown[$r['status']] = ['count' => (int)$r['cnt'], 'sum' => (float)$r['sum']];

// Top 5 clients by total invoiced (paid + unpaid, not cancelled) all-time
$stmt = $pdo->query("SELECT
    json_extract(client_snapshot, '$.name') AS client_name,
    COUNT(*) AS invoice_count,
    SUM(total) AS total
    FROM invoices
    WHERE doc_type = 'invoice' AND status != 'cancelled'
    GROUP BY client_name
    ORDER BY total DESC
    LIMIT 5");
$topClients = $stmt->fetchAll();

// Recent invoices (last 8)
$stmt = $pdo->query("SELECT id, doc_number, doc_type, client_snapshot, issue_date, due_date, total, status, paid_date
    FROM invoices ORDER BY created_at DESC LIMIT 8");
$recentRaw = $stmt->fetchAll();
$recent = array_map(function($r){
    $r['client_snapshot'] = json_decode($r['client_snapshot'], true);
    return $r;
}, $recentRaw);

// Overdue invoices list (top 5 by oldest due date)
$stmt = $pdo->query("SELECT id, doc_number, client_snapshot, due_date, total
    FROM invoices WHERE doc_type='invoice' AND status='overdue'
    ORDER BY due_date ASC LIMIT 5");
$overdueList = array_map(function($r){
    $r['client_snapshot'] = json_decode($r['client_snapshot'], true);
    return $r;
}, $stmt->fetchAll());

/* ───── LEDGER METRICS ───── */

$stmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM ledger WHERE type='income' AND entry_date BETWEEN ? AND ?");
$stmt->execute([$from, $to]);
$income_range = (float)$stmt->fetchColumn();

$stmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM ledger WHERE type='expense' AND entry_date BETWEEN ? AND ?");
$stmt->execute([$from, $to]);
$expense_range = (float)$stmt->fetchColumn();

$stmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM ledger WHERE type='income' AND entry_date BETWEEN ? AND ?");
$stmt->execute([$yearStart, $yearEnd]);
$income_year = (float)$stmt->fetchColumn();

$stmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM ledger WHERE type='expense' AND entry_date BETWEEN ? AND ?");
$stmt->execute([$yearStart, $yearEnd]);
$expense_year = (float)$stmt->fetchColumn();

// Monthly trend for the last 12 months (income vs expense)
$trend = [];
for ($i = 11; $i >= 0; $i--) {
    $t = strtotime("first day of -$i month");
    $mStart = date('Y-m-01', $t);
    $mEnd   = date('Y-m-t', $t);
    $label  = date('M', $t);
    $yearLbl = date('Y', $t);

    $stmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM ledger WHERE type='income' AND entry_date BETWEEN ? AND ?");
    $stmt->execute([$mStart, $mEnd]);
    $inc = (float)$stmt->fetchColumn();

    $stmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM ledger WHERE type='expense' AND entry_date BETWEEN ? AND ?");
    $stmt->execute([$mStart, $mEnd]);
    $exp = (float)$stmt->fetchColumn();

    $stmt = $pdo->prepare("SELECT COALESCE(SUM(total),0) FROM invoices WHERE doc_type='invoice' AND status != 'cancelled' AND issue_date BETWEEN ? AND ?");
    $stmt->execute([$mStart, $mEnd]);
    $invd = (float)$stmt->fetchColumn();

    $trend[] = ['label' => $label, 'year' => $yearLbl, 'income' => $inc, 'expense' => $exp, 'invoiced' => $invd];
}

// Expense breakdown by category (in range)
$stmt = $pdo->prepare("SELECT category, COALESCE(SUM(amount),0) AS sum
    FROM ledger WHERE type='expense' AND entry_date BETWEEN ? AND ?
    GROUP BY category ORDER BY sum DESC");
$stmt->execute([$from, $to]);
$expenseByCategory = $stmt->fetchAll();

// Recent activity
$activity = $pdo->query("SELECT action, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 12")->fetchAll();

// Quick counts
$counts = [
    'clients'  => (int)$pdo->query("SELECT COUNT(*) FROM clients")->fetchColumn(),
    'invoices' => (int)$pdo->query("SELECT COUNT(*) FROM invoices WHERE doc_type='invoice'")->fetchColumn(),
    'quotes'   => (int)$pdo->query("SELECT COUNT(*) FROM invoices WHERE doc_type='quote'")->fetchColumn(),
];

echo json_encode([
    'success' => true,
    'range' => ['from' => $from, 'to' => $to],
    'invoiced_range'   => $invoiced_range,
    'invoiced_year'    => $invoiced_year,
    'outstanding'      => $outstanding,
    'paid_range'       => $paid_range,
    'overdue_count'    => (int)$overdue['cnt'],
    'overdue_sum'      => (float)$overdue['sum'],
    'income_range'     => $income_range,
    'expense_range'    => $expense_range,
    'net_range'        => $income_range - $expense_range,
    'income_year'      => $income_year,
    'expense_year'     => $expense_year,
    'net_year'         => $income_year - $expense_year,
    'status_breakdown' => $statusBreakdown,
    'top_clients'      => $topClients,
    'recent'           => $recent,
    'overdue_list'     => $overdueList,
    'monthly_trend'    => $trend,
    'expense_by_category' => $expenseByCategory,
    'activity'         => $activity,
    'counts'           => $counts,
]);
?>
