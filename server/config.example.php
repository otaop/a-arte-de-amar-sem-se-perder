<?php
// Copie este arquivo para "config.php" (no mesmo diretório) e ajuste os valores.
// O config.php fica fora do git.
return [
    // Caminho do banco SQLite (criado automaticamente na primeira gravação).
    // EM PRODUÇÃO, prefira um caminho FORA do public_html, por exemplo:
    //   'db_path' => __DIR__ . '/../../../dados/funilbox.sqlite',
    // O .htaccess já bloqueia acesso direto, mas fora do public_html é mais seguro ainda.
    'db_path' => __DIR__ . '/database/funilbox.sqlite',

    // Senha do dashboard. TROQUE antes de publicar.
    'dashboard_senha' => 'troque-esta-senha',

    // Origem permitida para o endpoint de eventos (CORS).
    // Use a URL do seu funil em produção, ex.: 'https://seufunil.com'. '*' libera geral.
    'cors_origin' => '*',
];
