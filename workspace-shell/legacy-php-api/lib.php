<?php
declare(strict_types=1);

function loadWorkspaceEnv(): void {
    $path = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env';
    if (!is_file($path)) return;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if ((str_starts_with($value, '"') && str_ends_with($value, '"')) || (str_starts_with($value, "'") && str_ends_with($value, "'"))) $value = substr($value, 1, -1);
        if (getenv($key) === false) putenv("$key=$value");
    }
}

loadWorkspaceEnv();
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
session_name(getenv('WORKSPACE_SESSION_NAME') ?: 'closing_gap_workspace');
session_set_cookie_params(['lifetime' => 604800, 'path' => '/', 'secure' => $isHttps, 'httponly' => true, 'samesite' => 'Strict']);
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Permissions-Policy: camera=(), microphone=(), geolocation=()");
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'");

function envValue(string $key, ?string $default = null): ?string { $value = getenv($key); return $value === false ? $default : $value; }
function jsonResponse(array $payload, int $status = 200): never { http_response_code($status); echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }
function jsonBody(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    if (!is_array($data)) jsonResponse(['error' => 'Invalid JSON request body.'], 400);
    return $data;
}
function uuid(): string {
    $data = random_bytes(16); $data[6] = chr((ord($data[6]) & 0x0f) | 0x40); $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function database(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $directory = __DIR__ . DIRECTORY_SEPARATOR . 'database';
    if (!is_dir($directory) && !mkdir($directory, 0770, true) && !is_dir($directory)) jsonResponse(['error' => 'Workspace database directory is not writable.'], 500);
    $pdo = new PDO('sqlite:' . $directory . DIRECTORY_SEPARATOR . 'workspace.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON'); $pdo->exec('PRAGMA journal_mode = WAL'); $pdo->exec('PRAGMA busy_timeout = 5000');
    migrate($pdo); seedAdmin($pdo); return $pdo;
}

function migrate(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE, email TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','member')), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT NULL REFERENCES folders(id) ON DELETE RESTRICT, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, visibility TEXT NOT NULL CHECK(visibility IN ('private','workspace','restricted')), favourite INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, name TEXT NOT NULL, file_type TEXT NOT NULL, file_size INTEGER NOT NULL, storage_path TEXT NOT NULL, folder_id TEXT NULL REFERENCES folders(id) ON DELETE RESTRICT, category TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, visibility TEXT NOT NULL CHECK(visibility IN ('private','workspace','restricted')), favourite INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS document_versions (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, version INTEGER NOT NULL, storage_path TEXT NOT NULL, file_size INTEGER NOT NULL, created_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(document_id, version))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, actor_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NULL, entity_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT NOT NULL, success INTEGER NOT NULL DEFAULT 0, attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at)');
}

function seedAdmin(PDO $pdo): void {
    if ((int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn() > 0) return;
    $username = trim((string)envValue('WORKSPACE_ADMIN_USERNAME', ''));
    $email = strtolower(trim((string)envValue('WORKSPACE_ADMIN_EMAIL', '')));
    $password = (string)envValue('WORKSPACE_ADMIN_PASSWORD', '');
    if ($username === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || !passwordIsStrong($password)) return;
    $stmt = $pdo->prepare("INSERT INTO users (id, username, email, password_hash, role, active) VALUES (?, ?, ?, ?, 'admin', 1)");
    $stmt->execute([uuid(), $username, $email, password_hash($password, PASSWORD_DEFAULT)]);
}

function passwordIsStrong(string $password): bool { return strlen($password) >= 10 && preg_match('/[a-z]/', $password) && preg_match('/[A-Z]/', $password) && preg_match('/\d/', $password); }
function publicUser(array $row): array { return ['id'=>$row['id'],'username'=>$row['username'],'email'=>$row['email'],'role'=>$row['role'],'active'=>(bool)$row['active'],'createdAt'=>$row['created_at'],'updatedAt'=>$row['updated_at']]; }

function currentUser(bool $required = true): ?array {
    $userId = $_SESSION['workspace_user_id'] ?? null;
    if (!$userId) { if ($required) jsonResponse(['error' => 'Authentication required.'], 401); return null; }
    $stmt = database()->prepare('SELECT * FROM users WHERE id = ? AND active = 1'); $stmt->execute([$userId]); $user = $stmt->fetch();
    if (!$user) { session_unset(); if ($required) jsonResponse(['error' => 'Your session is no longer valid.'], 401); return null; }
    $_SESSION['last_activity'] = time(); return $user;
}
function requireAdmin(): array { $user = currentUser(); if ($user['role'] !== 'admin') jsonResponse(['error' => 'Administrator access required.'], 403); return $user; }
function csrfToken(): string { if (empty($_SESSION['csrf_token'])) $_SESSION['csrf_token'] = bin2hex(random_bytes(24)); return $_SESSION['csrf_token']; }
function requireCsrf(): void { $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''; if (!$provided || !hash_equals(csrfToken(), $provided)) jsonResponse(['error' => 'Your secure form token expired. Refresh and try again.'], 419); }
function requirePost(): void { if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method not allowed.'], 405); requireCsrf(); }
function validVisibility(mixed $value): string { $value=(string)$value; if (!in_array($value,['private','workspace','restricted'],true)) jsonResponse(['error'=>'Invalid visibility setting.'],422); return $value; }
function cleanName(string $name, int $max = 140): string { $name=trim(preg_replace('/[\x00-\x1F\x7F]/u','',$name)??''); $name=basename(str_replace('\\','/',$name)); $name=preg_replace('/[^\pL\pN ._()\[\]-]+/u','-',$name)??''; return mb_substr(trim($name," .-\t\n\r\0\x0B"),0,$max); }
function canAccess(array $record,array $user):bool{return $user['role']==='admin'||$record['visibility']==='workspace'||$record['owner_id']===$user['id'];}
function canManage(array $record,array $user):bool{return $user['role']==='admin'||$record['owner_id']===$user['id'];}
function findDocument(string $id,array $user,bool $manage=false):array{$stmt=database()->prepare('SELECT * FROM documents WHERE id=?');$stmt->execute([$id]);$document=$stmt->fetch();if(!$document)jsonResponse(['error'=>'Document not found.'],404);if(!($manage?canManage($document,$user):canAccess($document,$user)))jsonResponse(['error'=>'You do not have access to this document.'],403);return $document;}
function findFolder(string $id,array $user,bool $manage=false):array{$stmt=database()->prepare('SELECT * FROM folders WHERE id=?');$stmt->execute([$id]);$folder=$stmt->fetch();if(!$folder)jsonResponse(['error'=>'Folder not found.'],404);if(!($manage?canManage($folder,$user):canAccess($folder,$user)))jsonResponse(['error'=>'You do not have access to this folder.'],403);return $folder;}
function logActivity(PDO $pdo,array $user,string $action,string $entityType,?string $entityId,string $entityName):void{$stmt=$pdo->prepare('INSERT INTO activity (id,actor_id,action,entity_type,entity_id,entity_name) VALUES (?,?,?,?,?,?)');$stmt->execute([uuid(),$user['id'],$action,$entityType,$entityId,$entityName]);}
function documentPublic(array $row):array{return ['id'=>$row['id'],'name'=>$row['name'],'fileType'=>$row['file_type'],'fileSize'=>(int)$row['file_size'],'folderId'=>$row['folder_id'],'category'=>$row['category'],'ownerId'=>$row['owner_id'],'ownerName'=>$row['owner_name']??'','visibility'=>$row['visibility'],'favourite'=>(bool)$row['favourite'],'version'=>(int)$row['version'],'createdAt'=>$row['created_at'],'updatedAt'=>$row['updated_at']];}
function folderPublic(array $row):array{return ['id'=>$row['id'],'name'=>$row['name'],'parentId'=>$row['parent_id'],'ownerId'=>$row['owner_id'],'ownerName'=>$row['owner_name']??'','visibility'=>$row['visibility'],'favourite'=>(bool)$row['favourite'],'createdAt'=>$row['created_at'],'updatedAt'=>$row['updated_at']];}
function storageDirectory():string{$directory=__DIR__.DIRECTORY_SEPARATOR.'storage';if(!is_dir($directory)&&!mkdir($directory,0770,true)&&!is_dir($directory))jsonResponse(['error'=>'Vault storage is unavailable.'],500);return $directory;}
function detectMimeType(string $path,string $extension):string{
    if(class_exists('finfo')){$mime=(new finfo(FILEINFO_MIME_TYPE))->file($path);if($mime)return $mime;}
    if(function_exists('mime_content_type')){$mime=mime_content_type($path);if($mime)return $mime;}
    $fallback=['pdf'=>'application/pdf','doc'=>'application/msword','docx'=>'application/vnd.openxmlformats-officedocument.wordprocessingml.document','xls'=>'application/vnd.ms-excel','xlsx'=>'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','ppt'=>'application/vnd.ms-powerpoint','pptx'=>'application/vnd.openxmlformats-officedocument.presentationml.presentation','txt'=>'text/plain','md'=>'text/markdown','csv'=>'text/csv','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp','svg'=>'image/svg+xml','zip'=>'application/zip'];
    return $fallback[$extension]??'application/octet-stream';
}
