<?php
// lead-delete.php - remove um registro de lead e todos os eventos da mesma sessao.

require __DIR__ . '/db.php';
session_start();

header('Content-Type: application/json; charset=utf-8');

if (empty($_SESSION['fb_auth'])) {
    http_response_code(401);
    echo json_encode(['erro' => 'nao autorizado']);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['erro' => 'use POST']);
    exit;
}

$csrf = $_SERVER['HTTP_X_FB_CSRF'] ?? '';
if (empty($_SESSION['fb_csrf']) || !hash_equals($_SESSION['fb_csrf'], $csrf)) {
    http_response_code(403);
    echo json_encode(['erro' => 'sessao invalida']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$leadId = is_array($data) ? (int)($data['lead_id'] ?? 0) : 0;
if ($leadId < 1) {
    http_response_code(400);
    echo json_encode(['erro' => 'lead invalido']);
    exit;
}

try {
    $pdo = fb_db();
    $find = $pdo->prepare('SELECT session_id FROM leads WHERE id = ?');
    $find->execute([$leadId]);
    $lead = $find->fetch();
    if (!$lead) {
        http_response_code(404);
        echo json_encode(['erro' => 'lead nao encontrado']);
        exit;
    }

    $pdo->beginTransaction();
    if (!empty($lead['session_id'])) {
        $deleteEvents = $pdo->prepare('DELETE FROM events WHERE session_id = ?');
        $deleteEvents->execute([$lead['session_id']]);
    }
    $deleteLead = $pdo->prepare('DELETE FROM leads WHERE id = ?');
    $deleteLead->execute([$leadId]);
    $pdo->commit();

    echo json_encode(['ok' => true]);
} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['erro' => 'falha ao excluir']);
}
