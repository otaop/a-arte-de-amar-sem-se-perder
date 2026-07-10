<?php
// export.php — exporta dados do funil em CSV (autenticado por sessão).
// ?tipo=leads (padrão) — contatos capturados (PII).
// ?tipo=respostas — distribuição de respostas fechadas por pergunta (com labels do quiz.json).
// ?tipo=abertas — respostas qualitativas, associadas ao lead quando disponível.

require __DIR__ . '/db.php';
session_start();

if (empty($_SESSION['fb_auth'])) {
    http_response_code(401);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'nao autorizado';
    exit;
}

$pdo = fb_db();
$tipo = $_GET['tipo'] ?? 'leads';

// Mesmo filtro de período do dashboard (created_at é ISO8601 UTC; corte gerado no servidor).
$periodo = $_GET['periodo'] ?? 'tudo';
if ($periodo === '24h')      $cutoff = gmdate('c', time() - 86400);
elseif ($periodo === '7d')   $cutoff = gmdate('c', time() - 7 * 86400);
elseif ($periodo === '30d')  $cutoff = gmdate('c', time() - 30 * 86400);
else $cutoff = null;
$dAnd   = $cutoff ? " AND created_at >= '$cutoff'" : "";
$dWhere = $cutoff ? " WHERE created_at >= '$cutoff'" : "";

function fb_csv($filename, array $linhas)
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    echo "\xEF\xBB\xBF"; // BOM: Excel abre os acentos corretamente
    $out = fopen('php://output', 'w');
    foreach ($linhas as $l) {
        fputcsv($out, $l, ';'); // ; é o separador padrão do Excel em PT-BR
    }
    fclose($out);
    exit;
}

if ($tipo === 'respostas') {
    // Labels legíveis a partir do quiz.json. A numeração segue a mesma regra do
    // dashboard (montarQuiz): conta TODA etapa-pergunta (single/multi/calc/slider/
    // boolean/number), não só as que têm opções — assim o Nº bate com a tela.
    $labels = [];
    $tiposPergunta = ['single', 'multi', 'calc', 'slider', 'boolean', 'number', 'textarea'];
    $quizPath = __DIR__ . '/../../config/quiz.json';
    if (is_file($quizPath)) {
        $quiz = json_decode(file_get_contents($quizPath), true);
        $num = 0;
        foreach ($quiz['steps'] ?? [] as $st) {
            $ehPergunta = in_array($st['type'] ?? '', $tiposPergunta, true);
            if ($ehPergunta) $num++;
            if ($ehPergunta) {
                $opts = [];
                if (!empty($st['options']) && is_array($st['options'])) {
                foreach ($st['options'] as $o) {
                    $opts[$o['value']] = $o['label'] ?? $o['value'];
                }
                }
                $labels[$st['id']] = ['num' => $num, 'texto' => $st['question'] ?? $st['id'], 'opts' => $opts];
            }
        }
    }

    $rows = $pdo->query(
        "SELECT question_id, answer_id, COUNT(*) AS n
         FROM events WHERE event_name='answer_selected' AND question_id IS NOT NULL AND question_id <> '' AND (answer_text IS NULL OR answer_text = '')$dAnd
         GROUP BY question_id, answer_id ORDER BY question_id, n DESC"
    )->fetchAll();

    $tot = [];
    foreach ($rows as $r) {
        $tot[$r['question_id']] = ($tot[$r['question_id']] ?? 0) + (int)$r['n'];
    }

    $csv = [['Nº', 'Pergunta', 'Resposta', 'Respostas', '%']];
    foreach ($rows as $r) {
        $q = $r['question_id'];
        $info = $labels[$q] ?? null;
        $num = $info ? $info['num'] : '';
        $texto = $info ? $info['texto'] : $q;
        $resp = ($info && isset($info['opts'][$r['answer_id']])) ? $info['opts'][$r['answer_id']] : $r['answer_id'];
        $pct = ($tot[$q] ?? 0) > 0 ? round(100 * $r['n'] / $tot[$q]) . '%' : '';
        $csv[] = [$num, $texto, $resp, (int)$r['n'], $pct];
    }
    fb_csv('respostas-por-pergunta.csv', $csv);
}

if ($tipo === 'abertas') {
    $labels = [];
    $tiposPergunta = ['single', 'multi', 'calc', 'slider', 'boolean', 'number', 'textarea'];
    $quizPath = __DIR__ . '/../../config/quiz.json';
    if (is_file($quizPath)) {
        $quiz = json_decode(file_get_contents($quizPath), true);
        $num = 0;
        foreach ($quiz['steps'] ?? [] as $st) {
            if (in_array($st['type'] ?? '', $tiposPergunta, true)) $num++;
            if (($st['type'] ?? '') === 'textarea') $labels[$st['id']] = ['num' => $num, 'texto' => $st['question'] ?? $st['id']];
        }
    }
    $rows = $pdo->query(
        "SELECT e.question_id, e.answer_text, e.created_at, l.nome, l.email
         FROM events e LEFT JOIN leads l ON l.session_id=e.session_id
         WHERE e.event_name='answer_selected' AND e.answer_text IS NOT NULL AND e.answer_text <> ''" . ($cutoff ? " AND e.created_at >= '$cutoff'" : "") . "
         ORDER BY e.id DESC"
    )->fetchAll();
    $csv = [['Nº', 'Pergunta', 'Resposta', 'Nome', 'E-mail', 'Data']];
    foreach ($rows as $r) {
        $info = $labels[$r['question_id']] ?? ['num' => '', 'texto' => $r['question_id']];
        $csv[] = [$info['num'], $info['texto'], $r['answer_text'], $r['nome'], $r['email'], $r['created_at']];
    }
    fb_csv('respostas-abertas.csv', $csv);
}

// Padrão: leads (PII completa — só sai daqui porque o endpoint é autenticado).
$rows = $pdo->query(
    "SELECT nome, email, whatsapp, result_id, utm_source, utm_medium, utm_campaign, created_at
     FROM leads$dWhere ORDER BY id DESC"
)->fetchAll(PDO::FETCH_ASSOC);

$csv = [['Nome', 'E-mail', 'WhatsApp', 'Resultado', 'Origem', 'Mídia', 'Campanha', 'Data']];
foreach ($rows as $r) {
    $csv[] = [
        $r['nome'], $r['email'], $r['whatsapp'], $r['result_id'],
        $r['utm_source'], $r['utm_medium'], $r['utm_campaign'], $r['created_at'],
    ];
}
fb_csv('leads.csv', $csv);
