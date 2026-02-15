use lazy_static::lazy_static;
use regex::Regex;
use std::collections::HashSet;

lazy_static! {
    static ref PHONE_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"(?:\+33|0033|0)\s*[1-9](?:[\s.-]*\d{2}){4}").unwrap(),
        Regex::new(r"\+?\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,9}").unwrap(),
        Regex::new(r"\d{2,3}[\s.-]\d{2,3}[\s.-]\d{2,3}[\s.-]\d{2,3}").unwrap(),
    ];
}

/// extract_phones
pub fn extract_phones(html: &str) -> Vec<String> {
    let mut phones = HashSet::new();
    let clean_text = strip_html_tags(html);

    for pattern in PHONE_PATTERNS.iter() {
        for cap in pattern.captures_iter(&clean_text) {
            if let Some(phone) = cap.get(0) {
                let phone_str = normalize_phone(phone.as_str());
                if is_valid_phone(&phone_str) {
                    phones.insert(phone_str);
                }
            }
        }
    }

    phones.into_iter().collect()
}

/// strip_html_tags
fn strip_html_tags(html: &str) -> String {
    let tag_regex = Regex::new(r"<[^>]*>").unwrap();
    tag_regex.replace_all(html, " ").to_string()
}

/// normalize_phone
fn normalize_phone(phone: &str) -> String {
    let digits: String = phone
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '+')
        .collect();

    if digits.starts_with("0033") {
        format!("+33{}", &digits[4..])
    } else if digits.starts_with('0') && !digits.starts_with("00") {
        format!("+33{}", &digits[1..])
    } else {
        digits
    }
}

/// is_valid_phone
fn is_valid_phone(phone: &str) -> bool {
    let digit_count = phone.chars().filter(|c| c.is_ascii_digit()).count();
    (10..=15).contains(&digit_count) && !phone.contains("1234567890")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    /// test_extract_french_phones
    fn test_extract_french_phones() {
        let html = r#"
            <p>Appelez-nous au 01 23 45 67 89</p>
            <p>Mobile: +33 6 12 34 56 78</p>
        "#;
        let phones = extract_phones(html);
        assert!(phones.iter().any(|p| p.contains("123456789")));
        assert!(phones.iter().any(|p| p.contains("+336")));
    }

    #[test]
    /// test_normalize_phone
    fn test_normalize_phone() {
        assert_eq!(normalize_phone("01 23 45 67 89"), "+33123456789");
        assert_eq!(normalize_phone("+33 6 12 34 56 78"), "+33612345678");
        assert_eq!(normalize_phone("0033 1 23 45 67 89"), "+33123456789");
    }

    #[test]
    /// test_filter_invalid_phones
    fn test_filter_invalid_phones() {
        assert!(!is_valid_phone("123"));
        assert!(!is_valid_phone("1234567890"));
        assert!(is_valid_phone("+33123456789"));
    }
}
