use chrono::{DateTime, Duration, Utc};

use crate::database::Lead;

const MAX_AGE_HOURS: i64 = 24;

/// should_audit_lead
pub fn should_audit_lead(lead: &Lead) -> bool {
    let scraped_at = lead.scrapped_at.as_ref().and_then(|s| {
        DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|dt| dt.with_timezone(&Utc))
    });
    let audited_at = lead.audited_at.as_ref().and_then(|s| {
        DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|dt| dt.with_timezone(&Utc))
    });

    if is_recently_processed(scraped_at, audited_at) {
        return false;
    }

    if scraped_at.is_none() && audited_at.is_none() {
        return true;
    }

    has_missing_contact_info(lead)
}

/// is_recently_processed
fn is_recently_processed(
    scraped_at: Option<DateTime<Utc>>,
    audited_at: Option<DateTime<Utc>>,
) -> bool {
    let now = Utc::now();
    let max_age = Duration::hours(MAX_AGE_HOURS);

    let recently_scraped = scraped_at.is_some_and(|dt| now - dt < max_age);
    let recently_audited = audited_at.is_some_and(|dt| now - dt < max_age);

    recently_scraped || recently_audited
}

/// has_missing_contact_info
fn has_missing_contact_info(lead: &Lead) -> bool {
    let has_no_email = lead.email.is_none() && lead.additional_emails.is_empty();
    let has_no_phone = lead.phone_numbers.is_empty();

    has_no_email && has_no_phone
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    /// test_should_audit_never_audited
    fn test_should_audit_never_audited() {
        let lead = Lead {
            id: "1".to_string(),
            domain: "example.com".to_string(),
            scrapped_at: None,
            audited_at: None,
            email: None,
            additional_emails: vec![],
            phone_numbers: vec![],
        };

        assert!(should_audit_lead(&lead));
    }

    #[test]
    /// test_should_not_audit_recently_processed
    fn test_should_not_audit_recently_processed() {
        let now = Utc::now().to_rfc3339();
        let lead = Lead {
            id: "1".to_string(),
            domain: "example.com".to_string(),
            scrapped_at: Some(now),
            audited_at: None,
            email: None,
            additional_emails: vec![],
            phone_numbers: vec![],
        };

        assert!(!should_audit_lead(&lead));
    }

    #[test]
    /// test_should_audit_missing_contact_info
    fn test_should_audit_missing_contact_info() {
        let old_date = (Utc::now() - Duration::hours(48)).to_rfc3339();
        let lead = Lead {
            id: "1".to_string(),
            domain: "example.com".to_string(),
            scrapped_at: Some(old_date),
            audited_at: None,
            email: None,
            additional_emails: vec![],
            phone_numbers: vec![],
        };

        assert!(should_audit_lead(&lead));
    }

    #[test]
    /// test_should_not_audit_has_contact_info
    fn test_should_not_audit_has_contact_info() {
        let old_date = (Utc::now() - Duration::hours(48)).to_rfc3339();
        let lead = Lead {
            id: "1".to_string(),
            domain: "example.com".to_string(),
            scrapped_at: Some(old_date),
            audited_at: None,
            email: Some("test@example.com".to_string()),
            additional_emails: vec![],
            phone_numbers: vec![],
        };

        assert!(!should_audit_lead(&lead));
    }
}
