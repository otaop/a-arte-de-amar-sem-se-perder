<?php
// db.php — conexão SQLite (PDO) + criação do schema. Sem dependências externas.

function fb_config()
{
    $defaults = [
        'db_path' => __DIR__ . '/../database/funilbox.sqlite',
        'dashboard_senha' => 'troque-esta-senha',
        'cors_origin' => '*',
    ];
    $cfgFile = __DIR__ . '/../config.php';
    if (file_exists($cfgFile)) {
        $cfg = require $cfgFile;
        if (is_array($cfg)) {
            return array_merge($defaults, $cfg);
        }
    }
    return $defaults;
}

function fb_db()
{
    $cfg = fb_config();
    $dir = dirname($cfg['db_path']);
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    $pdo = new PDO('sqlite:' . $cfg['db_path']);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode=WAL;');
    fb_init_schema($pdo);
    return $pdo;
}

function fb_init_schema($pdo)
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id   TEXT,
            event_name   TEXT,
            step_id      TEXT,
            question_id  TEXT,
            answer_id    TEXT,
            answer_text  TEXT,
            result_id    TEXT,
            page_url     TEXT,
            referrer     TEXT,
            user_agent   TEXT,
            utm_source   TEXT,
            utm_medium   TEXT,
            utm_campaign TEXT,
            utm_content  TEXT,
            utm_term     TEXT,
            created_at   TEXT
        );
    ");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_events_name ON events(event_name);");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_events_step ON events(step_id);");
    $cols = $pdo->query("PRAGMA table_info(events)")->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('answer_text', $cols, true)) {
        $pdo->exec("ALTER TABLE events ADD COLUMN answer_text TEXT");
    }

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id   TEXT UNIQUE,
            nome         TEXT,
            email        TEXT,
            whatsapp     TEXT,
            consent      INTEGER,
            result_id    TEXT,
            utm_source   TEXT,
            utm_medium   TEXT,
            utm_campaign TEXT,
            utm_content  TEXT,
            utm_term     TEXT,
            created_at   TEXT
        );
    ");
}
