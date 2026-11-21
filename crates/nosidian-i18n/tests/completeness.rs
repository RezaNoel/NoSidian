//! Fails the build if any UI string is missing, empty, has different
//! variables, or is left in English in any of the 14 locales.

use nosidian_i18n::{check_locale, load_allow_identical, load_locale, LOCALES, SOURCE_LOCALE};

#[test]
fn every_locale_file_exists_and_parses() {
    for code in LOCALES {
        load_locale(code).unwrap_or_else(|e| panic!("{code}: {e}"));
    }
}

#[test]
fn every_key_is_translated_in_every_locale() {
    let source = load_locale(SOURCE_LOCALE).unwrap();
    assert!(!source.is_empty(), "English catalogue is empty");
    let allow = load_allow_identical();
    let mut problems = Vec::new();
    for code in LOCALES {
        let target = load_locale(code).unwrap();
        problems.extend(check_locale(code, &source, &target, &allow));
    }
    if !problems.is_empty() {
        let report: Vec<String> = problems.iter().map(|p| format!("  {p:?}")).collect();
        panic!(
            "{} translation problem(s):\n{}",
            problems.len(),
            report.join("\n")
        );
    }
}

#[test]
fn language_list_matches_locales() {
    let json = std::fs::read_to_string(nosidian_i18n::locales_dir().join("languages.json")).unwrap();
    for code in LOCALES {
        assert!(
            json.contains(&format!("\"code\": \"{code}\"")),
            "languages.json is missing {code}"
        );
    }
}
