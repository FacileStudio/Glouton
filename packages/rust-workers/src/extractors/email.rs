use lazy_static::lazy_static;
use regex::Regex;
use std::collections::HashSet;

lazy_static! {
    static ref EMAIL_REGEX: Regex =
        Regex::new(r"(?i)\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b").unwrap();
    static ref GENERIC_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"(?i)^(info|contact|hello|support|admin|sales|no-?reply|noreply)@").unwrap(),
        Regex::new(r"@(gmail|yahoo|hotmail|outlook|aol|protonmail|icloud)\.").unwrap(),
    ];
}

/// extract_emails
pub fn extract_emails(html: &str) -> Vec<String> {
    let mut emails = HashSet::new();

    for cap in EMAIL_REGEX.captures_iter(html) {
        if let Some(email) = cap.get(0) {
            let email_str = email.as_str().to_lowercase();
            if !is_invalid_email(&email_str) {
                emails.insert(email_str);
            }
        }
    }

    emails.into_iter().collect()
}

/// is_generic_email
pub fn is_generic_email(email: &str) -> bool {
    GENERIC_PATTERNS
        .iter()
        .any(|pattern| pattern.is_match(email))
}

/// is_invalid_email
fn is_invalid_email(email: &str) -> bool {
    email.ends_with(".png")
        || email.ends_with(".jpg")
        || email.ends_with(".jpeg")
        || email.ends_with(".gif")
        || email.ends_with(".svg")
        || email.ends_with(".webp")
        || email.contains("@sentry")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    /// test_extract_valid_emails
    fn test_extract_valid_emails() {
        let html = r#"
            <p>Contact us at info@example.com or support@company.io</p>
            <a href="mailto:john.doe@business.fr">Email John</a>
        "#;
        let emails = extract_emails(html);
        assert!(emails.contains(&"info@example.com".to_string()));
        assert!(emails.contains(&"support@company.io".to_string()));
        assert!(emails.contains(&"john.doe@business.fr".to_string()));
    }

    #[test]
    /// test_filter_invalid_emails
    fn test_filter_invalid_emails() {
        let html = r#"
            <img src="logo@2x.png">
            <p>user@sentry.io</p>
        "#;
        let emails = extract_emails(html);
        assert!(!emails.iter().any(|e| e.ends_with(".png")));
        assert!(!emails.contains(&"user@sentry.io".to_string()));
    }

    #[test]
    /// test_generic_email_detection
    fn test_generic_email_detection() {
        assert!(is_generic_email("info@company.com"));
        assert!(is_generic_email("noreply@business.io"));
        assert!(is_generic_email("user@gmail.com"));
        assert!(!is_generic_email("john.smith@company.com"));
    }
}
