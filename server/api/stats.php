<?php
// stats.php — devolve os dados agregados do funil (JSON) para o dashboard.
// Protegido por sessão: faça login em /server/dashboard/ antes.
// ?periodo=24h|7d|30d|tudo (padrão: tudo) filtra tudo por created_at.

require __DIR__ . '/db.php';
session_start();

header('Content-Type: application/json; charset=utf-8');

if (empty($_SESSION['fb_auth'])) {
    http_response_code(401);
    echo json_encode(['erro' => 'nao autorizado']);
    exit;
}

$pdo = fb_db();

// Período: created_at é ISO8601 UTC (gmdate('c')) — comparar como texto = comparar no tempo.
// O valor do corte é gerado no servidor (não vem do usuário), então é seguro interpolar.
$periodo = $_GET['periodo'] ?? 'tudo';
if ($periodo === '24h')      $cutoff = gmdate('c', time() - 86400);
elseif ($periodo === '7d')   $cutoff = gmdate('c', time() - 7 * 86400);
elseif ($periodo === '30d')  $cutoff = gmdate('c', time() - 30 * 86400);
else { $periodo = 'tudo'; $cutoff = null; }
$dAnd   = $cutoff ? " AND created_at >= '$cutoff'" : "";   // p/ queries que já têm WHERE
$dWhere = $cutoff ? " WHERE created_at >= '$cutoff'" : ""; // p/ queries sem WHERE

function fb_scalar($pdo, $sql)
{
    $s = $pdo->query($sql);
    $v = $s->fetchColumn();
    return $v !== false ? (int)$v : 0;
}

$iniciaram  = fb_scalar($pdo, "SELECT COUNT(DISTINCT session_id) FROM events WHERE event_name='quiz_started'$dAnd");
$leads      = fb_scalar($pdo, "SELECT COUNT(*) FROM leads$dWhere");
$resultados = fb_scalar($pdo, "SELECT COUNT(DISTINCT session_id) FROM events WHERE event_name='result_viewed'$dAnd");
$cliques    = fb_scalar($pdo, "SELECT COUNT(DISTINCT session_id) FROM events WHERE event_name='cta_clicked'$dAnd");

// Funil: sessões distintas por etapa, na ordem em que apareceram (1ª vez vista).
$rows = $pdo->query(
    "SELECT step_id, COUNT(DISTINCT session_id) AS sessions, MIN(id) AS ord
     FROM events WHERE event_name='step_viewed' AND step_id IS NOT NULL$dAnd
     GROUP BY step_id ORDER BY ord"
)->fetchAll();

$base = $iniciaram > 0 ? $iniciaram : ($rows ? (int)$rows[0]['sessions'] : 1);
$funil = [];
$prev = null;
foreach ($rows as $r) {
    $s = (int)$r['sessions'];
    $retencao = $base > 0 ? round(100 * $s / $base) : 0;
    $dropoff = ($prev !== null && $prev > 0) ? round(100 * (1 - $s / $prev)) : 0;
    $funil[] = [
        'step_id' => $r['step_id'],
        'sessions' => $s,
        'retencao' => $retencao,
        'dropoff' => $dropoff,
    ];
    $prev = $s;
}

// Etapas finais fora do quiz (as conversões mais importantes do funil):
// Página de vendas (pitch_viewed) e Clique na oferta (cta_clicked).
$pitch = fb_scalar($pdo, "SELECT COUNT(DISTINCT session_id) FROM events WHERE event_name='pitch_viewed'$dAnd");
foreach ([['pitch_viewed', $pitch], ['cta_clicked', $cliques]] as $ex) {
    [$eid, $s] = $ex;
    if ($s <= 0 && $prev === null) continue;
    $funil[] = [
        'step_id' => $eid,
        'sessions' => $s,
        'retencao' => $base > 0 ? round(100 * $s / $base) : 0,
        'dropoff' => ($prev !== null && $prev > 0) ? round(100 * (1 - $s / $prev)) : 0,
    ];
    $prev = $s;
}

$ofertas = $pdo->query(
    "SELECT result_id, COUNT(DISTINCT session_id) AS sessions
     FROM events WHERE event_name='result_viewed' AND result_id IS NOT NULL AND result_id <> ''$dAnd
     GROUP BY result_id ORDER BY sessions DESC"
)->fetchAll();

$origens = $pdo->query(
    "SELECT COALESCE(NULLIF(utm_source,''),'(direto)') AS origem, COUNT(DISTINCT session_id) AS sessions
     FROM events WHERE event_name='quiz_started'$dAnd
     GROUP BY origem ORDER BY sessions DESC"
)->fetchAll();

$respostas = $pdo->query(
    "SELECT question_id, answer_id, COUNT(*) AS n
     FROM events WHERE event_name='answer_selected' AND question_id IS NOT NULL AND question_id <> '' AND (answer_text IS NULL OR answer_text = '')$dAnd
     GROUP BY question_id, answer_id ORDER BY question_id, n DESC"
)->fetchAll();

$respostas_abertas = $pdo->query(
    "SELECT e.question_id, e.answer_text, e.created_at, l.nome, l.email
     FROM events e LEFT JOIN leads l ON l.session_id=e.session_id
     WHERE e.event_name='answer_selected' AND e.answer_text IS NOT NULL AND e.answer_text <> ''" . ($cutoff ? " AND e.created_at >= '$cutoff'" : "") . "
     ORDER BY e.id DESC LIMIT 200"
)->fetchAll();

$recentes = $pdo->query(
    "SELECT created_at, event_name, step_id, session_id
     FROM events$dWhere ORDER BY id DESC LIMIT 40"
)->fetchAll();

// Respostas iniciadas: sessões que escolheram ao menos uma resposta.
$resp_iniciadas = fb_scalar($pdo, "SELECT COUNT(DISTINCT session_id) FROM events WHERE event_name='answer_selected'$dAnd");

// Média de etapas concluídas por sessão (e total de etapas do funil).
$total_etapas = fb_scalar($pdo, "SELECT COUNT(DISTINCT step_id) FROM events WHERE event_name='step_viewed' AND step_id IS NOT NULL AND step_id <> ''$dAnd");
$media_etapas = 0;
$r = $pdo->query("SELECT AVG(c) m FROM (SELECT session_id, COUNT(DISTINCT step_id) c FROM events WHERE event_name='step_viewed' AND step_id IS NOT NULL$dAnd GROUP BY session_id)")->fetch();
if ($r && $r['m'] !== null) $media_etapas = round($r['m'], 1);

// Tempo médio no funil (segundos), por sessão com mais de um evento.
$tempo_medio = 0;
$r = $pdo->query("SELECT AVG(dur) d FROM (SELECT session_id, (julianday(MAX(created_at))-julianday(MIN(created_at)))*86400 dur FROM events$dWhere GROUP BY session_id HAVING COUNT(*)>1)")->fetch();
if ($r && $r['d'] !== null) $tempo_medio = (int)round($r['d']);

// Dispositivos de acesso (a partir do user_agent).
$dispositivos = $pdo->query(
    "SELECT CASE
        WHEN user_agent LIKE '%iPad%' OR user_agent LIKE '%Tablet%' THEN 'Tablet'
        WHEN user_agent LIKE '%Mobile%' OR user_agent LIKE '%Android%' OR user_agent LIKE '%iPhone%' THEN 'Celular'
        ELSE 'Computador' END AS dispositivo,
        COUNT(DISTINCT session_id) AS sessions
     FROM events WHERE event_name='quiz_started'$dAnd
     GROUP BY dispositivo ORDER BY sessions DESC"
)->fetchAll();

// Campanhas (utm_campaign).
$campanhas = $pdo->query(
    "SELECT COALESCE(NULLIF(utm_campaign,''),'(sem campanha)') AS campanha, COUNT(DISTINCT session_id) AS sessions
     FROM events WHERE event_name='quiz_started'$dAnd
     GROUP BY campanha ORDER BY sessions DESC"
)->fetchAll();

// Desempenho por criativo (utm_content): o que acontece DEPOIS do clique — quem traz lead e
// conversão. O CTR do anúncio em si fica no Meta/Google (cruzar pelo mesmo utm_content).
$cr_s = $pdo->query("SELECT COALESCE(NULLIF(utm_content,''),'(sem criativo)') c, COUNT(DISTINCT session_id) n FROM events WHERE event_name='quiz_started'$dAnd GROUP BY c")->fetchAll(PDO::FETCH_KEY_PAIR);
$cr_l = $pdo->query("SELECT COALESCE(NULLIF(utm_content,''),'(sem criativo)') c, COUNT(*) n FROM leads$dWhere GROUP BY c")->fetchAll(PDO::FETCH_KEY_PAIR);
$cr_c = $pdo->query("SELECT COALESCE(NULLIF(utm_content,''),'(sem criativo)') c, COUNT(DISTINCT session_id) n FROM events WHERE event_name='cta_clicked'$dAnd GROUP BY c")->fetchAll(PDO::FETCH_KEY_PAIR);
$cr_keys = array_unique(array_merge(array_keys($cr_s), array_keys($cr_l), array_keys($cr_c)));
$criativos = [];
foreach ($cr_keys as $c) {
    $s = (int)($cr_s[$c] ?? 0); $ld = (int)($cr_l[$c] ?? 0); $ct = (int)($cr_c[$c] ?? 0);
    $criativos[] = [
        'criativo' => $c, 'sessions' => $s, 'leads' => $ld, 'cliques_cta' => $ct,
        'taxa_lead' => $s > 0 ? round(100 * $ld / $s) : 0,
        'conversao' => $s > 0 ? round(100 * $ct / $s) : 0,
    ];
}
usort($criativos, function ($a, $b) { return $b['sessions'] - $a['sessions']; });

// Lista de leads (PII — só no dashboard autenticado, atrás de senha).
$leads_lista = $pdo->query(
    "SELECT nome, email, whatsapp, result_id, utm_source, utm_campaign, created_at
     FROM leads$dWhere ORDER BY id DESC LIMIT 100"
)->fetchAll();

// Linha do tempo: visitas e leads por dia.
$tl = [];
foreach ($pdo->query("SELECT substr(created_at,1,10) dia, COUNT(DISTINCT session_id) n FROM events WHERE event_name='quiz_started'$dAnd GROUP BY dia") as $row) {
    $tl[$row['dia']] = ['dia' => $row['dia'], 'visitas' => (int)$row['n'], 'leads' => 0];
}
foreach ($pdo->query("SELECT substr(created_at,1,10) dia, COUNT(*) n FROM leads$dWhere GROUP BY dia") as $row) {
    if (!isset($tl[$row['dia']])) $tl[$row['dia']] = ['dia' => $row['dia'], 'visitas' => 0, 'leads' => 0];
    $tl[$row['dia']]['leads'] = (int)$row['n'];
}
ksort($tl);
$timeline = array_values($tl);

// Horário de pico (por hora do dia).
$hmap = [];
foreach ($pdo->query("SELECT strftime('%H', created_at) h, COUNT(DISTINCT session_id) n FROM events WHERE event_name='quiz_started'$dAnd GROUP BY h") as $row) {
    $hmap[(int)$row['h']] = (int)$row['n'];
}
$horarios = [];
for ($h = 0; $h < 24; $h++) $horarios[] = ['hora' => $h, 'sessions' => $hmap[$h] ?? 0];

// Tempo médio por etapa (segundos até o evento seguinte da mesma sessão).
$tempo_etapa = $pdo->query(
    "SELECT step_id, ROUND(AVG(delta)) media, COUNT(*) n FROM (
        SELECT e.step_id AS step_id,
               (julianday((SELECT x.created_at FROM events x WHERE x.session_id=e.session_id AND x.id>e.id ORDER BY x.id LIMIT 1)) - julianday(e.created_at))*86400 AS delta
        FROM events e WHERE e.event_name='step_viewed' AND e.step_id IS NOT NULL$dAnd
     ) WHERE delta IS NOT NULL AND delta >= 0 AND delta < 3600 GROUP BY step_id"
)->fetchAll();

echo json_encode([
    'periodo' => $periodo,
    'totais' => [
        'iniciaram' => $iniciaram,
        'resp_iniciadas' => $resp_iniciadas,
        'leads' => $leads,
        'resultados' => $resultados,
        'cliques_cta' => $cliques,
        'conversao' => $base > 0 ? round(100 * $cliques / $base) : 0,
        'taxa_lead' => $base > 0 ? round(100 * $leads / $base) : 0,
        'taxa_resultado' => $base > 0 ? round(100 * $resultados / $base) : 0,
        'taxa_resp_iniciada' => $base > 0 ? round(100 * $resp_iniciadas / $base) : 0,
        'media_etapas' => $media_etapas,
        'total_etapas' => $total_etapas,
        'tempo_medio' => $tempo_medio,
    ],
    'funil' => $funil,
    'ofertas' => $ofertas,
    'origens' => $origens,
    'dispositivos' => $dispositivos,
    'campanhas' => $campanhas,
    'criativos' => $criativos,
    'respostas' => $respostas,
    'respostas_abertas' => $respostas_abertas,
    'recentes' => $recentes,
    'leads_lista' => $leads_lista,
    'timeline' => $timeline,
    'horarios' => $horarios,
    'tempo_etapa' => $tempo_etapa,
], JSON_UNESCAPED_UNICODE);
