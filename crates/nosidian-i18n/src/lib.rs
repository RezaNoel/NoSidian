//! Locale catalogue checks for NoSidian.
//!
//! The `.ftl` files in `/locales` are the single source of truth for every UI
//! string. `en.ftl` defines the keys; this crate verifies that every other
//! locale defines exactly the same keys, with non-empty values, the same
//! variables, and no untranslated English leftovers.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use fluent_syntax::ast;
use fluent_syntax::parser;

pub const SOURCE_LOCALE: &str = "en";

/// The 14 supported locales, in display order.
pub const LOCALES: [&str; 14] = [
    "en", "fa", "ar", "fr", "de", "es", "pt-BR", "zh", "ja", "ko", "ru", "tr", "it", "hi",
];

pub fn locales_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../locales")
}

/// One parsed message: its flattened text and the variables it references.
#[derive(Debug, Clone, PartialEq)]
pub struct Message {
    pub text: String,
    pub variables: BTreeSet<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum CatalogError {
    #[error("cannot read {0}: {1}")]
    Io(PathBuf, std::io::Error),
    #[error("syntax errors in {0}: {1}")]
    Syntax(String, String),
}

pub type Catalog = BTreeMap<String, Message>;

/// Parse one `.ftl` source into id -> message.
pub fn parse_catalog(name: &str, source: &str) -> Result<Catalog, CatalogError> {
    let resource = parser::parse(source.to_string()).map_err(|(_, errs)| {
        CatalogError::Syntax(
            name.to_string(),
            errs.iter()
                .map(|e| format!("{:?} at {:?}", e.kind, e.pos))
                .collect::<Vec<_>>()
                .join("; "),
        )
    })?;
    let mut out = Catalog::new();
    for entry in resource.body {
        if let ast::Entry::Message(msg) = entry {
            let mut text = String::new();
            let mut variables = BTreeSet::new();
            if let Some(pattern) = &msg.value {
                walk_pattern(pattern, &mut text, &mut variables);
            }
            for attr in &msg.attributes {
                walk_pattern(&attr.value, &mut text, &mut variables);
            }
            out.insert(msg.id.name.to_string(), Message { text, variables });
        }
    }
    Ok(out)
}

fn walk_pattern(p: &ast::Pattern<String>, text: &mut String, vars: &mut BTreeSet<String>) {
    for el in &p.elements {
        match el {
            ast::PatternElement::TextElement { value } => text.push_str(value),
            ast::PatternElement::Placeable { expression } => walk_expr(expression, text, vars),
        }
    }
}

fn walk_expr(e: &ast::Expression<String>, text: &mut String, vars: &mut BTreeSet<String>) {
    match e {
        ast::Expression::Select { selector, variants } => {
            walk_inline(selector, text, vars);
            for v in variants {
                walk_pattern(&v.value, text, vars);
            }
        }
        ast::Expression::Inline(i) => walk_inline(i, text, vars),
    }
}

fn walk_inline(i: &ast::InlineExpression<String>, text: &mut String, vars: &mut BTreeSet<String>) {
    match i {
        ast::InlineExpression::VariableReference { id } => {
            vars.insert(id.name.to_string());
        }
        ast::InlineExpression::StringLiteral { value } => text.push_str(value),
        ast::InlineExpression::Placeable { expression } => walk_expr(expression, text, vars),
        ast::InlineExpression::FunctionReference { arguments, .. } => {
            for a in &arguments.positional {
                walk_inline(a, text, vars);
            }
        }
        _ => {}
    }
}

pub fn load_locale(code: &str) -> Result<Catalog, CatalogError> {
    let path = locales_dir().join(format!("{code}.ftl"));
    let src = std::fs::read_to_string(&path).map_err(|e| CatalogError::Io(path, e))?;
    parse_catalog(code, &src)
}

/// Keys allowed to be identical to English, from `locales/allow-identical.txt`.
pub fn load_allow_identical() -> BTreeSet<(String, String)> {
    let path = locales_dir().join("allow-identical.txt");
    let src = std::fs::read_to_string(path).unwrap_or_default();
    src.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .filter_map(|l| l.split_once(':'))
        .map(|(loc, id)| (loc.trim().to_string(), id.trim().to_string()))
        .collect()
}

/// A single coverage problem.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum Problem {
    Missing { locale: String, id: String },
    Extra { locale: String, id: String },
    Empty { locale: String, id: String },
    VariableMismatch { locale: String, id: String, expected: Vec<String>, found: Vec<String> },
    UntranslatedEnglish { locale: String, id: String },
}

/// Compare one locale against the English source.
pub fn check_locale(
    locale: &str,
    source: &Catalog,
    target: &Catalog,
    allow_identical: &BTreeSet<(String, String)>,
) -> Vec<Problem> {
    let mut problems = Vec::new();
    for (id, src) in source {
        let Some(tr) = target.get(id) else {
            problems.push(Problem::Missing { locale: locale.into(), id: id.clone() });
            continue;
        };
        if tr.text.trim().is_empty() && tr.variables.is_empty() {
            problems.push(Problem::Empty { locale: locale.into(), id: id.clone() });
        }
        if tr.variables != src.variables {
            problems.push(Problem::VariableMismatch {
                locale: locale.into(),
                id: id.clone(),
                expected: src.variables.iter().cloned().collect(),
                found: tr.variables.iter().cloned().collect(),
            });
        }
        let allowed = allow_identical.contains(&("*".to_string(), id.clone()))
            || allow_identical.contains(&(locale.to_string(), id.clone()));
        if locale != SOURCE_LOCALE && !allowed && tr.text.trim() == src.text.trim() {
            problems.push(Problem::UntranslatedEnglish { locale: locale.into(), id: id.clone() });
        }
    }
    for id in target.keys() {
        if !source.contains_key(id) {
            problems.push(Problem::Extra { locale: locale.into(), id: id.clone() });
        }
    }
    problems
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_each_problem_kind() {
        let en = parse_catalog("en", "a = Hello { $name }\nb = Bye\nc = Same\n").unwrap();
        let xx = parse_catalog("xx", "a = Hallo\nc = Same\nd = Extra\n").unwrap();
        let p = check_locale("xx", &en, &xx, &BTreeSet::new());
        assert!(p.iter().any(|p| matches!(p, Problem::Missing { id, .. } if id == "b")));
        assert!(p.iter().any(|p| matches!(p, Problem::Extra { id, .. } if id == "d")));
        assert!(p.iter().any(|p| matches!(p, Problem::VariableMismatch { id, .. } if id == "a")));
        assert!(p.iter().any(|p| matches!(p, Problem::UntranslatedEnglish { id, .. } if id == "c")));
    }

    #[test]
    fn select_variables_are_collected() {
        let c = parse_catalog(
            "en",
            "m =\n    { $count ->\n        [one] { $count } item\n       *[other] { $count } items\n    }\n",
        )
        .unwrap();
        assert_eq!(c["m"].variables, BTreeSet::from(["count".to_string()]));
    }
}
