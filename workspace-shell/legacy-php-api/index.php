<?php
declare(strict_types=1);
require_once __DIR__ . '/lib.php';

$action = $_GET['action'] ?? '';
$pdo = database();

try {
    if ($action === 'health') jsonResponse(['ok' => true, 'configured' => (bool)$pdo->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn()]);

    if ($action === 'auth.status') {
        $user = currentUser(false);
        if (!$user) jsonResponse(['error' => 'Authentication required.'], 401);
        jsonResponse(['user' => publicUser($user), 'csrfToken' => csrfToken()]);
    }

    if ($action === 'auth.login') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method not allowed.'], 405);
        $body = jsonBody(); $identity = strtolower(trim((string)($body['identity'] ?? ''))); $password = (string)($body['password'] ?? '');
        if ($identity === '' || $password === '') jsonResponse(['error' => 'Enter your username or email and password.'], 422);
        $ip = substr($_SERVER['REMOTE_ADDR'] ?? 'unknown', 0, 64);
        $rate = $pdo->prepare("SELECT COUNT(*) FROM login_attempts WHERE ip=? AND success=0 AND attempted_at>datetime('now','-15 minutes')"); $rate->execute([$ip]);
        if ((int)$rate->fetchColumn() >= 5) jsonResponse(['error' => 'Too many failed attempts. Try again in 15 minutes.'], 429);
        $stmt = $pdo->prepare('SELECT * FROM users WHERE (lower(username)=? OR lower(email)=?) LIMIT 1'); $stmt->execute([$identity,$identity]); $user=$stmt->fetch();
        if (!$user || !$user['active'] || !password_verify($password,$user['password_hash'])) {
            $pdo->prepare('INSERT INTO login_attempts (ip,success) VALUES (?,0)')->execute([$ip]); usleep(350000); jsonResponse(['error'=>'The username/email or password is incorrect.'],401);
        }
        session_regenerate_id(true); $_SESSION['workspace_user_id']=$user['id']; $_SESSION['csrf_token']=bin2hex(random_bytes(24)); $_SESSION['last_activity']=time();
        $pdo->prepare('INSERT INTO login_attempts (ip,success) VALUES (?,1)')->execute([$ip]); $pdo->exec("DELETE FROM login_attempts WHERE attempted_at<datetime('now','-1 day')");
        jsonResponse(['user'=>publicUser($user),'csrfToken'=>csrfToken()]);
    }

    if ($action === 'auth.logout') {
        currentUser(); requirePost(); $_SESSION=[];
        if (ini_get('session.use_cookies')) { $params=session_get_cookie_params(); setcookie(session_name(),'',time()-42000,$params['path'],$params['domain']??'',(bool)$params['secure'],(bool)$params['httponly']); }
        session_destroy(); jsonResponse(['success'=>true]);
    }

    if ($action === 'users.list') {
        requireAdmin(); $rows=$pdo->query('SELECT * FROM users ORDER BY active DESC, username COLLATE NOCASE')->fetchAll(); jsonResponse(['users'=>array_map('publicUser',$rows)]);
    }
    if ($action === 'users.create') {
        $actor=requireAdmin(); requirePost(); $body=jsonBody();
        $username=cleanName((string)($body['username']??''),40); $email=strtolower(trim((string)($body['email']??''))); $password=(string)($body['password']??''); $role=($body['role']??'member')==='admin'?'admin':'member'; $active=isset($body['active'])?(int)(bool)$body['active']:1;
        if (strlen($username)<2) jsonResponse(['error'=>'Username must be at least 2 characters.'],422);
        if (!filter_var($email,FILTER_VALIDATE_EMAIL)) jsonResponse(['error'=>'Enter a valid email address.'],422);
        if (!passwordIsStrong($password)) jsonResponse(['error'=>'Password must be at least 10 characters and include upper, lower and a number.'],422);
        try { $id=uuid(); $stmt=$pdo->prepare('INSERT INTO users (id,username,email,password_hash,role,active) VALUES (?,?,?,?,?,?)'); $stmt->execute([$id,$username,$email,password_hash($password,PASSWORD_DEFAULT),$role,$active]); logActivity($pdo,$actor,'created user','user',$id,$username); }
        catch (PDOException $e) { if ($e->getCode()==='23000') jsonResponse(['error'=>'That username or email is already in use.'],409); throw $e; }
        jsonResponse(['success'=>true],201);
    }
    if ($action === 'users.update') {
        $actor=requireAdmin(); requirePost(); $body=jsonBody(); $id=(string)($body['id']??'');
        $stmt=$pdo->prepare('SELECT * FROM users WHERE id=?');$stmt->execute([$id]);$target=$stmt->fetch();if(!$target)jsonResponse(['error'=>'User not found.'],404);
        $username=cleanName((string)($body['username']??''),40);$email=strtolower(trim((string)($body['email']??'')));$role=($body['role']??'member')==='admin'?'admin':'member';$active=(int)(bool)($body['active']??false);
        if(strlen($username)<2||!filter_var($email,FILTER_VALIDATE_EMAIL))jsonResponse(['error'=>'Enter a valid username and email.'],422);
        if($id===$actor['id']&&(!$active||$role!=='admin'))jsonResponse(['error'=>'You cannot remove your own active administrator access.'],422);
        try{$pdo->prepare('UPDATE users SET username=?,email=?,role=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$username,$email,$role,$active,$id]);logActivity($pdo,$actor,'updated user','user',$id,$username);}catch(PDOException $e){if($e->getCode()==='23000')jsonResponse(['error'=>'That username or email is already in use.'],409);throw $e;}jsonResponse(['success'=>true]);
    }
    if ($action === 'users.reset-password') {
        $actor=requireAdmin();requirePost();$body=jsonBody();$id=(string)($body['id']??'');$password=(string)($body['password']??'');if(!passwordIsStrong($password))jsonResponse(['error'=>'Password must be at least 10 characters and include upper, lower and a number.'],422);
        $stmt=$pdo->prepare('UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?');$stmt->execute([password_hash($password,PASSWORD_DEFAULT),$id]);if(!$stmt->rowCount())jsonResponse(['error'=>'User not found.'],404);logActivity($pdo,$actor,'reset password for','user',$id,'a workspace user');jsonResponse(['success'=>true]);
    }
    if ($action === 'users.delete') {
        $actor=requireAdmin();requirePost();$id=(string)(jsonBody()['id']??'');if($id===$actor['id'])jsonResponse(['error'=>'You cannot delete your own account.'],422);
        $stmt=$pdo->prepare('SELECT * FROM users WHERE id=?');$stmt->execute([$id]);$target=$stmt->fetch();if(!$target)jsonResponse(['error'=>'User not found.'],404);
        $pdo->beginTransaction();try{$pdo->prepare('UPDATE documents SET owner_id=? WHERE owner_id=?')->execute([$actor['id'],$id]);$pdo->prepare('UPDATE folders SET owner_id=? WHERE owner_id=?')->execute([$actor['id'],$id]);$pdo->prepare('DELETE FROM users WHERE id=?')->execute([$id]);logActivity($pdo,$actor,'deleted user','user',null,$target['username']);$pdo->commit();}catch(Throwable $e){$pdo->rollBack();throw $e;}jsonResponse(['success'=>true]);
    }

    if ($action === 'profile.update') {
        $user=currentUser();requirePost();$body=jsonBody();$username=cleanName((string)($body['username']??''),40);$email=strtolower(trim((string)($body['email']??'')));if(strlen($username)<2||!filter_var($email,FILTER_VALIDATE_EMAIL))jsonResponse(['error'=>'Enter a valid username and email.'],422);
        try{$pdo->prepare('UPDATE users SET username=?,email=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$username,$email,$user['id']]);logActivity($pdo,$user,'updated profile','user',$user['id'],$username);}catch(PDOException $e){if($e->getCode()==='23000')jsonResponse(['error'=>'That username or email is already in use.'],409);throw $e;}jsonResponse(['success'=>true]);
    }
    if ($action === 'profile.password') {
        $user=currentUser();requirePost();$body=jsonBody();$current=(string)($body['current']??'');$password=(string)($body['password']??'');if(!password_verify($current,$user['password_hash']))jsonResponse(['error'=>'Your current password is incorrect.'],401);if(!passwordIsStrong($password))jsonResponse(['error'=>'Password must be at least 10 characters and include upper, lower and a number.'],422);
        $pdo->prepare('UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([password_hash($password,PASSWORD_DEFAULT),$user['id']]);session_regenerate_id(true);$_SESSION['csrf_token']=bin2hex(random_bytes(24));jsonResponse(['success'=>true,'csrfToken'=>csrfToken()]);
    }

    if ($action === 'vault.list') {
        $user=currentUser();$section=(string)($_GET['section']??'documents');$q=trim((string)($_GET['q']??''));$category=trim((string)($_GET['category']??''));$owner=trim((string)($_GET['owner']??''));$modified=(string)($_GET['modified']??'');
        $docWhere=["(d.visibility='workspace' OR d.owner_id=:uid OR :is_admin=1)"];$folderWhere=["(f.visibility='workspace' OR f.owner_id=:uid OR :is_admin=1)"];$params=[':uid'=>$user['id'],':is_admin'=>$user['role']==='admin'?1:0];
        if($q!==''){$docWhere[]='d.name LIKE :q';$folderWhere[]='f.name LIKE :q';$params[':q']='%'.$q.'%';}if($category!==''){$docWhere[]='d.category=:category';$params[':category']=$category;}if($owner!==''){$docWhere[]='d.owner_id=:owner';$folderWhere[]='f.owner_id=:owner';$params[':owner']=$owner;}
        if($modified==='today'){$docWhere[]="d.updated_at>=datetime('now','-1 day')";$folderWhere[]="f.updated_at>=datetime('now','-1 day')";}elseif($modified==='week'){$docWhere[]="d.updated_at>=datetime('now','-7 days')";$folderWhere[]="f.updated_at>=datetime('now','-7 days')";}elseif($modified==='month'){$docWhere[]="d.updated_at>=datetime('now','-1 month')";$folderWhere[]="f.updated_at>=datetime('now','-1 month')";}
        if($section==='favourites'){$docWhere[]='d.favourite=1';$folderWhere[]='f.favourite=1';}elseif($section==='recent'){$docWhere[]="d.updated_at>=datetime('now','-30 days')";$folderWhere[]="f.updated_at>=datetime('now','-30 days')";}elseif($section==='shared'){$docWhere[]="d.visibility='workspace'";$folderWhere[]="f.visibility='workspace'";}
        $stmt=$pdo->prepare('SELECT d.*,u.username owner_name FROM documents d JOIN users u ON u.id=d.owner_id WHERE '.implode(' AND ',$docWhere).' ORDER BY d.updated_at DESC');foreach($params as $key=>$value){if($key!==':category'||$category!=='')$stmt->bindValue($key,$value);} $stmt->execute();$documents=array_map('documentPublic',$stmt->fetchAll());
        $folderParams=$params;unset($folderParams[':category']);$stmt=$pdo->prepare('SELECT f.*,u.username owner_name FROM folders f JOIN users u ON u.id=f.owner_id WHERE '.implode(' AND ',$folderWhere).' ORDER BY f.updated_at DESC');$stmt->execute($folderParams);$folders=array_map('folderPublic',$stmt->fetchAll());
        $owners=array_map(fn($row)=>['id'=>$row['id'],'username'=>$row['username']],$pdo->query('SELECT id,username FROM users WHERE active=1 ORDER BY username COLLATE NOCASE')->fetchAll());jsonResponse(['documents'=>$documents,'folders'=>$folders,'owners'=>$owners]);
    }

    if ($action === 'vault.folder.create') {
        $user=currentUser();requirePost();$body=jsonBody();$name=cleanName((string)($body['name']??''),80);$visibility=validVisibility($body['visibility']??'workspace');$parentId=$body['parentId']??null;if($name==='')jsonResponse(['error'=>'Folder name is required.'],422);if($parentId)findFolder((string)$parentId,$user);
        $id=uuid();$pdo->prepare('INSERT INTO folders (id,name,parent_id,owner_id,visibility) VALUES (?,?,?,?,?)')->execute([$id,$name,$parentId?:null,$user['id'],$visibility]);logActivity($pdo,$user,'created folder','folder',$id,$name);jsonResponse(['folder'=>['id'=>$id]],201);
    }
    if ($action === 'vault.folder.rename') {
        $user=currentUser();requirePost();$body=jsonBody();$folder=findFolder((string)($body['id']??''),$user,true);$name=cleanName((string)($body['name']??''),80);if($name==='')jsonResponse(['error'=>'Folder name is required.'],422);$pdo->prepare('UPDATE folders SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name,$folder['id']]);logActivity($pdo,$user,'renamed folder','folder',$folder['id'],$name);jsonResponse(['success'=>true]);
    }
    if ($action === 'vault.folder.delete') {
        $user=currentUser();requirePost();$id=(string)(jsonBody()['id']??'');$folder=findFolder($id,$user,true);$stmt=$pdo->prepare('SELECT (SELECT COUNT(*) FROM documents WHERE folder_id=?)+(SELECT COUNT(*) FROM folders WHERE parent_id=?)');$stmt->execute([$id,$id]);if((int)$stmt->fetchColumn()>0)jsonResponse(['error'=>'Move or delete the folder contents first.'],409);$pdo->prepare('DELETE FROM folders WHERE id=?')->execute([$id]);logActivity($pdo,$user,'deleted folder','folder',null,$folder['name']);jsonResponse(['success'=>true]);
    }

    if ($action === 'vault.document.upload') {
        $user=currentUser();requirePost();if(!isset($_FILES['file'])||$_FILES['file']['error']!==UPLOAD_ERR_OK)jsonResponse(['error'=>'Choose a valid file to upload.'],422);$file=$_FILES['file'];$maxMb=max(1,(int)envValue('WORKSPACE_MAX_UPLOAD_MB','20'));if((int)$file['size']>$maxMb*1024*1024)jsonResponse(['error'=>"File exceeds the {$maxMb} MB upload limit."],413);
        $name=cleanName((string)$file['name']);if($name==='')jsonResponse(['error'=>'The filename is invalid.'],422);$extension=strtolower(pathinfo($name,PATHINFO_EXTENSION));$allowedExtensions=['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md','csv','jpg','jpeg','png','webp','svg','zip'];if(!in_array($extension,$allowedExtensions,true))jsonResponse(['error'=>'This file type is not allowed.'],415);
        $mime=detectMimeType($file['tmp_name'],$extension);$allowedMimes=['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/markdown','text/csv','image/jpeg','image/png','image/webp','image/svg+xml','application/zip','application/x-zip-compressed','application/octet-stream'];if(!in_array($mime,$allowedMimes,true))jsonResponse(['error'=>'The detected file type is not allowed.'],415);
        $folderId=($_POST['folderId']??'')?:null;if($folderId)findFolder((string)$folderId,$user);$category=cleanName((string)($_POST['category']??'Operational'),40)?:'Operational';$visibility=validVisibility($_POST['visibility']??'workspace');$storageName=bin2hex(random_bytes(20)).'.'.$extension;$target=storageDirectory().DIRECTORY_SEPARATOR.$storageName;if(!move_uploaded_file($file['tmp_name'],$target))jsonResponse(['error'=>'The file could not be stored.'],500);
        $id=uuid();$relative='storage/'.$storageName;$pdo->beginTransaction();try{$stmt=$pdo->prepare('INSERT INTO documents (id,name,file_type,file_size,storage_path,folder_id,category,owner_id,visibility) VALUES (?,?,?,?,?,?,?,?,?)');$stmt->execute([$id,$name,$mime,(int)$file['size'],$relative,$folderId,$category,$user['id'],$visibility]);$pdo->prepare('INSERT INTO document_versions (id,document_id,version,storage_path,file_size,created_by) VALUES (?,?,?,?,?,?)')->execute([uuid(),$id,1,$relative,(int)$file['size'],$user['id']]);logActivity($pdo,$user,'uploaded document','document',$id,$name);$pdo->commit();}catch(Throwable $e){$pdo->rollBack();@unlink($target);throw $e;}jsonResponse(['document'=>['id'=>$id]],201);
    }

    if ($action === 'vault.document.version') {
        $user=currentUser();requirePost();$document=findDocument((string)($_POST['id']??''),$user,true);if(!isset($_FILES['file'])||$_FILES['file']['error']!==UPLOAD_ERR_OK)jsonResponse(['error'=>'Choose a valid file to upload.'],422);$file=$_FILES['file'];$maxMb=max(1,(int)envValue('WORKSPACE_MAX_UPLOAD_MB','20'));if((int)$file['size']>$maxMb*1024*1024)jsonResponse(['error'=>"File exceeds the {$maxMb} MB upload limit."],413);
        $name=cleanName((string)$file['name']);$extension=strtolower(pathinfo($name,PATHINFO_EXTENSION));$allowedExtensions=['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md','csv','jpg','jpeg','png','webp','svg','zip'];if(!in_array($extension,$allowedExtensions,true))jsonResponse(['error'=>'This file type is not allowed.'],415);$mime=detectMimeType($file['tmp_name'],$extension);$allowedMimes=['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/markdown','text/csv','image/jpeg','image/png','image/webp','image/svg+xml','application/zip','application/x-zip-compressed','application/octet-stream'];if(!in_array($mime,$allowedMimes,true))jsonResponse(['error'=>'The detected file type is not allowed.'],415);
        $storageName=bin2hex(random_bytes(20)).'.'.$extension;$target=storageDirectory().DIRECTORY_SEPARATOR.$storageName;if(!move_uploaded_file($file['tmp_name'],$target))jsonResponse(['error'=>'The file could not be stored.'],500);$relative='storage/'.$storageName;$version=(int)$document['version']+1;
        $pdo->beginTransaction();try{$pdo->prepare('UPDATE documents SET file_type=?,file_size=?,storage_path=?,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$mime,(int)$file['size'],$relative,$version,$document['id']]);$pdo->prepare('INSERT INTO document_versions (id,document_id,version,storage_path,file_size,created_by) VALUES (?,?,?,?,?,?)')->execute([uuid(),$document['id'],$version,$relative,(int)$file['size'],$user['id']]);logActivity($pdo,$user,'uploaded document version','document',$document['id'],$document['name'].' v'.$version);$pdo->commit();}catch(Throwable $e){$pdo->rollBack();@unlink($target);throw $e;}jsonResponse(['version'=>$version],201);
    }

    if ($action === 'vault.document.update') {
        $user=currentUser();requirePost();$body=jsonBody();$document=findDocument((string)($body['id']??''),$user,true);$updates=[];$values=[];
        if(array_key_exists('favourite',$body)){$updates[]='favourite=?';$values[]=(int)(bool)$body['favourite'];}if(array_key_exists('name',$body)){$name=cleanName((string)$body['name']);if($name==='')jsonResponse(['error'=>'Document name is required.'],422);$updates[]='name=?';$values[]=$name;}if(array_key_exists('category',$body)){$updates[]='category=?';$values[]=cleanName((string)$body['category'],40);}if(array_key_exists('visibility',$body)){$updates[]='visibility=?';$values[]=validVisibility($body['visibility']);}if(array_key_exists('folderId',$body)){if($body['folderId'])findFolder((string)$body['folderId'],$user);$updates[]='folder_id=?';$values[]=$body['folderId']?:null;}
        if(!$updates)jsonResponse(['error'=>'No changes were provided.'],422);$values[]=$document['id'];$pdo->prepare('UPDATE documents SET '.implode(',',$updates).',updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute($values);logActivity($pdo,$user,'updated document','document',$document['id'],$document['name']);jsonResponse(['success'=>true]);
    }
    if ($action === 'vault.document.copy') {
        $user=currentUser();requirePost();$body=jsonBody();$source=findDocument((string)($body['id']??''),$user);$sourcePath=__DIR__.DIRECTORY_SEPARATOR.str_replace('/',DIRECTORY_SEPARATOR,$source['storage_path']);if(!is_file($sourcePath))jsonResponse(['error'=>'The stored file is missing.'],404);$extension=pathinfo($source['name'],PATHINFO_EXTENSION);$storageName=bin2hex(random_bytes(20)).($extension?'.'.$extension:'');$relative='storage/'.$storageName;$target=storageDirectory().DIRECTORY_SEPARATOR.$storageName;if(!copy($sourcePath,$target))jsonResponse(['error'=>'The document could not be copied.'],500);
        $id=uuid();$name=cleanName('Copy of '.$source['name']);$stmt=$pdo->prepare('INSERT INTO documents (id,name,file_type,file_size,storage_path,folder_id,category,owner_id,visibility,version) VALUES (?,?,?,?,?,?,?,?,?,1)');$stmt->execute([$id,$name,$source['file_type'],$source['file_size'],$relative,$source['folder_id'],$source['category'],$user['id'],$source['visibility']]);$pdo->prepare('INSERT INTO document_versions (id,document_id,version,storage_path,file_size,created_by) VALUES (?,?,?,?,?,?)')->execute([uuid(),$id,1,$relative,$source['file_size'],$user['id']]);logActivity($pdo,$user,'copied document','document',$id,$name);jsonResponse(['document'=>['id'=>$id]],201);
    }
    if ($action === 'vault.document.delete') {
        $user=currentUser();requirePost();$id=(string)(jsonBody()['id']??'');$document=findDocument($id,$user,true);$stmt=$pdo->prepare('SELECT storage_path FROM document_versions WHERE document_id=? UNION SELECT storage_path FROM documents WHERE id=?');$stmt->execute([$id,$id]);$paths=$stmt->fetchAll(PDO::FETCH_COLUMN);$pdo->prepare('DELETE FROM documents WHERE id=?')->execute([$id]);foreach(array_unique($paths) as $relative){$absolute=realpath(__DIR__.DIRECTORY_SEPARATOR.str_replace('/',DIRECTORY_SEPARATOR,$relative));$storageRoot=realpath(storageDirectory());if($absolute&&$storageRoot&&str_starts_with($absolute,$storageRoot.DIRECTORY_SEPARATOR))@unlink($absolute);}logActivity($pdo,$user,'deleted document','document',null,$document['name']);jsonResponse(['success'=>true]);
    }
    if ($action === 'vault.document.download' || $action === 'vault.document.preview') {
        $user=currentUser();$document=findDocument((string)($_GET['id']??''),$user);$absolute=realpath(__DIR__.DIRECTORY_SEPARATOR.str_replace('/',DIRECTORY_SEPARATOR,$document['storage_path']));$storageRoot=realpath(storageDirectory());if(!$absolute||!$storageRoot||!str_starts_with($absolute,$storageRoot.DIRECTORY_SEPARATOR)||!is_file($absolute))jsonResponse(['error'=>'The stored file is missing.'],404);
        header_remove('Content-Security-Policy');header('Content-Type: '.$document['file_type']);header('Content-Length: '.filesize($absolute));$disposition=$action==='vault.document.preview'?'inline':'attachment';header("Content-Disposition: $disposition; filename*=UTF-8''".rawurlencode($document['name']));header('Cache-Control: private, no-store');readfile($absolute);exit;
    }
    if ($action === 'vault.versions') {
        $user=currentUser();$document=findDocument((string)($_GET['id']??''),$user);$stmt=$pdo->prepare('SELECT v.*,COALESCE(u.username,\'Deleted user\') created_by_name FROM document_versions v LEFT JOIN users u ON u.id=v.created_by WHERE v.document_id=? ORDER BY v.version DESC');$stmt->execute([$document['id']]);$versions=array_map(fn($row)=>['id'=>$row['id'],'documentId'=>$row['document_id'],'version'=>(int)$row['version'],'fileSize'=>(int)$row['file_size'],'createdByName'=>$row['created_by_name'],'createdAt'=>$row['created_at']],$stmt->fetchAll());jsonResponse(['versions'=>$versions]);
    }
    if ($action === 'vault.activity') {
        currentUser();$rows=$pdo->query("SELECT a.*,COALESCE(u.username,'Deleted user') actor_name FROM activity a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100")->fetchAll();$activity=array_map(fn($row)=>['id'=>$row['id'],'actorName'=>$row['actor_name'],'action'=>$row['action'],'entityType'=>$row['entity_type'],'entityName'=>$row['entity_name'],'createdAt'=>$row['created_at']],$rows);jsonResponse(['activity'=>$activity]);
    }
    if ($action === 'search') {
        $user=currentUser();$q=trim((string)($_GET['q']??''));if($q==='')jsonResponse(['documents'=>[],'folders'=>[],'users'=>[]]);$needle='%'.$q.'%';$isAdmin=$user['role']==='admin'?1:0;
        $stmt=$pdo->prepare("SELECT d.*,u.username owner_name FROM documents d JOIN users u ON u.id=d.owner_id WHERE d.name LIKE ? AND (d.visibility='workspace' OR d.owner_id=? OR ?=1) ORDER BY d.updated_at DESC LIMIT 8");$stmt->execute([$needle,$user['id'],$isAdmin]);$documents=array_map('documentPublic',$stmt->fetchAll());
        $stmt=$pdo->prepare("SELECT f.*,u.username owner_name FROM folders f JOIN users u ON u.id=f.owner_id WHERE f.name LIKE ? AND (f.visibility='workspace' OR f.owner_id=? OR ?=1) ORDER BY f.updated_at DESC LIMIT 6");$stmt->execute([$needle,$user['id'],$isAdmin]);$folders=array_map('folderPublic',$stmt->fetchAll());$users=[];if($isAdmin){$stmt=$pdo->prepare('SELECT * FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY username LIMIT 6');$stmt->execute([$needle,$needle]);$users=array_map('publicUser',$stmt->fetchAll());}jsonResponse(['documents'=>$documents,'folders'=>$folders,'users'=>$users]);
    }

    jsonResponse(['error' => 'Unknown API action.'], 404);
} catch (PDOException $error) {
    error_log('Workspace database error: ' . $error->getMessage()); jsonResponse(['error' => envValue('WORKSPACE_DEBUG') === 'true' ? $error->getMessage() : 'A database operation failed.'], 500);
} catch (Throwable $error) {
    error_log('Workspace API error: ' . $error->getMessage()); jsonResponse(['error' => envValue('WORKSPACE_DEBUG') === 'true' ? $error->getMessage() : 'An unexpected server error occurred.'], 500);
}
