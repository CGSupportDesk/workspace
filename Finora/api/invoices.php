<?php
require_once 'db.php';
requireAuth();
$pdo = getDB();
$action = $_GET['action'] ?? 'list';

function computeTotals(&$d) {
    $items = $d['items'] ?? [];
    $subtotal = 0;
    foreach ($items as $it) {
        $rate = (float)($it['rate'] ?? 0);
        $qty = (float)($it['quantity'] ?? 1);
        $subtotal += $rate * $qty;
    }
    $d['subtotal'] = round($subtotal, 2);

    $discountType = $d['discount_type'] ?? 'none';
    $discountValue = (float)($d['discount_value'] ?? 0);
    $discountAmount = 0;
    if ($discountType === 'percent') $discountAmount = $subtotal * $discountValue / 100;
    elseif ($discountType === 'amount') $discountAmount = $discountValue;
    $d['discount_amount'] = round($discountAmount, 2);

    $taxable = $subtotal - $discountAmount;
    $d['taxable'] = round($taxable, 2);

    $gstEnabled = !empty($d['gst_enabled']);
    $cgst = 0; $sgst = 0; $igst = 0;
    if ($gstEnabled) {
        $gstType = $d['gst_type'] ?? 'igst';
        if ($gstType === 'cgst_sgst') {
            $cgst = $taxable * ((float)$d['cgst_rate'] / 100);
            $sgst = $taxable * ((float)$d['sgst_rate'] / 100);
        } else {
            $igst = $taxable * ((float)$d['igst_rate'] / 100);
        }
    }
    $d['cgst_amount'] = round($cgst, 2);
    $d['sgst_amount'] = round($sgst, 2);
    $d['igst_amount'] = round($igst, 2);
    $d['total'] = round($taxable + $cgst + $sgst + $igst, 2);
}

function nextDocNumber($pdo, $type) {
    if ($type === 'invoice') {
        $prefix = settingGet($pdo, 'invoice_prefix', 'CG-');
        $next = (int)settingGet($pdo, 'invoice_next_number', '1001');
        $num = $prefix . $next;
        settingSet($pdo, 'invoice_next_number', (string)($next + 1));
    } else {
        $prefix = settingGet($pdo, 'quote_prefix', 'Q-');
        $next = (int)settingGet($pdo, 'quote_next_number', '1001');
        $num = $prefix . $next;
        settingSet($pdo, 'quote_next_number', (string)($next + 1));
    }
    return $num;
}

if ($action === 'list') {
    $type = $_GET['type'] ?? 'invoice';
    $stmt = $pdo->prepare("SELECT * FROM invoices WHERE doc_type = ? ORDER BY created_at DESC");
    $stmt->execute([$type]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['items'] = json_decode($r['items'], true);
        $r['client_snapshot'] = json_decode($r['client_snapshot'], true);
    }
    echo json_encode(['success' => true, 'items' => $rows]);
    exit();
}

if ($action === 'get') {
    $id = (int)($_GET['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT * FROM invoices WHERE id = ?");
    $stmt->execute([$id]);
    $r = $stmt->fetch();
    if (!$r) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit(); }
    $r['items'] = json_decode($r['items'], true);
    $r['client_snapshot'] = json_decode($r['client_snapshot'], true);
    echo json_encode(['success' => true, 'item' => $r]);
    exit();
}

if ($action === 'save') {
    $d = jsonBody();
    $docType = $d['doc_type'] ?? 'invoice';
    if (!in_array($docType, ['invoice','quote'])) { http_response_code(400); echo json_encode(['error' => 'Bad doc type']); exit(); }

    // Build client snapshot from id OR direct fields
    $client = $d['client'] ?? null;
    if (!$client) { http_response_code(400); echo json_encode(['error' => 'Client required']); exit(); }
    $clientSnap = json_encode($client);
    $clientId = !empty($client['id']) ? (int)$client['id'] : null;

    computeTotals($d);
    $items = json_encode($d['items'] ?? []);

    if (!empty($d['id'])) {
        // Update existing
        $id = (int)$d['id'];
        $stmt = $pdo->prepare("UPDATE invoices SET
            client_id = ?, client_snapshot = ?,
            issue_date = ?, due_date = ?, subject = ?,
            currency = ?, currency_symbol = ?,
            items = ?,
            subtotal = ?, discount_type = ?, discount_value = ?, discount_amount = ?,
            taxable = ?, gst_enabled = ?, gst_type = ?,
            cgst_rate = ?, sgst_rate = ?, igst_rate = ?,
            cgst_amount = ?, sgst_amount = ?, igst_amount = ?,
            total = ?, notes = ?, status = ?,
            updated_at = CURRENT_TIMESTAMP
            WHERE id = ?");
        $stmt->execute([
            $clientId, $clientSnap,
            $d['issue_date'] ?? date('Y-m-d'), $d['due_date'] ?? null, $d['subject'] ?? '',
            $d['currency'] ?? 'INR', $d['currency_symbol'] ?? '₹',
            $items,
            $d['subtotal'], $d['discount_type'] ?? 'none', $d['discount_value'] ?? 0, $d['discount_amount'],
            $d['taxable'], !empty($d['gst_enabled']) ? 1 : 0, $d['gst_type'] ?? 'igst',
            $d['cgst_rate'] ?? 0, $d['sgst_rate'] ?? 0, $d['igst_rate'] ?? 0,
            $d['cgst_amount'], $d['sgst_amount'], $d['igst_amount'],
            $d['total'], $d['notes'] ?? '', $d['status'] ?? 'draft',
            $id
        ]);
        logActivity($pdo, "Updated $docType");
        echo json_encode(['success' => true, 'id' => $id]);
    } else {
        $docNumber = $d['doc_number'] ?? nextDocNumber($pdo, $docType);
        $stmt = $pdo->prepare("INSERT INTO invoices
            (doc_type, doc_number, client_id, client_snapshot,
             issue_date, due_date, subject,
             currency, currency_symbol,
             items,
             subtotal, discount_type, discount_value, discount_amount,
             taxable, gst_enabled, gst_type,
             cgst_rate, sgst_rate, igst_rate,
             cgst_amount, sgst_amount, igst_amount,
             total, notes, status, converted_from_quote_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
        $stmt->execute([
            $docType, $docNumber, $clientId, $clientSnap,
            $d['issue_date'] ?? date('Y-m-d'), $d['due_date'] ?? null, $d['subject'] ?? '',
            $d['currency'] ?? 'INR', $d['currency_symbol'] ?? '₹',
            $items,
            $d['subtotal'], $d['discount_type'] ?? 'none', $d['discount_value'] ?? 0, $d['discount_amount'],
            $d['taxable'], !empty($d['gst_enabled']) ? 1 : 0, $d['gst_type'] ?? 'igst',
            $d['cgst_rate'] ?? 0, $d['sgst_rate'] ?? 0, $d['igst_rate'] ?? 0,
            $d['cgst_amount'], $d['sgst_amount'], $d['igst_amount'],
            $d['total'], $d['notes'] ?? '', $d['status'] ?? 'draft',
            $d['converted_from_quote_id'] ?? null
        ]);
        $id = $pdo->lastInsertId();
        logActivity($pdo, "Created $docType $docNumber");
        echo json_encode(['success' => true, 'id' => $id, 'doc_number' => $docNumber]);
    }
    exit();
}

if ($action === 'delete') {
    $d = jsonBody();
    $id = (int)($d['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT doc_number, doc_type FROM invoices WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    // Also remove linked ledger entries
    $pdo->prepare("DELETE FROM ledger WHERE invoice_id = ?")->execute([$id]);
    $pdo->prepare("DELETE FROM invoices WHERE id = ?")->execute([$id]);
    if ($row) logActivity($pdo, "Deleted {$row['doc_type']} {$row['doc_number']}");
    echo json_encode(['success' => true]);
    exit();
}

if ($action === 'mark_paid') {
    $d = jsonBody();
    $id = (int)($d['id'] ?? 0);
    $paidDate = $d['paid_date'] ?? date('Y-m-d');
    $stmt = $pdo->prepare("SELECT * FROM invoices WHERE id = ? AND doc_type = 'invoice'");
    $stmt->execute([$id]);
    $inv = $stmt->fetch();
    if (!$inv) { http_response_code(404); echo json_encode(['error' => 'Invoice not found']); exit(); }
    if ($inv['status'] === 'paid') { echo json_encode(['success' => true, 'note' => 'Already paid']); exit(); }

    $pdo->prepare("UPDATE invoices SET status = 'paid', paid_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        ->execute([$paidDate, $id]);

    // Auto-create income entry
    $clientSnap = json_decode($inv['client_snapshot'], true);
    $clientName = $clientSnap['name'] ?? 'Client';
    $name = "Payment for {$inv['doc_number']} — {$clientName}";
    $pdo->prepare("INSERT INTO ledger (type, name, amount, category, entry_date, invoice_id, description)
        VALUES ('income', ?, ?, ?, ?, ?, ?)")
        ->execute([$name, $inv['total'], 'Client Payment', $paidDate, $id, "Auto-created on marking invoice paid"]);

    logActivity($pdo, "Marked {$inv['doc_number']} as paid");
    echo json_encode(['success' => true]);
    exit();
}

if ($action === 'mark_unpaid') {
    $d = jsonBody();
    $id = (int)($d['id'] ?? 0);
    $pdo->prepare("UPDATE invoices SET status = 'sent', paid_date = NULL WHERE id = ?")->execute([$id]);
    // remove auto-created income
    $pdo->prepare("DELETE FROM ledger WHERE invoice_id = ? AND type = 'income'")->execute([$id]);
    logActivity($pdo, "Reverted payment status for invoice id=$id");
    echo json_encode(['success' => true]);
    exit();
}

if ($action === 'set_status') {
    $d = jsonBody();
    $id = (int)($d['id'] ?? 0);
    $status = $d['status'] ?? 'draft';
    if (!in_array($status, ['draft','sent','paid','overdue','cancelled'])) {
        http_response_code(400); echo json_encode(['error' => 'Bad status']); exit();
    }
    $pdo->prepare("UPDATE invoices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$status, $id]);
    echo json_encode(['success' => true]);
    exit();
}

if ($action === 'convert_quote') {
    $d = jsonBody();
    $quoteId = (int)($d['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT * FROM invoices WHERE id = ? AND doc_type = 'quote'");
    $stmt->execute([$quoteId]);
    $q = $stmt->fetch();
    if (!$q) { http_response_code(404); echo json_encode(['error' => 'Quote not found']); exit(); }

    $docNumber = nextDocNumber($pdo, 'invoice');
    $stmt = $pdo->prepare("INSERT INTO invoices
        (doc_type, doc_number, client_id, client_snapshot,
         issue_date, due_date, subject, currency, currency_symbol,
         items, subtotal, discount_type, discount_value, discount_amount,
         taxable, gst_enabled, gst_type,
         cgst_rate, sgst_rate, igst_rate,
         cgst_amount, sgst_amount, igst_amount,
         total, notes, status, converted_from_quote_id)
        VALUES ('invoice', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)");
    $issue = date('Y-m-d');
    $days = (int)settingGet($pdo, 'payment_terms_days', '5');
    $due = date('Y-m-d', strtotime("+$days days"));
    $stmt->execute([
        $docNumber, $q['client_id'], $q['client_snapshot'],
        $issue, $due, $q['subject'], $q['currency'], $q['currency_symbol'],
        $q['items'], $q['subtotal'], $q['discount_type'], $q['discount_value'], $q['discount_amount'],
        $q['taxable'], $q['gst_enabled'], $q['gst_type'],
        $q['cgst_rate'], $q['sgst_rate'], $q['igst_rate'],
        $q['cgst_amount'], $q['sgst_amount'], $q['igst_amount'],
        $q['total'], $q['notes'], $quoteId
    ]);
    $newId = $pdo->lastInsertId();
    logActivity($pdo, "Converted quote {$q['doc_number']} → invoice $docNumber");
    echo json_encode(['success' => true, 'id' => $newId, 'doc_number' => $docNumber]);
    exit();
}

if ($action === 'mark_overdue_scan') {
    // Convenience: mark unpaid invoices past due_date as overdue
    $today = date('Y-m-d');
    $pdo->prepare("UPDATE invoices SET status = 'overdue'
        WHERE doc_type = 'invoice' AND status = 'sent' AND due_date IS NOT NULL AND due_date < ?")->execute([$today]);
    echo json_encode(['success' => true]);
    exit();
}

http_response_code(400);
echo json_encode(['error' => 'Unknown action']);
?>
