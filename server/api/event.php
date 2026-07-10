<?php
// event.php — recebe os eventos do funil (POST JSON) e grava no SQLite.
// O motor (events.js) aponta para cá quando tracking.json.endpoint está preenchido.

require __DIR__ . '/db.php';

$cfg = fb_config();
header('Access-Control-Allow-Origin: ' . $cfg['cors_origin']);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['erro' => 'use POST']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data) || empty($data['event_name'])) {
    http_response_code(400);
    echo json_encode(['erro' => 'payload invalido']);
    exit;
}

function fb_v($a, $k)
{
    return isset($a[$k]) && $a[$k] !== '' ? $a[$k] : null;
}

try {
    $pdo = fb_db();
    $now = gmdate('c'); // timestamp do servidor (ISO 8601, UTC)

    $stmt = $pdo->prepare(
        "INSERT INTO events
        (session_id,event_name,step_id,question_id,answer_id,answer_text,result_id,page_url,referrer,user_agent,
         utm_source,utm_medium,utm_campaign,utm_content,utm_term,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    );
    $stmt->execute([
        fb_v($data, 'session_id'),
        $data['event_name'],
        fb_v($data, 'step_id'),
        fb_v($data, 'question_id'),
        fb_v($data, 'answer_id'),
        fb_v($data, 'answer_text'),
        fb_v($data, 'result_id'),
        fb_v($data, 'page_url'),
        fb_v($data, 'referrer'),
        fb_v($data, 'user_agent'),
        fb_v($data, 'utm_source'),
        fb_v($data, 'utm_medium'),
        fb_v($data, 'utm_campaign'),
        fb_v($data, 'utm_content'),
        fb_v($data, 'utm_term'),
        $now,
    ]);

    // Se o evento trouxer dados de lead (no lead_submitted), grava/atualiza a tabela leads.
    if (!empty($data['lead']) && is_array($data['lead'])) {
        $l = $data['lead'];
        $up = $pdo->prepare(
            "INSERT INTO leads
            (session_id,nome,email,whatsapp,consent,result_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term,created_at)
            VALUES (:sid,:nome,:email,:wpp,:consent,:rid,:us,:um,:uc,:uco,:ut,:now)
            ON CONFLICT(session_id) DO UPDATE SET
                nome=excluded.nome, email=excluded.email, whatsapp=excluded.whatsapp, consent=excluded.consent"
        );
        $up->execute([
            ':sid' => fb_v($data, 'session_id'),
            ':nome' => fb_v($l, 'nome'),
            ':email' => fb_v($l, 'email'),
            ':wpp' => fb_v($l, 'whatsapp'),
            ':consent' => !empty($l['consent']) ? 1 : 0,
            ':rid' => fb_v($data, 'result_id'),
            ':us' => fb_v($data, 'utm_source'),
            ':um' => fb_v($data, 'utm_medium'),
            ':uc' => fb_v($data, 'utm_campaign'),
            ':uco' => fb_v($data, 'utm_content'),
            ':ut' => fb_v($data, 'utm_term'),
            ':now' => $now,
        ]);
    }

    echo json_encode(['ok' => true]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['erro' => 'falha ao gravar']);
}
