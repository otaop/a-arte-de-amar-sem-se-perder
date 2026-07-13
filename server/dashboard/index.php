<?php
// index.php — dashboard do funil (login por senha + leitura de stats.php).
require __DIR__ . '/../api/db.php';
session_start();
$cfg = fb_config();

if (isset($_GET['logout'])) {
    $_SESSION = [];
    session_destroy();
    header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
    exit;
}

$erro = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['senha']) && $_POST['senha'] === $cfg['dashboard_senha']) {
        $_SESSION['fb_auth'] = true;
        header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
        exit;
    }
    $erro = 'Senha incorreta.';
}
$auth = !empty($_SESSION['fb_auth']);
if ($auth && empty($_SESSION['fb_csrf'])) {
    $_SESSION['fb_csrf'] = bin2hex(random_bytes(32));
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FunilBox · Dashboard</title>
  <link rel="stylesheet" href="dashboard.css?v=12" />
</head>
<body>
<?php if (!$auth): ?>
  <form class="login" method="post">
    <h1>Dashboard do funil</h1>
    <p class="muted">Digite a senha para acessar.</p>
    <input type="password" name="senha" placeholder="Senha" autofocus />
    <?php if ($erro): ?><p class="erro"><?php echo htmlspecialchars($erro); ?></p><?php endif; ?>
    <button type="submit">Entrar</button>
  </form>
<?php else: ?>
  <header class="topo">
    <div class="brand"><span class="brand-dot"></span> FunilBox <span class="brand-sep">·</span> <span class="muted">Desempenho do funil</span></div>
    <a class="sair" href="?logout=1">Sair</a>
  </header>
  <main id="app" data-csrf="<?php echo htmlspecialchars($_SESSION['fb_csrf'], ENT_QUOTES, 'UTF-8'); ?>">
    <div class="filtros" id="filtros">
      <span class="filtros-lbl">Período:</span>
      <button class="filtro" data-p="24h" type="button">24 horas</button>
      <button class="filtro" data-p="7d" type="button">7 dias</button>
      <button class="filtro" data-p="30d" type="button">30 dias</button>
      <button class="filtro" data-p="tudo" type="button">Tudo</button>
    </div>
    <p class="muted estado" id="estado">Carregando…</p>

    <section class="modulo">
      <div class="modulo-head"><h2>Resumo</h2><span class="sub">visão geral do funil</span></div>
      <div id="kpis" class="kpis"></div>
    </section>

    <section class="modulo">
      <div class="modulo-head"><h2>Respostas por pergunta</h2><span class="sub">como os leads responderam cada etapa</span><a class="btn-export" href="../api/export.php?tipo=respostas">↓ Exportar CSV</a></div>
      <div id="kanban" class="kanban"></div>
    </section>

    <section class="modulo">
      <div class="modulo-head"><h2>O que os dados dizem</h2><span class="sub">leitura automática do funil</span></div>
      <div id="insights" class="insights"></div>
    </section>

    <div class="grid-2">
      <section class="modulo">
        <div class="modulo-head"><h2>Investimento e custo</h2><span class="sub">informe o gasto em anúncios</span></div>
        <div id="custo"></div>
      </section>
      <section class="modulo">
        <div class="modulo-head"><h2>Linha do tempo</h2><span class="sub">visitas e leads por dia</span></div>
        <div id="timeline"></div>
      </section>
    </div>

    <section class="modulo">
      <div class="modulo-head"><h2>Funil de conversão</h2><span class="sub">da entrada do quiz até o clique na oferta</span></div>
      <div id="funil" class="funil"></div>
    </section>

    <section class="modulo">
      <div class="modulo-head"><h2>Respostas abertas</h2><span class="sub">leitura qualitativa, visível só aqui atrás de senha</span><a class="btn-export" href="../api/export.php?tipo=abertas">↓ Exportar CSV</a></div>
      <div id="abertas"></div>
    </section>

    <div class="grid-2">
      <section class="modulo">
        <div class="modulo-head"><h2>Origem do tráfego</h2></div>
        <div id="origens"></div>
      </section>
      <section class="modulo">
        <div class="modulo-head"><h2>Dispositivos de acesso</h2></div>
        <div id="dispositivos"></div>
      </section>
    </div>
    <div class="grid-2">
      <section class="modulo">
        <div class="modulo-head"><h2>Campanhas</h2><span class="sub">tráfego por utm_campaign</span></div>
        <div id="campanhas"></div>
      </section>
      <section class="modulo">
        <div class="modulo-head"><h2>Resultados por oferta</h2></div>
        <div id="ofertas"></div>
      </section>
    </div>

    <section class="modulo">
      <div class="modulo-head"><h2>Desempenho por criativo</h2><span class="sub">por utm_content — quem traz lead e conversão depois do clique</span></div>
      <div id="criativos"></div>
    </section>

    <section class="modulo">
      <div class="modulo-head"><h2>Tempo médio por etapa</h2><span class="sub">onde os leads mais demoram</span></div>
      <div id="tempo-etapa"></div>
    </section>

    <section class="modulo">
      <div class="modulo-head"><h2>Horários de pico</h2><span class="sub">quando as pessoas fazem o quiz</span></div>
      <div id="horarios"></div>
    </section>

    <section class="modulo">
      <div class="modulo-head"><h2>Leads capturados</h2><span class="sub">contatos para acompanhar (visível só aqui, atrás de senha)</span><a class="btn-export" href="../api/export.php?tipo=leads">↓ Exportar CSV</a></div>
      <div id="leads"></div>
    </section>

    <section class="modulo">
      <div class="modulo-head"><h2>Eventos recentes</h2></div>
      <div id="recentes" class="recentes-2col"></div>
    </section>

    <div class="modal" id="delete-modal" hidden>
      <button class="modal-backdrop" type="button" data-delete-cancel aria-label="Cancelar exclusão"></button>
      <form class="modal-dialog" id="delete-form" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <button class="modal-close" type="button" data-delete-cancel aria-label="Fechar">×</button>
        <p class="modal-eyebrow">Ação permanente</p>
        <h2 id="delete-title">Excluir registro?</h2>
        <p>Você está prestes a apagar <strong id="delete-lead-name"></strong>.</p>
        <p class="muted">O contato, as respostas e todos os eventos desta sessão serão removidos.</p>
        <label for="delete-confirmation">Digite <strong>delete</strong> para confirmar</label>
        <input id="delete-confirmation" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" />
        <div class="modal-actions">
          <button class="btn-modal-cancel" type="button" data-delete-cancel>Cancelar</button>
          <button class="btn-modal-delete" id="delete-submit" type="submit" disabled>Excluir registro</button>
        </div>
      </form>
    </div>
  </main>
  <script src="dashboard.js?v=14"></script>
<?php endif; ?>
</body>
</html>
