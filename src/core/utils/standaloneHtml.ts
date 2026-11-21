/** A single-file offline-ish copy of the vault (reads/edits in the browser). Ported from AetherNote. */
export function buildStandaloneHtml(notes: { path: string; content: string }[] = [], title = 'NoSidian'): string {
  const data = JSON.stringify(notes).replace(/</g, '\\u003c').replace(/`/g, '\\u0060').replace(/\$\{/g, '\\u0024{');
  return `<!DOCTYPE html>
<html lang="en" dir="ltr" data-theme="obsidian-slate">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title.replace(/</g, '&lt;')} — NoSidian</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Vazirmatn:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"><\/script>
  <style>
    :root { --font-ui:'Plus Jakarta Sans','Vazirmatn',system-ui,sans-serif; --font-mono:'JetBrains Mono',monospace; --accent:#7c3aed; --accent-soft:rgba(124,58,237,.15); --left-w:260px; --right-w:280px; }
    [data-theme="obsidian-slate"] { --bg1:#111216; --bg2:#17181d; --bg3:#1f2028; --bg4:#252730; --hover:rgba(255,255,255,.06); --tx1:#eceef4; --tx2:#a1a6b8; --tx3:#6e7385; --bd:rgba(255,255,255,.09); --code:#0c0d10; }
    [data-theme="midnight-carbon"] { --bg1:#060608; --bg2:#0c0c10; --bg3:#14141a; --bg4:#1b1b24; --hover:rgba(255,255,255,.07); --tx1:#f4f5f9; --tx2:#9a9fb2; --tx3:#606579; --bd:rgba(255,255,255,.1); --code:#020203; }
    [data-theme="nord-arctic"] { --bg1:#242933; --bg2:#2e3440; --bg3:#3b4252; --bg4:#434c5e; --hover:rgba(216,222,233,.08); --tx1:#eceff4; --tx2:#d8dee9; --tx3:#8b95ab; --bd:rgba(216,222,233,.12); --code:#1d222b; }
    [data-theme="paper-daylight"] { --bg1:#ffffff; --bg2:#f6f7f9; --bg3:#eceef2; --bg4:#ffffff; --hover:rgba(15,23,42,.05); --tx1:#15171c; --tx2:#4e5463; --tx3:#788093; --bd:rgba(15,23,42,.1); --code:#f1f3f7; }
    [data-theme="warm-parchment"] { --bg1:#f7f1e3; --bg2:#efe6d2; --bg3:#e6dac0; --bg4:#faf5ea; --hover:rgba(68,52,32,.06); --tx1:#34291d; --tx2:#5f4f3c; --tx3:#826f58; --bd:rgba(68,52,32,.13); --code:#ebe1ca; }
    * { box-sizing:border-box; margin:0; padding:0; }
    html,body { height:100%; overflow:hidden; font-family:var(--font-ui); background:var(--bg1); color:var(--tx1); font-size:14px; }
    button,input,textarea,select { font-family:inherit; color:inherit; }
    button { background:none; border:none; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:5px; }
    .shell { display:flex; height:calc(100vh - 26px); }
    .ribbon { width:46px; background:var(--bg2); border-inline-end:1px solid var(--bd); display:flex; flex-direction:column; align-items:center; padding:10px 0; gap:6px; flex-shrink:0; }
    .rib-btn { width:34px; height:34px; border-radius:6px; color:var(--tx2); font-size:15px; }
    .rib-btn:hover,.rib-btn.active { background:var(--accent-soft); color:var(--accent); }
    .sidebar { background:var(--bg2); display:flex; flex-direction:column; flex-shrink:0; overflow:hidden; }
    .s-left { width:var(--left-w); border-inline-end:1px solid var(--bd); }
    .s-right { width:var(--right-w); border-inline-start:1px solid var(--bd); }
    .sidebar.hidden { display:none; }
    .s-tabs { display:flex; gap:2px; padding:8px; border-bottom:1px solid var(--bd); }
    .s-tab { flex:1; padding:5px 4px; border-radius:6px; font-size:12px; color:var(--tx2); white-space:nowrap; }
    .s-tab.active { background:var(--bg3); color:var(--accent); font-weight:600; }
    .s-bar { display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid var(--bd); font-size:12px; font-weight:600; gap:8px; }
    .s-body { flex:1; overflow-y:auto; padding:8px; }
    .tree-item { width:100%; justify-content:flex-start; padding:5px 8px; border-radius:6px; font-size:13px; color:var(--tx2); text-align:start; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tree-item:hover { background:var(--hover); color:var(--tx1); }
    .tree-item.active { background:var(--accent-soft); color:var(--tx1); font-weight:500; }
    .main { flex:1; display:flex; flex-direction:column; min-width:0; position:relative; }
    .tabs { height:36px; background:var(--bg2); border-bottom:1px solid var(--bd); display:flex; align-items:center; padding:0 8px; gap:4px; overflow-x:auto; flex-shrink:0; }
    .tab { height:28px; padding:0 10px; border-radius:6px; font-size:12px; color:var(--tx2); border:1px solid transparent; flex-shrink:0; }
    .tab.active { background:var(--bg1); color:var(--tx1); border-color:var(--bd); font-weight:500; }
    .topbar { height:42px; padding:0 14px; border-bottom:1px solid var(--bd); display:flex; align-items:center; justify-content:space-between; gap:8px; flex-shrink:0; }
    .seg { display:flex; background:var(--bg2); border:1px solid var(--bd); padding:2px; border-radius:6px; gap:2px; }
    .seg button { padding:4px 9px; border-radius:4px; font-size:12px; color:var(--tx2); white-space:nowrap; }
    .seg button.active { background:var(--accent); color:#fff; }
    .fmtbar { display:flex; gap:4px; padding:5px 14px; background:var(--bg2); border-bottom:1px solid var(--bd); overflow-x:auto; flex-shrink:0; }
    .fmtbar.hidden { display:none; }
    .fmtbar button { padding:3px 8px; border-radius:4px; font-size:12px; color:var(--tx2); white-space:nowrap; }
    .fmtbar button:hover { background:var(--hover); color:var(--tx1); }
    .panes { flex:1; display:flex; min-height:0; position:relative; overflow:hidden; }
    .pane { flex:1; min-width:0; overflow-y:auto; padding:20px 28px 60px; }
    .pane.hidden { display:none; }
    .pane-pv { border-inline-start:1px solid var(--bd); user-select:text; }
    #editor { width:100%; height:100%; min-height:420px; background:transparent; border:none; outline:none; resize:none; font-size:15px; line-height:1.8; }
    .md { max-width:78ch; margin:0 auto; line-height:1.8; font-size:15.5px; }
    .md h1,.md h2,.md h3 { margin:1.3em 0 .5em; font-weight:700; }
    .md h1 { font-size:1.9em; border-bottom:1px solid var(--bd); padding-bottom:.3em; margin-top:0; }
    .md h2 { font-size:1.4em; border-bottom:1px solid var(--bd); padding-bottom:.2em; }
    .md p,.md ul,.md ol { margin-bottom:.9em; }
    .md ul,.md ol { padding-inline-start:1.6em; }
    .md table { width:100%; border-collapse:collapse; margin:1em 0; font-size:13.5px; }
    .md th,.md td { border:1px solid var(--bd); padding:7px 10px; text-align:start; }
    .md th { background:var(--bg2); }
    .md blockquote,.callout { border:1px solid var(--bd); background:var(--bg2); border-radius:10px; padding:10px 14px; margin:1em 0; }
    .callout-title { font-weight:600; color:var(--accent); margin-bottom:4px; cursor:pointer; }
    .callout.collapsed .callout-body { display:none; }
    .md code:not(pre code) { font-family:var(--font-mono); font-size:.87em; background:var(--bg3); padding:2px 6px; border-radius:4px; direction:ltr; }
    .md pre { background:var(--code); border:1px solid var(--bd); border-radius:10px; padding:14px; overflow:auto; margin:1em 0; direction:ltr; text-align:left; font-family:var(--font-mono); font-size:13px; }
    .md mark { background:rgba(250,204,21,.25); padding:1px 4px; border-radius:3px; color:inherit; }
    .wikilink { color:var(--accent); border-bottom:1px dashed var(--accent); cursor:pointer; text-decoration:none; }
    .special { position:absolute; inset:0; background:var(--bg1); z-index:15; display:none; flex-direction:column; }
    #v-graph { z-index:20; }
    .special.open { display:flex; }
    .kb-board { flex:1; display:flex; gap:14px; padding:18px; overflow:auto; align-items:flex-start; }
    .kb-col { width:270px; flex-shrink:0; background:var(--bg2); border:1px solid var(--bd); border-radius:10px; padding:10px; display:flex; flex-direction:column; gap:8px; }
    .kb-card { background:var(--bg4); border:1px solid var(--bd); border-radius:6px; padding:8px 10px; font-size:12.5px; display:flex; gap:8px; cursor:grab; align-items:flex-start; }
    .status { height:26px; background:var(--bg2); border-top:1px solid var(--bd); padding:0 12px; display:flex; align-items:center; justify-content:space-between; font-size:11.5px; color:var(--tx2); font-variant-numeric:tabular-nums; }
    .modal-bg { position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:90; display:none; align-items:center; justify-content:center; padding:16px; }
    .modal-bg.open { display:flex; }
    .modal { width:100%; max-width:500px; background:var(--bg2); border:1px solid var(--bd); border-radius:12px; overflow:hidden; max-height:85vh; display:flex; flex-direction:column; }
    .modal-h { padding:12px 16px; border-bottom:1px solid var(--bd); display:flex; justify-content:space-between; align-items:center; font-weight:600; }
    .modal-b { padding:16px; overflow-y:auto; }
    .btn { padding:5px 10px; border-radius:6px; font-size:12px; background:var(--bg3); border:1px solid var(--bd); white-space:nowrap; }
    .btn:hover { background:var(--hover); }
    .btn-p { background:var(--accent); color:#fff; border-color:var(--accent); }
    .btn-p:hover { opacity:.92; background:var(--accent); }
    .inp { width:100%; padding:7px 10px; border-radius:6px; background:var(--bg1); border:1px solid var(--bd); font-size:13px; outline:none; }
    .card { padding:8px 10px; border-radius:6px; background:var(--bg3); border:1px solid var(--bd); margin-bottom:6px; font-size:12px; width:100%; justify-content:space-between; text-align:start; }
    .fc-box { border:1px solid var(--bd); background:var(--bg3); border-radius:12px; padding:32px 20px; text-align:center; font-size:17px; cursor:pointer; margin:12px 0; }
    body.zen .ribbon,body.zen .s-left,body.zen .s-right,body.zen .tabs,body.zen .fmtbar,body.zen .status { display:none!important; }
    @media print { .ribbon,.sidebar,.tabs,.topbar,.fmtbar,.status,#pane-ed { display:none!important; } #pane-pv { border:none!important; overflow:visible!important; } }
  </style>
</head>
<body>
  <input type="file" id="file-in" accept=".md,.markdown,.txt" multiple hidden />
  <div class="shell">
    <nav class="ribbon">
      <button class="rib-btn active" id="rb-left" title="Files">◧</button>
      <button class="rib-btn" id="rb-cmd" title="Quick Switcher (Ctrl+O)">⌕</button>
      <button class="rib-btn" id="rb-graph" title="Knowledge Graph">◈</button>
      <button class="rib-btn" id="rb-mm" title="Mindmap">⑂</button>
      <button class="rib-btn" id="rb-kb" title="Kanban">▥</button>
      <button class="rib-btn" id="rb-fc" title="Flashcards">⧉</button>
      <button class="rib-btn" id="rb-slides" title="Slides">▣</button>
      <div style="flex:1"></div>
      <button class="rib-btn active" id="rb-right" title="Inspector">◨</button>
      <button class="rib-btn" id="rb-set" title="Settings">⚙</button>
    </nav>

    <aside class="sidebar s-left" id="s-left">
      <div class="s-tabs">
        <button class="s-tab active" data-lt="files" data-i="files">Files</button>
        <button class="s-tab" data-lt="search" data-i="search">Search</button>
        <button class="s-tab" data-lt="tags" data-i="tags">Tags</button>
      </div>
      <div class="s-bar">
        <span data-i="vault">Aether Vault</span>
        <div style="display:flex;gap:4px">
          <button class="btn" style="padding:3px 7px" id="btn-new" title="New Note">+</button>
          <button class="btn" style="padding:3px 7px" id="btn-open" title="Open .md">↑</button>
          <button class="btn" style="padding:3px 7px" id="btn-dir" title="Open Folder">📁</button>
        </div>
      </div>
      <div class="s-body" id="left-body"></div>
    </aside>

    <main class="main">
      <div class="tabs" id="tab-bar"></div>
      <div class="topbar">
        <div style="display:flex;align-items:center;gap:6px;min-width:0">
          <span id="note-title" style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
          <button class="btn" id="btn-ren" title="Rename Note" style="padding:2px 6px;font-size:11px">✎</button>
          <button class="btn" id="btn-del" title="Delete Note" style="padding:2px 6px;font-size:11px">🗑</button>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <div class="seg" id="mode-seg">
            <button data-m="editor" data-i="edit">Editor</button>
            <button data-m="split" class="active" data-i="split">Split</button>
            <button data-m="preview" data-i="read">Reader</button>
            <button data-m="mindmap" data-i="mindmap">Mindmap</button>
            <button data-m="kanban" data-i="kanban">Kanban</button>
          </div>
          <button class="btn" id="btn-exp" data-i="expBtn">Export</button>
          <button class="btn" id="btn-zen" data-i="zen">Zen</button>
        </div>
      </div>
      <div class="fmtbar" id="fmtbar">
        <button data-f="h1">H1</button><button data-f="h2">H2</button><button data-f="bold">B</button>
        <button data-f="italic">I</button><button data-f="hl">Highlight</button><button data-f="wiki">[[Link]]</button>
        <button data-f="task">Task</button><button data-f="callout">Callout</button><button data-f="fc">Q::A</button>
      </div>
      <div class="panes">
        <section class="pane" id="pane-ed"><textarea id="editor" spellcheck="false"></textarea></section>
        <section class="pane pane-pv" id="pane-pv"><article class="md" id="preview"></article></section>
        <section class="special" id="v-graph">
          <div class="s-bar"><span data-i="graphTitle">Knowledge Graph</span><button class="btn" id="close-graph" data-i="close">Close</button></div>
          <canvas id="g-canvas" style="flex:1;width:100%;height:100%"></canvas>
        </section>
        <section class="special" id="v-mm">
          <div class="s-bar"><span data-i="mmTitle">Interactive Mindmap</span><button class="btn" id="dl-svg" data-i="dlSvg">Download SVG</button></div>
          <svg id="mm-svg" style="flex:1;width:100%;height:100%"></svg>
        </section>
        <section class="special" id="v-kb">
          <div class="s-bar"><span data-i="kbTitle">Two-Way Kanban Board</span><button class="btn btn-p" id="kb-tpl" data-i="tplBtn">Insert Template</button></div>
          <div class="kb-board" id="kb-board"></div>
        </section>
      </div>
    </main>

    <aside class="sidebar s-right" id="s-right">
      <div class="s-tabs">
        <button class="s-tab active" data-rt="links" data-i="links">Links</button>
        <button class="s-tab" data-rt="outline" data-i="outline">Outline</button>
        <button class="s-tab" data-rt="focus" data-i="focus">Focus</button>
        <button class="s-tab" data-rt="history" data-i="history">History</button>
      </div>
      <div class="s-body" id="right-body"></div>
    </aside>
  </div>

  <footer class="status">
    <div style="display:flex;gap:12px">
      <button id="st-lang">English</button>
      <span id="st-links">0 backlinks</span>
      <span id="st-pomo">25:00</span>
    </div>
    <div id="st-stats">0 words · 0 chars</div>
  </footer>

  <div class="modal-bg" id="modal-bg">
    <div class="modal" id="modal-box">
      <div class="modal-h"><span id="modal-t"></span><button class="btn" id="modal-x">✕</button></div>
      <div class="modal-b" id="modal-b"></div>
    </div>
  </div>

  <div class="modal-bg" id="slides-bg">
    <div class="modal" style="max-width:860px;height:80vh">
      <div class="modal-h"><span data-i="slidesTitle">Slides</span><button class="btn" id="sl-x" data-i="exit">Exit</button></div>
      <div class="modal-b md" id="sl-body" style="flex:1;display:flex;flex-direction:column;justify-content:center"></div>
      <div class="s-bar">
        <button class="btn" id="sl-p" data-i="prev">Prev</button>
        <span id="sl-c">1 / 1</span>
        <button class="btn btn-p" id="sl-n" data-i="next">Next</button>
      </div>
    </div>
  </div>

<script>
(() => {
  'use strict';
  const LANGS = {
    en: { dir:'ltr', name:'English', vault:'Aether Vault', files:'Files', search:'Search', tags:'Tags', edit:'Editor', split:'Split', read:'Reader', mindmap:'Mindmap', kanban:'Kanban', expBtn:'Export', zen:'Zen', links:'Links', outline:'Outline', focus:'Focus', history:'History', settings:'Settings', langLabel:'Interface Language', themeLabel:'Theme', accentLabel:'Accent Color', backlinks:'Backlinks', related:'Related Notes', out:'Outgoing', noRes:'No results', snap:'Save Snapshot', graphTitle:'Knowledge Graph', mmTitle:'Interactive Mindmap', kbTitle:'Two-Way Kanban Board', dlSvg:'Download SVG', tplBtn:'Insert Template', close:'Close', slidesTitle:'Slides', exit:'Exit', prev:'Prev', next:'Next', newNote:'New Note', quickSw:'Quick Switcher', flashcards:'Flashcards', rainAudio:'Rain Audio', words:'words', chars:'chars', blWord:'backlinks', addCard:'+ Add card', rename:'Rename Note', delConfirm:'Delete this note?' },
    fa: { dir:'rtl', name:'فارسی', vault:'خزانه اتر', files:'فایل‌ها', search:'جستجو', tags:'تگ‌ها', edit:'ویرایش', split:'دوپنجره', read:'مطالعه', mindmap:'نقشه ذهنی', kanban:'کانبان', expBtn:'خروجی', zen:'تمرکز', links:'اتصالات', outline:'فهرست', focus:'پومودورو', history:'تاریخچه', settings:'تنظیمات', langLabel:'زبان برنامه', themeLabel:'تم رنگی', accentLabel:'رنگ تاکیدی', backlinks:'بکلینک‌ها', related:'یادداشت‌های مرتبط', out:'لینک‌های خروجی', noRes:'یافت نشد', snap:'ثبت اسنپ‌شات', graphTitle:'گراف دانش', mmTitle:'نقشه ذهنی تعاملی', kbTitle:'بورد کانبان دوطرفه', dlSvg:'دانلود SVG', tplBtn:'درج قالب', close:'بستن', slidesTitle:'اسلایدها', exit:'خروج', prev:'قبلی', next:'بعدی', newNote:'یادداشت جدید', quickSw:'جستجوی سریع', flashcards:'فلش‌کارت', rainAudio:'صدای باران', words:'کلمه', chars:'کاراکتر', blWord:'بکلینک', addCard:'+ افزودن کارت', rename:'تغییر نام', delConfirm:'این یادداشت حذف شود؟' },
    ar: { dir:'rtl', name:'العربية', vault:'خزنة أثير', files:'الملفات', search:'بحث', tags:'الوسوم', edit:'محرر', split:'مقسم', read:'قراءة', mindmap:'خريطة ذهنية', kanban:'كانبان', expBtn:'تصدير', zen:'تركيز', links:'الروابط', outline:'المخطط', focus:'بومودورو', history:'السجل', settings:'الإعدادات', langLabel:'لغة الواجهة', themeLabel:'السمة', accentLabel:'لون التمييز', backlinks:'الروابط الخلفية', related:'ملاحظات ذات صلة', out:'صادرة', noRes:'لا نتائج', snap:'حفظ لقطة', graphTitle:'رسم المعرفة', mmTitle:'خريطة ذهنية تفاعلية', kbTitle:'لوحة كانبان', dlSvg:'تنزيل SVG', tplBtn:'إدراج قالب', close:'إغلاق', slidesTitle:'الشرائح', exit:'خروج', prev:'السابق', next:'التالي', newNote:'ملاحظة جديدة', quickSw:'التبديل السريع', flashcards:'البطاقات', rainAudio:'صوت المطر', words:'كلمة', chars:'حرف', blWord:'روابط', addCard:'+ إضافة بطاقة', rename:'إعادة تسمية', delConfirm:'حذف هذه الملاحظة؟' },
    fr: { dir:'ltr', name:'Français', vault:'Coffre Aether', files:'Fichiers', search:'Recherche', tags:'Tags', edit:'Éditeur', split:'Divisé', read:'Lecture', mindmap:'Carte', kanban:'Kanban', expBtn:'Exporter', zen:'Zen', links:'Liens', outline:'Plan', focus:'Focus', history:'Historique', settings:'Paramètres', langLabel:'Langue', themeLabel:'Thème', accentLabel:'Couleur', backlinks:'Rétroliens', related:'Notes liées', out:'Sortants', noRes:'Aucun résultat', snap:'Instantané', graphTitle:'Graphe de connaissances', mmTitle:'Carte mentale', kbTitle:'Tableau Kanban', dlSvg:'Télécharger SVG', tplBtn:'Modèle', close:'Fermer', slidesTitle:'Diapositives', exit:'Quitter', prev:'Préc.', next:'Suiv.', newNote:'Nouvelle note', quickSw:'Navigation rapide', flashcards:'Cartes', rainAudio:'Son de pluie', words:'mots', chars:'car.', blWord:'rétroliens', addCard:'+ Ajouter', rename:'Renommer', delConfirm:'Supprimer cette note ?' },
    de: { dir:'ltr', name:'Deutsch', vault:'Aether Tresor', files:'Dateien', search:'Suche', tags:'Tags', edit:'Editor', split:'Geteilt', read:'Lesen', mindmap:'Mindmap', kanban:'Kanban', expBtn:'Export', zen:'Zen', links:'Links', outline:'Gliederung', focus:'Fokus', history:'Verlauf', settings:'Einstellungen', langLabel:'Sprache', themeLabel:'Farbthema', accentLabel:'Akzentfarbe', backlinks:'Backlinks', related:'Ähnliche Notizen', out:'Ausgehend', noRes:'Keine Treffer', snap:'Snapshot', graphTitle:'Wissensgraph', mmTitle:'Interaktive Mindmap', kbTitle:'Kanban-Board', dlSvg:'SVG laden', tplBtn:'Vorlage', close:'Schließen', slidesTitle:'Folien', exit:'Beenden', prev:'Zurück', next:'Weiter', newNote:'Neue Notiz', quickSw:'Schnellwechsel', flashcards:'Lernkarten', rainAudio:'Regenklang', words:'Wörter', chars:'Zeichen', blWord:'Backlinks', addCard:'+ Karte', rename:'Umbenennen', delConfirm:'Notiz löschen?' },
    es: { dir:'ltr', name:'Español', vault:'Bóveda Aether', files:'Archivos', search:'Buscar', tags:'Etiquetas', edit:'Editor', split:'Dividido', read:'Lectura', mindmap:'Mapa', kanban:'Kanban', expBtn:'Exportar', zen:'Zen', links:'Enlaces', outline:'Índice', focus:'Enfoque', history:'Historial', settings:'Ajustes', langLabel:'Idioma', themeLabel:'Tema', accentLabel:'Color de acento', backlinks:'Retroenlaces', related:'Notas similares', out:'Salientes', noRes:'Sin resultados', snap:'Instantánea', graphTitle:'Grafo de conocimiento', mmTitle:'Mapa mental', kbTitle:'Tablero Kanban', dlSvg:'Descargar SVG', tplBtn:'Plantilla', close:'Cerrar', slidesTitle:'Diapositivas', exit:'Salir', prev:'Ant.', next:'Sig.', newNote:'Nueva nota', quickSw:'Cambio rápido', flashcards:'Tarjetas', rainAudio:'Audio lluvia', words:'palabras', chars:'car.', blWord:'retroenlaces', addCard:'+ Añadir', rename:'Renombrar', delConfirm:'¿Eliminar esta nota?' }
  };

  const DEMO = ${data}.length ? ${data} : [{ path: 'Welcome.md', content: '# NoSidian' }];

  const S = {
    lang: localStorage.getItem('an_lang') || 'en',
    theme: localStorage.getItem('an_theme') || 'obsidian-slate',
    accent: localStorage.getItem('an_accent') || '#7c3aed',
    notes: JSON.parse(localStorage.getItem('an_notes_' + location.pathname) || 'null') || DEMO.map(n => ({ ...n, snaps:[] })),
    tabs: [], active: null, mode: 'split', lTab: 'files', rTab: 'links',
    search: '', graph: false, pomo: 1500, pomoRun: false, pomoId: null,
    audioCtx: null, audioGains: {}, syncingScroll: false
  };

  const $ = id => document.getElementById(id);
  const T = k => (LANGS[S.lang] || LANGS.en)[k] || LANGS.en[k] || k;
  const esc = s => String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const base = p => (p||'').split('/').pop().replace(/\\.(md|markdown|txt)$/i,'');
  const cur = () => S.notes.find(n => n.path === S.active) || null;
  const resolve = t => S.notes.find(n => base(n.path).toLowerCase() === t.split('|')[0].split('#')[0].trim().toLowerCase());
  const save = () => { try { localStorage.setItem('an_notes_' + location.pathname, JSON.stringify(S.notes)); } catch {} };
  const dirOf = txt => { for (const c of txt.replace(/^---[\\s\\S]*?---\\s*/,'')) { if (/[\\u0600-\\u06FF]/.test(c)) return 'rtl'; if (/[A-Za-z]/.test(c)) return 'ltr'; } return LANGS[S.lang].dir; };
  const linksIn = c => [...new Set([...c.matchAll(/\\[\\[([^\\]]+)\\]\\]/g)].map(m => m[1].split('|')[0].split('#')[0].trim()))];

  function applyLang(code) {
    S.lang = LANGS[code] ? code : 'en';
    localStorage.setItem('an_lang', S.lang);
    document.documentElement.lang = S.lang;
    document.documentElement.dir = LANGS[S.lang].dir;
    document.querySelectorAll('[data-i]').forEach(el => { el.textContent = T(el.dataset.i); });
    $('st-lang').textContent = LANGS[S.lang].name;
    renderLeft(); renderRight(); updateStats();
  }

  function applyTheme(th, accent) {
    S.theme = th || S.theme;
    if (accent) S.accent = accent;
    localStorage.setItem('an_theme', S.theme);
    localStorage.setItem('an_accent', S.accent);
    document.documentElement.setAttribute('data-theme', S.theme);
    document.documentElement.style.setProperty('--accent', S.accent);
    document.documentElement.style.setProperty('--accent-soft', S.accent + '26');
    if (window.mermaid) mermaid.initialize({ startOnLoad:false, theme: S.theme==='paper-daylight'||S.theme==='warm-parchment'?'default':'dark' });
    renderPreview();
    if (S.graph) drawGraph();
  }

  function renderMd(raw) {
    const body = raw.replace(/^---\\r?\\n[\\s\\S]*?\\r?\\n---\\r?\\n?/, '');
    const ph = [];
    const add = h => { ph.push(h); return '@@PH_' + (ph.length - 1) + '@@'; };
    let md = body.replace(/\\x60\\x60\\x60(\\w*)\\r?\\n([\\s\\S]*?)\\x60\\x60\\x60/g, (_, l, c) =>
      l.toLowerCase()==='mermaid' ? add('<div class="mermaid">'+esc(c)+'</div>') : add('<pre><code>'+esc(c)+'</code></pre>')
    );
    md = md.replace(/\\x60([^\\x60\\n]+)\\x60/g, (_, c) => add('<code>'+esc(c)+'</code>'));
    if (window.katex) {
      md = md.replace(/\\$\\$([\\s\\S]+?)\\$\\$/g, (_, x) => { try { return add(katex.renderToString(x,{displayMode:true,throwOnError:false})); } catch { return esc(x); } });
      md = md.replace(/\\$([^\\s$][^$\\n]*?)\\$/g, (_, x) => { try { return add(katex.renderToString(x,{displayMode:false,throwOnError:false})); } catch { return esc(x); } });
    }
    md = md.replace(/==([^=\\n]+)==/g, '<mark>$1</mark>');
    md = md.replace(/\\[\\[([^\\]]+)\\]\\]/g, (_, inner) => {
      const [tgt, alias] = inner.split('|');
      return '<a href="#" class="wikilink" data-t="'+esc(tgt.trim())+'">'+esc((alias||tgt).trim())+'</a>';
    });
    let html = window.marked ? marked.parse(md, { gfm:true, breaks:true }) : '<p>'+esc(md).replace(/\\n/g,'<br>')+'</p>';
    if (window.DOMPurify) html = DOMPurify.sanitize(html, { ADD_TAGS:['mark'], ADD_ATTR:['data-t','type','checked'] });
    html = html.replace(/@@PH_(\\d+)@@/g, (_, i) => ph[+i] || '');
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('blockquote').forEach(bq => {
      const p = bq.querySelector('p');
      const m = p && p.innerHTML.match(/^\\[!(\\w+)\\]\\s*([^\\n<]*)(?:<br\\s*\\/?>)?([\\s\\S]*)/i);
      if (m) {
        const c = document.createElement('div');
        c.className = 'callout';
        c.innerHTML = '<div class="callout-title">'+(m[2]||esc(m[1]))+'</div><div class="callout-body"><p dir="auto">'+(m[3]||'')+'</p></div>';
        c.querySelector('.callout-title').onclick = () => c.classList.toggle('collapsed');
        bq.replaceWith(c);
      }
    });
    let hi = 0;
    div.querySelectorAll('p,h1,h2,h3,li').forEach(el => {
      el.setAttribute('dir','auto');
      if (/^H[1-3]$/.test(el.tagName)) el.id = 'hd-' + (hi++);
    });
    let ci = 0;
    div.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.removeAttribute('disabled'); cb.dataset.ci = ci++; });
    return div.innerHTML;
  }

  function openNote(path) {
    if (!path) {
      S.active = null;
      $('note-title').textContent = '';
      $('editor').value = '';
      $('preview').innerHTML = '';
      renderTabs(); renderLeft(); renderRight(); updateStats();
      return;
    }
    if (!S.tabs.includes(path)) S.tabs.push(path);
    S.active = path;
    if (S.graph) toggleGraph(false);
    const n = cur();
    $('note-title').textContent = n ? base(n.path) : '';
    $('editor').value = n ? n.content : '';
    $('editor').dir = n ? dirOf(n.content) : 'ltr';
    renderTabs(); renderLeft(); renderPreview(); renderRight(); updateStats();
    if (S.mode === 'mindmap') renderMindmap();
    if (S.mode === 'kanban') renderKanban();
  }

  function renderTabs() {
    $('tab-bar').innerHTML = S.tabs.map(p => '<button class="tab '+(p===S.active?'active':'')+'" data-p="'+esc(p)+'">'+esc(base(p))+' <span data-x="'+esc(p)+'" style="opacity:.6;padding:0 3px">×</span></button>').join('');
    $('tab-bar').querySelectorAll('.tab').forEach(b => b.onclick = e => {
      if (e.target.dataset.x) {
        const closed = e.target.dataset.x;
        S.tabs = S.tabs.filter(x => x !== closed);
        if (S.active === closed) openNote(S.tabs[0] || null);
        else renderTabs();
      } else openNote(b.dataset.p);
    });
  }

  function renderPreview() {
    const n = cur(), pv = $('preview');
    if (!n) { pv.innerHTML = ''; return; }
    pv.innerHTML = renderMd(n.content);
    pv.querySelectorAll('.wikilink').forEach(a => a.onclick = e => {
      e.preventDefault();
      const t = resolve(a.dataset.t);
      if (t) openNote(t.path);
      else {
        const np = a.dataset.t + '.md';
        S.notes.unshift({ path:np, content:'# '+a.dataset.t+'\\n\\n', snaps:[] });
        save(); openNote(np);
      }
    });
    pv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.onchange = () => {
      let i = 0; const idx = +cb.dataset.ci;
      n.content = n.content.replace(/^([ \\t]*[-*+] \\[)([ xX])(\\])/gm, (m,a,_,b) => (i++===idx ? a+(cb.checked?'x':' ')+b : m));
      $('editor').value = n.content; save(); renderPreview();
    });
    if (window.hljs) pv.querySelectorAll('pre code').forEach(el => { try { hljs.highlightElement(el); } catch {} });
    if (window.mermaid) {
      const m = pv.querySelectorAll('.mermaid');
      if (m.length) Promise.resolve(mermaid.run({ nodes:m })).catch(() => {});
    }
  }

  function updateStats() {
    const n = cur();
    const txt = n ? n.content.trim() : '';
    const w = txt ? txt.split(/\\s+/).length : 0;
    $('st-stats').textContent = w + ' ' + T('words') + ' · ' + txt.length + ' ' + T('chars');
  }

  function renderLeft() {
    const b = $('left-body');
    if (S.lTab === 'files') {
      b.innerHTML = S.notes.map(n => '<button class="tree-item '+(n.path===S.active?'active':'')+'" data-o="'+esc(n.path)+'">📄 '+esc(base(n.path))+'</button>').join('');
      b.querySelectorAll('[data-o]').forEach(el => el.onclick = () => openNote(el.dataset.o));
    } else if (S.lTab === 'search') {
      b.innerHTML = '<input class="inp" id="q-in" value="'+esc(S.search)+'" placeholder="'+T('search')+'..." style="margin-bottom:8px"><div id="q-res"></div>';
      const draw = () => {
        const q = S.search.toLowerCase();
        const m = q ? S.notes.filter(n => n.path.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)) : [];
        $('q-res').innerHTML = m.map(n => '<button class="card" data-o="'+esc(n.path)+'">'+esc(base(n.path))+'</button>').join('') || '<p style="font-size:12px;color:var(--tx3)">'+T('noRes')+'</p>';
        $('q-res').querySelectorAll('[data-o]').forEach(el => el.onclick = () => openNote(el.dataset.o));
      };
      $('q-in').oninput = e => { S.search = e.target.value; draw(); };
      draw();
    } else {
      const tags = [...new Set(S.notes.flatMap(n => [...n.content.matchAll(/#([a-zA-Z0-9_-]+)/g)].map(m => m[1])))];
      b.innerHTML = tags.map(tg => '<button class="card" data-tg="'+esc(tg)+'">#'+esc(tg)+'</button>').join('') || '<p style="font-size:12px;color:var(--tx3)">'+T('noRes')+'</p>';
      b.querySelectorAll('[data-tg]').forEach(el => el.onclick = () => {
        S.lTab = 'search'; S.search = '#' + el.dataset.tg;
        document.querySelectorAll('[data-lt]').forEach(x=>x.classList.toggle('active',x.dataset.lt==='search'));
        renderLeft();
      });
    }
  }

  function renderRight() {
    const b = $('right-body'), n = cur();
    if (!n) { b.innerHTML = ''; $('st-links').textContent = '0 ' + T('blWord'); return; }
    if (S.rTab === 'links') {
      const name = base(n.path).toLowerCase();
      const backs = S.notes.filter(x => x.path !== n.path && linksIn(x.content).some(l => l.toLowerCase() === name));
      const out = linksIn(n.content);
      $('st-links').textContent = backs.length + ' ' + T('blWord');
      b.innerHTML = '<div style="font-size:11px;color:var(--tx3);margin-bottom:6px">'+T('backlinks')+'</div>' +
        (backs.map(x => '<button class="card" data-o="'+esc(x.path)+'">'+esc(base(x.path))+'</button>').join('') || '<p style="font-size:12px;color:var(--tx3);margin-bottom:10px">—</p>') +
        '<div style="font-size:11px;color:var(--tx3);margin:10px 0 6px">'+T('out')+'</div>' +
        (out.map(l => '<button class="card" data-l="'+esc(l)+'">[['+esc(l)+']]</button>').join('') || '<p style="font-size:12px;color:var(--tx3)">—</p>');
      b.querySelectorAll('[data-o]').forEach(el => el.onclick = () => openNote(el.dataset.o));
      b.querySelectorAll('[data-l]').forEach(el => el.onclick = () => { const t = resolve(el.dataset.l); if (t) openNote(t.path); });
    } else if (S.rTab === 'outline') {
      const hs = [...n.content.replace(/^---\\r?\\n[\\s\\S]*?\\r?\\n---\\r?\\n?/, '').matchAll(/^(#{1,3})\\s+(.+)/gm)];
      b.innerHTML = hs.map((m,i) => '<button class="tree-item" data-hd="hd-'+i+'" style="padding-inline-start:'+(m[1].length*10)+'px">'+esc(m[2])+'</button>').join('') || '—';
      b.querySelectorAll('[data-hd]').forEach(el => el.onclick = () => { const t = $(el.dataset.hd); if (t) t.scrollIntoView({ behavior:'smooth', block:'start' }); });
    } else if (S.rTab === 'focus') {
      b.innerHTML = '<div class="card" style="flex-direction:column;align-items:center;padding:14px"><div id="pm-t" style="font-size:26px;font-weight:700;font-family:var(--font-mono);color:var(--accent)">'+fmtPomo()+'</div><div style="display:flex;gap:6px;margin-top:8px"><button class="btn btn-p" id="pm-go">'+(S.pomoRun?'Pause':'Start')+'</button><button class="btn" id="pm-rs">Reset</button></div></div><label class="card"><span>'+T('rainAudio')+'</span><input type="range" id="snd-r" min="0" max="1" step="0.05" value="0"></label>';
      $('pm-go').onclick = togglePomo;
      $('pm-rs').onclick = () => { clearInterval(S.pomoId); S.pomoRun=false; S.pomo=1500; renderRight(); $('st-pomo').textContent=fmtPomo(); };
      $('snd-r').oninput = e => setRain(+e.target.value);
    } else {
      b.innerHTML = '<button class="btn btn-p" style="width:100%;margin-bottom:8px" id="mk-snap">'+T('snap')+'</button>' +
        (n.snaps||[]).slice().reverse().map((s,i,a)=>'<button class="card" data-rs="'+(a.length-1-i)+'">Snapshot #'+(a.length-i)+'</button>').join('');
      $('mk-snap').onclick = () => { n.snaps = n.snaps||[]; n.snaps.push({ time:Date.now(), content:n.content }); save(); renderRight(); };
      b.querySelectorAll('[data-rs]').forEach(el => el.onclick = () => { n.content = n.snaps[+el.dataset.rs].content; save(); openNote(n.path); });
    }
  }

  function fmtPomo() { return String(Math.floor(S.pomo/60)).padStart(2,'0')+':'+String(S.pomo%60).padStart(2,'0'); }
  function togglePomo() {
    if (S.pomoRun) { clearInterval(S.pomoId); S.pomoRun=false; }
    else { S.pomoRun=true; S.pomoId = setInterval(() => { if(--S.pomo<=0){clearInterval(S.pomoId);S.pomoRun=false;S.pomo=1500;} $('st-pomo').textContent=fmtPomo(); const el=$('pm-t'); if(el)el.textContent=fmtPomo(); }, 1000); }
    renderRight();
  }
  function setRain(v) {
    if (!S.audioCtx) S.audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    if (S.audioCtx.state==='suspended') S.audioCtx.resume();
    if (!S.audioGains.rain && v>0) {
      const buf = S.audioCtx.createBuffer(1, S.audioCtx.sampleRate*2, S.audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*(Math.random()>0.985?1.4:0.35);
      const src = S.audioCtx.createBufferSource(); src.buffer=buf; src.loop=true;
      const g = S.audioCtx.createGain(); g.gain.value=0;
      src.connect(g); g.connect(S.audioCtx.destination); src.start();
      S.audioGains.rain = g;
    }
    if (S.audioGains.rain) S.audioGains.rain.gain.value = v * 0.25;
  }

  function setMode(m) {
    S.mode = m;
    toggleGraph(false);
    document.querySelectorAll('#mode-seg button').forEach(b => b.classList.toggle('active', b.dataset.m === m));
    $('pane-ed').classList.toggle('hidden', m !== 'editor' && m !== 'split');
    $('pane-pv').classList.toggle('hidden', m !== 'preview' && m !== 'split');
    $('fmtbar').classList.toggle('hidden', m !== 'editor' && m !== 'split');
    $('v-mm').classList.toggle('open', m === 'mindmap');
    $('v-kb').classList.toggle('open', m === 'kanban');
    if (m === 'mindmap') renderMindmap();
    if (m === 'kanban') renderKanban();
  }

  function renderMindmap() {
    const n = cur(), svg = $('mm-svg');
    if (!n) { svg.innerHTML = ''; return; }
    const items = [...n.content.replace(/^---\\r?\\n[\\s\\S]*?\\r?\\n---\\r?\\n?/, '').matchAll(/^(#{1,3})\\s+(.+)/gm)].map(m => ({ lvl:m[1].length, txt:m[2] }));
    const h = Math.max(460, items.length * 56 + 100);
    const ry = h / 2 - 17;
    svg.setAttribute('viewBox', '0 0 820 ' + h);
    let out = '<rect x="30" y="'+ry+'" width="170" height="34" rx="8" fill="var(--bg4)" stroke="var(--accent)" stroke-width="2"/><text x="115" y="'+(ry+21)+'" text-anchor="middle" fill="var(--tx1)" font-size="12">'+esc(base(n.path).slice(0,22))+'</text>';
    items.forEach((it, i) => {
      const y = 40 + i * 54, x = 260 + (it.lvl - 1) * 48;
      out += '<path d="M 200 '+(ry+17)+' C 230 '+(ry+17)+', 230 '+(y+16)+', '+x+' '+(y+16)+'" fill="none" stroke="var(--accent)" stroke-opacity=".55" stroke-width="2"/><rect x="'+x+'" y="'+y+'" width="210" height="32" rx="8" fill="var(--bg3)" stroke="var(--bd)"/><text x="'+(x+105)+'" y="'+(y+20)+'" text-anchor="middle" fill="var(--tx1)" font-size="12">'+esc(it.txt.slice(0,28))+'</text>';
    });
    svg.innerHTML = out;
  }

  function renderKanban() {
    const n = cur(), board = $('kb-board');
    if (!n) { board.innerHTML = ''; return; }
    const lines = n.content.split(/\\r?\\n/);
    const firstColIdx = lines.findIndex(l => /^##\\s+/.test(l));
    const prefix = (firstColIdx > 0 ? lines.slice(0, firstColIdx).join('\\n').trimEnd() : '# ' + base(n.path));
    const cols = []; let c = null;
    lines.forEach(l => {
      const h = l.match(/^##\\s+(.+)/);
      const t = l.match(/^- \\[([ xX])\\] (.+)/);
      if (h) { c = { title:h[1], cards:[] }; cols.push(c); }
      else if (t && c) c.cards.push({ done:t[1].toLowerCase()==='x', text:t[2] });
    });
    const saveCols = () => {
      n.content = prefix + '\\n\\n' + cols.map(x => '## '+x.title+'\\n'+x.cards.map(k => '- ['+(k.done?'x':' ')+'] '+k.text).join('\\n')).join('\\n\\n') + '\\n';
      save(); $('editor').value = n.content; renderPreview(); updateStats(); renderKanban();
    };
    if (!cols.length) { board.innerHTML = '<div style="margin:auto;text-align:center"><p style="margin-bottom:10px;color:var(--tx2)">Add ## Heading & - [ ] Task or click Insert Template</p></div>'; return; }
    board.innerHTML = cols.map((col, ci) => '<div class="kb-col" data-ci="'+ci+'"><div style="font-weight:600;font-size:13px;display:flex;justify-content:space-between"><span>'+esc(col.title)+'</span><span style="color:var(--tx3)">'+col.cards.length+'</span></div>' +
      col.cards.map((cd, di) => '<div class="kb-card" draggable="true" data-ci="'+ci+'" data-di="'+di+'"><input type="checkbox" '+(cd.done?'checked':'')+' data-chk="'+ci+':'+di+'"><span>'+esc(cd.text)+'</span></div>').join('') +
      '<div style="display:flex;gap:4px;margin-top:4px"><input class="inp" style="padding:4px 7px;font-size:12px" data-add-in="'+ci+'" placeholder="'+T('addCard')+'"><button class="btn" data-add-btn="'+ci+'">+</button></div></div>').join('');
    let drag = null;
    board.querySelectorAll('.kb-card').forEach(el => el.ondragstart = () => { drag = { ci:+el.dataset.ci, di:+el.dataset.di }; });
    board.querySelectorAll('.kb-col').forEach(colEl => {
      colEl.ondragover = e => e.preventDefault();
      colEl.ondrop = () => {
        if (!drag) return;
        const [mv] = cols[drag.ci].cards.splice(drag.di, 1);
        cols[+colEl.dataset.ci].cards.push(mv);
        saveCols();
      };
    });
    board.querySelectorAll('[data-chk]').forEach(chk => chk.onchange = () => {
      const [ci, di] = chk.dataset.chk.split(':').map(Number);
      cols[ci].cards[di].done = chk.checked;
      saveCols();
    });
    board.querySelectorAll('[data-add-btn]').forEach(btn => btn.onclick = () => {
      const ci = +btn.dataset.addBtn;
      const inp = board.querySelector('[data-add-in="'+ci+'"]');
      const val = inp && inp.value.trim();
      if (!val) return;
      cols[ci].cards.push({ done:false, text:val });
      saveCols();
    });
  }

  function drawGraph() {
    const cv = $('g-canvas'), ctx = cv.getContext('2d');
    const w = cv.width = cv.parentElement.clientWidth || 720;
    const h = cv.height = (cv.parentElement.clientHeight || 480) - 40;
    const nodes = S.notes.map((n, i) => {
      const a = (i / Math.max(1, S.notes.length)) * Math.PI * 2;
      return { id:n.path, lbl:base(n.path), x:w/2 + Math.cos(a)*140, y:h/2 + Math.sin(a)*140, vx:0, vy:0 };
    });
    const edges = [];
    S.notes.forEach((n, i) => linksIn(n.content).forEach(l => {
      const j = nodes.findIndex(x => x.lbl.toLowerCase() === l.toLowerCase());
      if (j >= 0 && j !== i) edges.push([i, j]);
    }));
    for (let step = 0; step < 80; step++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const d = Math.hypot(dx, dy) || 1;
          const f = 900 / (d * d);
          nodes[i].vx += (dx/d)*f; nodes[i].vy += (dy/d)*f;
          nodes[j].vx -= (dx/d)*f; nodes[j].vy -= (dy/d)*f;
        }
      }
      edges.forEach(([i, j]) => {
        const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
        const d = Math.hypot(dx, dy) || 1, f = (d - 150) * 0.04;
        nodes[i].vx += (dx/d)*f; nodes[i].vy += (dy/d)*f;
        nodes[j].vx -= (dx/d)*f; nodes[j].vy -= (dy/d)*f;
      });
      nodes.forEach(nd => {
        nd.vx = (nd.vx + (w/2 - nd.x)*0.01) * 0.85;
        nd.vy = (nd.vy + (h/2 - nd.y)*0.01) * 0.85;
        nd.x = Math.max(48, Math.min(w - 48, nd.x + nd.vx));
        nd.y = Math.max(36, Math.min(h - 36, nd.y + nd.vy));
      });
    }
    const tx1 = getComputedStyle(document.documentElement).getPropertyValue('--tx1').trim() || '#eceef4';
    ctx.clearRect(0,0,w,h);
    edges.forEach(([i, j]) => { ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.strokeStyle='rgba(148,163,184,.35)'; ctx.lineWidth=1.4; ctx.stroke(); });
    nodes.forEach(nd => {
      ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.id === S.active ? 10 : 7.5, 0, Math.PI*2);
      ctx.fillStyle = S.accent; ctx.fill();
      ctx.fillStyle = tx1; ctx.font='12px sans-serif'; ctx.textAlign='center';
      ctx.fillText(nd.lbl, nd.x, nd.y + 22);
    });
    cv.onclick = e => {
      const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const hit = nodes.find(nd => Math.hypot(nd.x - mx, nd.y - my) < 18);
      if (hit) openNote(hit.id);
    };
  }

  function toggleGraph(force) {
    S.graph = force !== undefined ? force : !S.graph;
    $('v-graph').classList.toggle('open', S.graph);
    if (S.graph) drawGraph();
  }

  function openModal(title, html, bindFn) {
    $('modal-t').textContent = title;
    $('modal-b').innerHTML = html;
    $('modal-bg').classList.add('open');
    if (bindFn) bindFn($('modal-b'));
  }

  function openSettings() {
    openModal(T('settings'),
      '<div style="margin-bottom:14px"><label style="display:block;font-size:12px;margin-bottom:6px;font-weight:600">'+T('langLabel')+'</label>' +
      '<select class="inp" id="sel-lang">' + Object.entries(LANGS).map(([k,v]) => '<option value="'+k+'" '+(S.lang===k?'selected':'')+'>'+v.name+'</option>').join('') + '</select></div>' +
      '<div style="margin-bottom:14px"><label style="display:block;font-size:12px;margin-bottom:6px;font-weight:600">'+T('themeLabel')+'</label>' +
      '<select class="inp" id="sel-theme">' + ['obsidian-slate','midnight-carbon','nord-arctic','paper-daylight','warm-parchment'].map(t => '<option value="'+t+'" '+(S.theme===t?'selected':'')+'>'+t+'</option>').join('') + '</select></div>' +
      '<div><label style="display:block;font-size:12px;margin-bottom:6px;font-weight:600">'+T('accentLabel')+'</label>' +
      '<div style="display:flex;gap:8px">' + ['#7c3aed','#2563eb','#059669','#e11d48','#d97706'].map(c => '<button data-ac="'+c+'" style="width:26px;height:26px;border-radius:50%;background:'+c+';border:'+(S.accent===c?'2px solid var(--tx1)':'none')+'"></button>').join('') + '</div></div>',
      box => {
        box.querySelector('#sel-lang').onchange = e => { applyLang(e.target.value); openSettings(); };
        box.querySelector('#sel-theme').onchange = e => { applyTheme(e.target.value); };
        box.querySelectorAll('[data-ac]').forEach(b => b.onclick = () => { applyTheme(S.theme, b.dataset.ac); openSettings(); });
      }
    );
  }

  function openFlashcards() {
    const cards = S.notes.flatMap(n => {
      const cleaned = n.content.replace(/\\x60\\x60\\x60[\\s\\S]*?\\x60\\x60\\x60/g,'').replace(/\\x60[^\\x60\\n]+\\x60/g,'');
      return [...cleaned.matchAll(/^(.+?)\\s+::\\s+(.+)$/gm)].map(m => ({ q:m[1].trim(), a:m[2].trim() }));
    });
    let i = 0, flipped = false;
    const draw = () => openModal(T('flashcards'), cards.length ? (i >= cards.length ? '<p>All cards reviewed!</p>' : '<div class="fc-box" id="fc-c">'+(flipped?esc(cards[i].a):esc(cards[i].q))+'</div><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;color:var(--tx3)">'+(i+1)+' / '+cards.length+'</span><button class="btn btn-p" id="fc-n">Next Card</button></div>') : '<p>Add Question :: Answer lines to study.</p>', box => {
      const c = box.querySelector('#fc-c'); if (c) c.onclick = () => { flipped = !flipped; draw(); };
      const nx = box.querySelector('#fc-n'); if (nx) nx.onclick = () => { flipped = false; i++; draw(); };
    });
    draw();
  }

  function openSlides() {
    const n = cur(); if (!n) return;
    const body = n.content.replace(/^---\\r?\\n[\\s\\S]*?\\r?\\n---\\r?\\n?/, '');
    const sl = body.split(/\\r?\\n---\\r?\\n/).filter(Boolean);
    let i = 0;
    const draw = () => { $('sl-body').innerHTML = renderMd(sl[i] || ''); $('sl-c').textContent = (i+1)+' / '+Math.max(1, sl.length); };
    $('sl-p').onclick = () => { if (i>0) { i--; draw(); } };
    $('sl-n').onclick = () => { if (i<sl.length-1) { i++; draw(); } };
    $('sl-x').onclick = () => $('slides-bg').classList.remove('open');
    $('slides-bg').classList.add('open');
    draw();
  }

  // Event wiring
  $('editor').oninput = e => { const n = cur(); if (!n) return; n.content = e.target.value; e.target.dir = dirOf(n.content); save(); renderPreview(); updateStats(); };
  $('pane-ed').onscroll = () => {
    if (S.syncingScroll || S.mode !== 'split') return;
    S.syncingScroll = true;
    const ed = $('pane-ed'), pv = $('pane-pv');
    const ratio = ed.scrollTop / Math.max(1, ed.scrollHeight - ed.clientHeight);
    pv.scrollTop = ratio * Math.max(0, pv.scrollHeight - pv.clientHeight);
    requestAnimationFrame(() => { S.syncingScroll = false; });
  };
  $('rb-left').onclick = () => { $('s-left').classList.toggle('hidden'); $('rb-left').classList.toggle('active'); };
  $('rb-right').onclick = () => { $('s-right').classList.toggle('hidden'); $('rb-right').classList.toggle('active'); };
  $('rb-graph').onclick = () => toggleGraph();
  $('close-graph').onclick = () => toggleGraph(false);
  $('rb-mm').onclick = () => setMode('mindmap');
  $('rb-kb').onclick = () => setMode('kanban');
  $('rb-fc').onclick = openFlashcards;
  $('rb-slides').onclick = openSlides;
  $('rb-set').onclick = openSettings;
  $('st-lang').onclick = openSettings;
  $('rb-cmd').onclick = () => openModal(T('quickSw'), S.notes.map(n => '<button class="card" data-o="'+esc(n.path)+'">'+esc(base(n.path))+'</button>').join(''), box => box.querySelectorAll('[data-o]').forEach(el => el.onclick = () => { $('modal-bg').classList.remove('open'); openNote(el.dataset.o); }));
  $('modal-x').onclick = () => $('modal-bg').classList.remove('open');
  $('modal-bg').onclick = e => { if (e.target === $('modal-bg')) $('modal-bg').classList.remove('open'); };
  document.querySelectorAll('#mode-seg button').forEach(b => b.onclick = () => setMode(b.dataset.m));
  document.querySelectorAll('[data-lt]').forEach(b => b.onclick = () => { S.lTab = b.dataset.lt; document.querySelectorAll('[data-lt]').forEach(x=>x.classList.toggle('active',x===b)); renderLeft(); });
  document.querySelectorAll('[data-rt]').forEach(b => b.onclick = () => { S.rTab = b.dataset.rt; document.querySelectorAll('[data-rt]').forEach(x=>x.classList.toggle('active',x===b)); renderRight(); });
  $('btn-zen').onclick = () => document.body.classList.toggle('zen');
  $('btn-new').onclick = () => openModal(T('newNote'), '<input class="inp" id="nn-in" placeholder="Note title"><button class="btn btn-p" style="margin-top:10px" id="nn-go">Create</button>', box => {
    box.querySelector('#nn-go').onclick = () => { const v = box.querySelector('#nn-in').value.trim(); if (!v) return; const p = v.replace(/\\.md$/i,'')+'.md'; S.notes.unshift({path:p,content:'# '+v+'\\n\\n',snaps:[]}); save(); $('modal-bg').classList.remove('open'); openNote(p); };
  });
  $('btn-ren').onclick = () => {
    const n = cur(); if (!n) return;
    openModal(T('rename'), '<input class="inp" id="rn-in" value="'+esc(base(n.path))+'"><button class="btn btn-p" style="margin-top:10px" id="rn-go">Save</button>', box => {
      box.querySelector('#rn-go').onclick = () => {
        const v = box.querySelector('#rn-in').value.trim(); if (!v) return;
        const oldPath = n.path, np = v.replace(/\\.md$/i,'') + '.md';
        n.path = np;
        S.tabs = S.tabs.map(t => t === oldPath ? np : t);
        S.active = np; save(); $('modal-bg').classList.remove('open'); openNote(np);
      };
    });
  };
  $('btn-del').onclick = () => {
    const n = cur(); if (!n) return;
    openModal(T('delConfirm'), '<p style="margin-bottom:12px">'+esc(n.path)+'</p><button class="btn btn-p" id="dl-yes">Delete</button>', box => {
      box.querySelector('#dl-yes').onclick = () => {
        const dp = n.path;
        S.notes = S.notes.filter(x => x.path !== dp);
        S.tabs = S.tabs.filter(x => x !== dp);
        save(); $('modal-bg').classList.remove('open');
        openNote(S.tabs[0] || S.notes[0]?.path || null);
      };
    });
  };
  $('btn-open').onclick = () => $('file-in').click();
  async function loadFiles(fileList) {
    let first = null;
    for (const f of fileList) {
      if (!/\\.(md|markdown|txt)$/i.test(f.name)) continue;
      const txt = await f.text();
      if (!first) first = f.name;
      const ex = S.notes.find(n => n.path === f.name);
      if (ex) ex.content = txt; else S.notes.unshift({ path:f.name, content:txt, snaps:[] });
    }
    if (first) { save(); openNote(first); }
  }
  $('file-in').onchange = e => loadFiles(e.target.files);
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files); });
  $('btn-dir').onclick = async () => {
    if (!window.showDirectoryPicker) return $('file-in').click();
    try {
      const dir = await window.showDirectoryPicker();
      const loaded = [];
      for await (const e of dir.values()) if (e.kind==='file' && /\\.md$/i.test(e.name)) loaded.push({ path:e.name, content:await (await e.getFile()).text(), snaps:[] });
      if (loaded.length) { S.notes = loaded; S.tabs = []; save(); openNote(loaded[0].path); }
    } catch {}
  };
  $('btn-exp').onclick = () => { const n = cur(); if (!n) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([n.content], {type:'text/markdown'})); a.download = base(n.path)+'.md'; a.click(); };
  $('kb-tpl').onclick = () => { const n = cur(); if (!n) return; n.content += '\\n## To Do\\n- [ ] Task\\n\\n## Done\\n- [x] Done\\n'; save(); openNote(n.path); };
  $('dl-svg').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('mm-svg').outerHTML], {type:'image/svg+xml'})); a.download = 'mindmap.svg'; a.click(); };
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
    const ed = $('editor'), s = ed.selectionStart, e = ed.selectionEnd, sel = ed.value.slice(s,e) || 'text';
    const map = { h1:'# '+sel, h2:'## '+sel, bold:'**'+sel+'**', italic:'*'+sel+'*', hl:'=='+sel+'==', wiki:'[['+sel+']]', task:'- [ ] '+sel, callout:'\\n> [!tip] Note\\n> '+sel+'\\n', fc:'\\n'+sel+' :: Answer\\n' };
    ed.setRangeText(map[b.dataset.f]||sel, s, e, 'end'); ed.dispatchEvent(new Event('input'));
  });
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='o') { e.preventDefault(); $('rb-cmd').click(); }
    if (e.key === 'Escape') { $('modal-bg').classList.remove('open'); $('slides-bg').classList.remove('open'); }
  });

  applyTheme(S.theme, S.accent);
  applyLang(S.lang);
  openNote(S.notes[0]?.path || null);
})();
<\/script>
</body>
</html>`;
}
