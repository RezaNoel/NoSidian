//! In-memory vault index: titles, headings, tags, wikilinks and text of every
//! Markdown note. Built once per vault and updated per file on every change,
//! it answers full-text search (with `#tag`, `tag:`, `title:`, `path:`,
//! quoted phrases and `-exclusions`), tag counts, backlinks, outgoing links,
//! unlinked mentions and per-note explorer metadata.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::CoreResult;
use crate::notes::{self, EntryKind, NoteMeta};

const SNIPPET_CHARS: usize = 160;
const MAX_LINE_MATCHES: usize = 3;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Heading {
    pub level: u8,
    pub text: String,
    /// 0-based line in the file.
    pub line: usize,
}

#[derive(Debug, Clone)]
struct Entry {
    meta: NoteMeta,
    title: String,
    title_lower: String,
    path_lower: String,
    /// Body lines (front matter removed), with their file line numbers.
    lines: Vec<(usize, String)>,
    body_lower: String,
    /// Body with code and wikilinks blanked, lowercased: for unlinked mentions.
    prose_lower: String,
    tags: BTreeSet<String>,
    /// Raw wikilink targets with the line they appear on.
    links: Vec<(String, usize)>,
    headings: Vec<Heading>,
    words: usize,
}

#[derive(Debug, Default)]
pub struct VaultIndex {
    notes: BTreeMap<String, Entry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum SearchSort {
    #[default]
    Relevance,
    Title,
    Modified,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineMatch {
    pub line: usize,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub title: String,
    pub score: u32,
    pub matches: Vec<LineMatch>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mention {
    pub path: String,
    pub line: usize,
    pub snippet: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outgoing {
    pub target: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLinks {
    pub backlinks: Vec<Mention>,
    pub outgoing: Vec<Outgoing>,
    pub unlinked: Vec<Mention>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub count: usize,
    pub paths: Vec<String>,
}

/// Per-note numbers shown in the explorer and status bar.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub path: String,
    pub words: usize,
    pub backlinks: usize,
    pub tags: Vec<String>,
    pub headings: Vec<Heading>,
}

// ---------- Markdown helpers ----------

/// Split YAML front matter: returns (front matter, number of lines it spans).
fn front_matter(src: &str) -> (&str, usize) {
    let rest = match src.strip_prefix("---\n").or_else(|| src.strip_prefix("---\r\n")) {
        Some(r) => r,
        None => return ("", 0),
    };
    let mut offset = 0;
    for (i, line) in rest.split_inclusive('\n').enumerate() {
        if line.trim_end() == "---" {
            return (&rest[..offset], i + 2);
        }
        offset += line.len();
    }
    ("", 0)
}

/// Blank out inline code spans in a line (keeps length in chars).
fn strip_inline_code(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut in_code = false;
    for c in line.chars() {
        if c == '`' {
            in_code = !in_code;
            out.push(' ');
        } else {
            out.push(if in_code { ' ' } else { c });
        }
    }
    out
}

/// Wikilink targets in a (code-free) line: `[[T]]`, `[[T|alias]]`, `[[T#h]]`.
fn line_links(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = line;
    while let Some(start) = rest.find("[[") {
        let after = &rest[start + 2..];
        let Some(end) = after.find("]]") else { break };
        let inner = &after[..end];
        let target = inner.split(['|', '#']).next().unwrap_or("").trim();
        if !target.is_empty() && !target.contains('[') {
            out.push(target.to_string());
        }
        rest = &after[end + 2..];
    }
    out
}

fn is_tag_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '-' | '/')
}

/// `#tags` in a (code-free) line. A tag must follow whitespace or line start
/// and contain at least one non-digit, so `#1` and headings don't count.
fn line_tags(line: &str, out: &mut BTreeSet<String>) {
    let chars: Vec<char> = line.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '#' && (i == 0 || chars[i - 1].is_whitespace()) {
            let mut j = i + 1;
            while j < chars.len() && is_tag_char(chars[j]) {
                j += 1;
            }
            let tag: String = chars[i + 1..j].iter().collect();
            let tag = tag.trim_end_matches(['/', '-']).to_string();
            if !tag.is_empty() && tag.chars().any(|c| !c.is_ascii_digit()) {
                out.insert(tag);
            }
            i = j;
        } else {
            i += 1;
        }
    }
}

/// Tags from front matter: `tags: [a, b]`, `tags: a, b` or a YAML list.
fn front_matter_tags(fm: &str, out: &mut BTreeSet<String>) {
    let mut in_list = false;
    for line in fm.lines() {
        let trimmed = line.trim();
        if in_list {
            if let Some(item) = trimmed.strip_prefix("- ") {
                let t = item.trim().trim_matches(['"', '\'']).trim_start_matches('#');
                if !t.is_empty() {
                    out.insert(t.to_string());
                }
                continue;
            }
            in_list = false;
        }
        let Some(value) = trimmed.strip_prefix("tags:").or_else(|| trimmed.strip_prefix("tag:")) else { continue };
        let value = value.trim();
        if value.is_empty() {
            in_list = true;
            continue;
        }
        for t in value.trim_matches(['[', ']']).split(',') {
            let t = t.trim().trim_matches(['"', '\'']).trim_start_matches('#');
            if !t.is_empty() {
                out.insert(t.to_string());
            }
        }
    }
}

fn heading_of(line: &str) -> Option<(u8, String)> {
    let hashes = line.chars().take_while(|&c| c == '#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let rest = &line[hashes..];
    if !rest.starts_with(' ') {
        return None;
    }
    let text = rest.trim().trim_end_matches('#').trim();
    (!text.is_empty()).then(|| (hashes as u8, text.to_string()))
}

fn title_of(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.strip_suffix(".md").or_else(|| name.strip_suffix(".markdown")).unwrap_or(name).to_string()
}

fn snippet(line: &str) -> String {
    let t = line.trim();
    if t.chars().count() <= SNIPPET_CHARS {
        t.to_string()
    } else {
        let mut s: String = t.chars().take(SNIPPET_CHARS).collect();
        s.push('…');
        s
    }
}

fn analyze(meta: NoteMeta, src: &str) -> Entry {
    let title = title_of(&meta.path);
    let (fm, fm_lines) = front_matter(src);
    let mut tags = BTreeSet::new();
    front_matter_tags(fm, &mut tags);
    let mut lines = Vec::new();
    let mut links = Vec::new();
    let mut headings = Vec::new();
    let mut prose = String::new();
    let mut words = 0;
    let mut fence: Option<&str> = None;
    for (i, raw) in src.lines().enumerate().skip(fm_lines) {
        lines.push((i, raw.to_string()));
        let trimmed = raw.trim_start();
        if let Some(f) = fence {
            if trimmed.starts_with(f) {
                fence = None;
            }
            continue;
        }
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            fence = Some(&trimmed[..3]);
            continue;
        }
        let code_free = strip_inline_code(raw);
        for target in line_links(&code_free) {
            links.push((target, i));
        }
        line_tags(&code_free, &mut tags);
        if let Some((level, text)) = heading_of(raw) {
            headings.push(Heading { level, text, line: i });
        }
        words += code_free.split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).count();
        // Drop link brackets' contents so linked titles don't count as unlinked mentions.
        let mut plain = code_free.clone();
        while let (Some(s), Some(e)) = (plain.find("[["), plain.find("]]")) {
            if e < s {
                break;
            }
            plain.replace_range(s..e + 2, " ");
        }
        prose.push_str(&fold(&plain));
        prose.push('\n');
    }
    let body_lower = lines.iter().map(|(_, l)| fold(l)).collect::<Vec<_>>().join("\n");
    Entry {
        title_lower: fold(&title),
        path_lower: fold(&meta.path),
        title,
        meta,
        lines,
        body_lower,
        prose_lower: prose,
        tags,
        links,
        headings,
        words,
    }
}

// ---------- Text folding ----------

/// Lowercase and fold text so searches match however it was typed: Arabic
/// and Persian letter forms (ي/ی, ك/ک, ة/ه, أإآ/ا), no diacritics, tatweel
/// or zero-width joiners, and common Latin accents.
pub fn fold(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\u{200c}' | '\u{200d}' | '\u{200e}' | '\u{200f}' | '\u{0640}' => {}
            '\u{064b}'..='\u{065f}' | '\u{0670}' => {}
            'ي' | 'ى' | 'ئ' => out.push('ی'),
            'ك' => out.push('ک'),
            'ة' => out.push('ه'),
            'أ' | 'إ' | 'آ' | 'ٱ' => out.push('ا'),
            'ؤ' => out.push('و'),
            '٠'..='٩' => out.push(char::from(b'0' + (c as u32 - '٠' as u32) as u8)),
            '۰'..='۹' => out.push(char::from(b'0' + (c as u32 - '۰' as u32) as u8)),
            'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å' => out.push('a'),
            'è' | 'é' | 'ê' | 'ë' | 'È' | 'É' | 'Ê' | 'Ë' => out.push('e'),
            'ì' | 'í' | 'î' | 'ï' | 'Ì' | 'Í' | 'Î' | 'Ï' => out.push('i'),
            'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'Ò' | 'Ó' | 'Ô' | 'Õ' | 'Ö' => out.push('o'),
            'ù' | 'ú' | 'û' | 'ü' | 'Ù' | 'Ú' | 'Û' | 'Ü' => out.push('u'),
            'ç' | 'Ç' => out.push('c'),
            'ñ' | 'Ñ' => out.push('n'),
            _ => out.extend(c.to_lowercase()),
        }
    }
    out
}

/// Edit distance, stopping early once it passes `max`.
fn within_edits(a: &str, b: &str, max: usize) -> bool {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.len().abs_diff(b.len()) > max {
        return false;
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut cur = vec![i; b.len() + 1];
        let mut best = cur[0];
        for j in 1..=b.len() {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
            best = best.min(cur[j]);
        }
        if best > max {
            return false;
        }
        prev = cur;
    }
    prev[b.len()] <= max
}

/// Typos allowed for a search word of this length.
fn typo_budget(term: &str) -> usize {
    match term.chars().count() {
        0..=3 => 0,
        4..=7 => 1,
        _ => 2,
    }
}

// ---------- Query parsing ----------

#[derive(Debug, Default, PartialEq)]
struct Query {
    terms: Vec<String>,
    excluded: Vec<String>,
    tags: Vec<String>,
    title: Vec<String>,
    path: Vec<String>,
}

fn parse_query(q: &str) -> Query {
    let mut out = Query::default();
    let mut tokens = Vec::new();
    let mut chars = q.chars().peekable();
    while let Some(&c) = chars.peek() {
        if c.is_whitespace() {
            chars.next();
            continue;
        }
        let mut tok = String::new();
        // A token may start with an operator prefix, then a quoted phrase.
        while let Some(&c) = chars.peek() {
            if c == '"' {
                chars.next();
                for c in chars.by_ref() {
                    if c == '"' {
                        break;
                    }
                    tok.push(c);
                }
                break;
            }
            if c.is_whitespace() {
                break;
            }
            tok.push(c);
            chars.next();
        }
        if !tok.is_empty() {
            tokens.push(fold(&tok));
        }
    }
    for tok in tokens {
        if let Some(t) = tok.strip_prefix("tag:").or_else(|| tok.strip_prefix('#')) {
            if !t.is_empty() {
                out.tags.push(t.trim_start_matches('#').to_string());
            }
        } else if let Some(t) = tok.strip_prefix("title:") {
            if !t.is_empty() {
                out.title.push(t.to_string());
            }
        } else if let Some(t) = tok.strip_prefix("path:") {
            if !t.is_empty() {
                out.path.push(t.to_string());
            }
        } else if let Some(t) = tok.strip_prefix('-') {
            if !t.is_empty() {
                out.excluded.push(t.to_string());
            }
        } else {
            out.terms.push(tok);
        }
    }
    out
}

impl VaultIndex {
    /// Index every Markdown note in the vault.
    pub fn build(root: &Path) -> CoreResult<Self> {
        let tree = notes::scan(root)?;
        let mut idx = VaultIndex::default();
        for meta in tree.notes {
            if meta.kind == EntryKind::Markdown {
                let src = notes::read_text(root, &meta.path).unwrap_or_default();
                idx.notes.insert(meta.path.clone(), analyze(meta, &src));
            }
        }
        Ok(idx)
    }

    /// Index from in-memory sources (tests and the sample vault).
    pub fn from_sources<'a>(items: impl IntoIterator<Item = (NoteMeta, &'a str)>) -> Self {
        let mut idx = VaultIndex::default();
        for (meta, src) in items {
            idx.notes.insert(meta.path.clone(), analyze(meta, src));
        }
        idx
    }

    pub fn len(&self) -> usize {
        self.notes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.notes.is_empty()
    }

    /// Re-read one note (or every note under a folder) after it changed on
    /// disk. Paths that no longer exist are dropped.
    pub fn refresh_path(&mut self, root: &Path, rel: &str) {
        self.remove(rel);
        if let Some(meta) = notes::meta_of(root, rel) {
            if meta.kind == EntryKind::Markdown {
                let src = notes::read_text(root, rel).unwrap_or_default();
                self.notes.insert(rel.to_string(), analyze(meta, &src));
            }
            return;
        }
        // A folder: index everything inside it.
        if let Ok(tree) = notes::scan(root) {
            let prefix = format!("{rel}/");
            for meta in tree.notes.into_iter().filter(|n| n.path.starts_with(&prefix) && n.kind == EntryKind::Markdown) {
                let src = notes::read_text(root, &meta.path).unwrap_or_default();
                self.notes.insert(meta.path.clone(), analyze(meta, &src));
            }
        }
    }

    /// Update for a known note body (avoids a rescan when the UI just saved it).
    pub fn set_note(&mut self, meta: NoteMeta, src: &str) {
        self.notes.insert(meta.path.clone(), analyze(meta, src));
    }

    /// Drop a note or a whole folder.
    pub fn remove(&mut self, rel: &str) {
        let prefix = format!("{rel}/");
        self.notes.retain(|p, _| p != rel && !p.starts_with(&prefix));
    }

    /// Resolve a wikilink target: exact path (with or without `.md`), then by
    /// title, preferring the shortest path like Obsidian does.
    pub fn resolve(&self, target: &str) -> Option<&str> {
        let t = fold(target.trim());
        let t = t.strip_suffix(".md").unwrap_or(&t);
        if let Some((p, _)) = self.notes.iter().find(|(_, e)| e.path_lower.strip_suffix(".md").unwrap_or(&e.path_lower) == t) {
            return Some(p);
        }
        let name = t.rsplit('/').next().unwrap_or(t);
        self.notes
            .iter()
            .filter(|(_, e)| e.title_lower == name)
            .min_by_key(|(p, _)| p.len())
            .map(|(p, _)| p.as_str())
    }

    pub fn search(&self, query: &str, sort: SearchSort, limit: usize) -> Vec<SearchHit> {
        let q = parse_query(query);
        if q == Query::default() {
            return Vec::new();
        }
        let mut hits: Vec<(SearchHit, u64)> = Vec::new();
        for (path, e) in &self.notes {
            if !q.tags.iter().all(|t| e.tags.iter().any(|x| fold(x) == *t || fold(x).starts_with(&format!("{t}/")))) {
                continue;
            }
            if !q.title.iter().all(|t| e.title_lower.contains(t.as_str())) {
                continue;
            }
            if !q.path.iter().all(|t| e.path_lower.contains(t.as_str())) {
                continue;
            }
            if q.excluded.iter().any(|t| e.title_lower.contains(t.as_str()) || e.body_lower.contains(t.as_str())) {
                continue;
            }
            let mut score = 1u32;
            let mut ok = true;
            for term in &q.terms {
                let in_title = e.title_lower.contains(term.as_str());
                let count = e.body_lower.matches(term.as_str()).count();
                if !in_title && count == 0 {
                    ok = false;
                    break;
                }
                if in_title {
                    score += 20 + if e.title_lower == *term { 30 } else { 0 };
                }
                if e.headings.iter().any(|h| fold(&h.text).contains(term.as_str())) {
                    score += 6;
                }
                score += count.min(10) as u32;
            }
            if !ok {
                continue;
            }
            let mut matches = Vec::new();
            if !q.terms.is_empty() {
                for (line, text) in &e.lines {
                    let lower = fold(text);
                    if q.terms.iter().any(|t| lower.contains(t.as_str())) {
                        matches.push(LineMatch { line: *line, text: snippet(text) });
                        if matches.len() >= MAX_LINE_MATCHES {
                            break;
                        }
                    }
                }
            }
            hits.push((SearchHit { path: path.clone(), title: e.title.clone(), score, matches }, e.meta.modified));
        }
        // Nothing matched exactly: allow small typos in each word (title and body words).
        if hits.is_empty() && !q.terms.is_empty() && q.terms.iter().any(|t| typo_budget(t) > 0) {
            for (path, e) in &self.notes {
                if !q.tags.iter().all(|t| e.tags.iter().any(|x| fold(x) == *t)) || !q.path.iter().all(|t| e.path_lower.contains(t.as_str())) {
                    continue;
                }
                let words: BTreeSet<&str> = e.title_lower.split(|c: char| !c.is_alphanumeric()).chain(e.body_lower.split(|c: char| !c.is_alphanumeric())).filter(|w| !w.is_empty()).collect();
                let mut found: Vec<&str> = Vec::new();
                let all = q.terms.iter().all(|term| {
                    let budget = typo_budget(term);
                    match words.iter().find(|w| w.contains(term.as_str()) || (budget > 0 && within_edits(w, term, budget))) {
                        Some(w) => { found.push(w); true }
                        None => false,
                    }
                });
                if !all {
                    continue;
                }
                let mut matches = Vec::new();
                for (line, text) in &e.lines {
                    let lower = fold(text);
                    if found.iter().any(|w| lower.contains(w)) {
                        matches.push(LineMatch { line: *line, text: snippet(text) });
                        if matches.len() >= MAX_LINE_MATCHES {
                            break;
                        }
                    }
                }
                let score = 1 + found.iter().filter(|w| e.title_lower.contains(**w)).count() as u32 * 10;
                hits.push((SearchHit { path: path.clone(), title: e.title.clone(), score, matches }, e.meta.modified));
            }
        }
        match sort {
            SearchSort::Relevance => hits.sort_by(|a, b| b.0.score.cmp(&a.0.score).then_with(|| a.0.title.cmp(&b.0.title))),
            SearchSort::Title => hits.sort_by_key(|a| a.0.title.to_lowercase()),
            SearchSort::Modified => hits.sort_by_key(|b| std::cmp::Reverse(b.1)),
        }
        hits.into_iter().take(limit).map(|(h, _)| h).collect()
    }

    pub fn tags(&self) -> Vec<TagCount> {
        let mut map: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for (path, e) in &self.notes {
            for t in &e.tags {
                map.entry(t.clone()).or_default().push(path.clone());
            }
        }
        let mut out: Vec<TagCount> = map.into_iter().map(|(tag, paths)| TagCount { tag, count: paths.len(), paths }).collect();
        out.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag)));
        out
    }

    fn backlinks_of(&self, path: &str) -> Vec<Mention> {
        let mut out = Vec::new();
        for (p, e) in &self.notes {
            if p == path {
                continue;
            }
            if let Some((_, line)) = e.links.iter().find(|(t, _)| self.resolve(t) == Some(path)) {
                let text = e.lines.iter().find(|(l, _)| l == line).map(|(_, t)| t.as_str()).unwrap_or("");
                out.push(Mention { path: p.clone(), line: *line, snippet: snippet(text) });
            }
        }
        out
    }

    pub fn links(&self, path: &str) -> NoteLinks {
        let backlinks = self.backlinks_of(path);
        let mut seen = BTreeSet::new();
        let outgoing = self
            .notes
            .get(path)
            .map(|e| {
                e.links
                    .iter()
                    .filter(|(t, _)| seen.insert(t.clone()))
                    .map(|(t, _)| Outgoing { target: t.clone(), path: self.resolve(t).map(str::to_string) })
                    .collect()
            })
            .unwrap_or_default();
        let mut unlinked = Vec::new();
        if let Some(me) = self.notes.get(path) {
            let needle = &me.title_lower;
            if needle.chars().count() >= 3 {
                let linked: BTreeSet<&str> = backlinks.iter().map(|m| m.path.as_str()).collect();
                for (p, e) in &self.notes {
                    if p == path || linked.contains(p.as_str()) || !e.prose_lower.contains(needle.as_str()) {
                        continue;
                    }
                    if let Some((line, text)) = e.lines.iter().find(|(_, t)| fold(&strip_inline_code(t)).contains(needle.as_str()) && !fold(t).contains(&format!("[[{needle}"))) {
                        unlinked.push(Mention { path: p.clone(), line: *line, snippet: snippet(text) });
                    }
                }
            }
        }
        NoteLinks { backlinks, outgoing, unlinked }
    }

    /// Words, backlink counts, tags and headings for every note.
    pub fn summaries(&self) -> Vec<NoteSummary> {
        let mut back: BTreeMap<&str, BTreeSet<&str>> = BTreeMap::new();
        for (p, e) in &self.notes {
            for (t, _) in &e.links {
                if let Some(target) = self.resolve(t) {
                    if target != p {
                        back.entry(target).or_default().insert(p.as_str());
                    }
                }
            }
        }
        self.notes
            .iter()
            .map(|(p, e)| NoteSummary {
                path: p.clone(),
                words: e.words,
                backlinks: back.get(p.as_str()).map_or(0, |s| s.len()),
                tags: e.tags.iter().cloned().collect(),
                headings: e.headings.clone(),
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fold_matches_persian_and_arabic_forms() {
        assert_eq!(fold("كتاب‌هاي من"), fold("کتابهای من"));
        assert_eq!(fold("Café ۱۲"), "cafe 12");
        assert!(within_edits("markdown", "markdwon", 2));
        assert!(!within_edits("note", "tone", 1));
    }

    fn meta(path: &str, modified: u64) -> NoteMeta {
        NoteMeta { path: path.into(), kind: EntryKind::Markdown, size: 0, modified, created: modified }
    }

    fn sample() -> VaultIndex {
        VaultIndex::from_sources([
            (meta("Welcome.md", 3), "---\ntags: [guide, start]\n---\n# Welcome\nSee [[Ideas|my ideas]] and [[Missing]].\n`[[Code]]` #inline-tag\n"),
            (meta("Notes/Ideas.md", 5), "# Ideas\nBack to [[Welcome]]. Rust ideas here.\n```\n#not-a-tag [[NotLink]]\n```\n## Rust\nMore rust.\n"),
            (meta("Journal.md", 1), "---\ntags:\n  - daily\n  - guide\n---\nThe welcome page is nice. #1 is not a tag. #project/alpha\n"),
        ])
    }

    #[test]
    fn parses_tags_links_and_headings() {
        let idx = sample();
        let tags: Vec<_> = idx.tags().into_iter().map(|t| (t.tag, t.count)).collect();
        assert_eq!(tags[0], ("guide".into(), 2));
        assert!(tags.iter().any(|(t, _)| t == "inline-tag"));
        assert!(tags.iter().any(|(t, _)| t == "project/alpha"));
        assert!(!tags.iter().any(|(t, _)| t == "not-a-tag" || t == "1"));
        let s = idx.summaries();
        let ideas = s.iter().find(|n| n.path == "Notes/Ideas.md").unwrap();
        assert_eq!(ideas.headings.iter().map(|h| (h.level, h.text.as_str(), h.line)).collect::<Vec<_>>(), vec![(1, "Ideas", 0), (2, "Rust", 5)]);
        assert_eq!(ideas.backlinks, 1);
    }

    #[test]
    fn links_resolve_by_title_and_skip_code() {
        let idx = sample();
        let l = idx.links("Welcome.md");
        assert_eq!(l.outgoing, vec![
            Outgoing { target: "Ideas".into(), path: Some("Notes/Ideas.md".into()) },
            Outgoing { target: "Missing".into(), path: None },
        ]);
        assert_eq!(l.backlinks, vec![Mention { path: "Notes/Ideas.md".into(), line: 1, snippet: "Back to [[Welcome]]. Rust ideas here.".into() }]);
        assert_eq!(l.unlinked.iter().map(|m| m.path.as_str()).collect::<Vec<_>>(), vec!["Journal.md"]);
    }

    #[test]
    fn search_operators_and_sorting() {
        let idx = sample();
        let paths = |q: &str, s| idx.search(q, s, 10).into_iter().map(|h| h.path).collect::<Vec<_>>();
        assert_eq!(paths("rust", SearchSort::Relevance), vec!["Notes/Ideas.md"]);
        assert_eq!(paths("#guide", SearchSort::Title), vec!["Journal.md", "Welcome.md"]);
        assert_eq!(paths("tag:project", SearchSort::Relevance), vec!["Journal.md"]);
        assert_eq!(paths("welcome -nice", SearchSort::Relevance), vec!["Welcome.md", "Notes/Ideas.md"]);
        assert_eq!(paths("title:idea", SearchSort::Relevance), vec!["Notes/Ideas.md"]);
        assert_eq!(paths("path:notes/", SearchSort::Relevance), vec!["Notes/Ideas.md"]);
        assert_eq!(paths("\"welcome page\"", SearchSort::Relevance), vec!["Journal.md"]);
        assert_eq!(paths("welcome", SearchSort::Modified), vec!["Notes/Ideas.md", "Welcome.md", "Journal.md"]);
        let hit = &idx.search("rust", SearchSort::Relevance, 10)[0];
        assert_eq!(hit.matches[0], LineMatch { line: 1, text: "Back to [[Welcome]]. Rust ideas here.".into() });
        assert!(idx.search("   ", SearchSort::Relevance, 10).is_empty());
    }

    #[test]
    fn update_and_remove() {
        let mut idx = sample();
        idx.set_note(meta("Notes/New.md", 9), "Links [[Welcome]]");
        assert_eq!(idx.links("Welcome.md").backlinks.len(), 2);
        idx.remove("Notes");
        assert_eq!(idx.len(), 2);
        assert_eq!(idx.links("Welcome.md").backlinks.len(), 0);
    }

    #[test]
    fn builds_from_disk() {
        let dir = tempfile::tempdir().unwrap();
        notes::seed_sample(dir.path()).unwrap();
        let idx = VaultIndex::build(dir.path()).unwrap();
        assert_eq!(idx.len(), notes::SAMPLE_NOTES.len());
        assert!(!idx.links("Welcome to NoSidian.md").backlinks.is_empty());
    }
}
