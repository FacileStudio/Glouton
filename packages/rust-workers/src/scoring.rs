use crate::audit::AuditResult;
use crate::extractors::is_generic_email;
use crate::scraper::ScrapedData;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LeadScore {
    Hot,
    Warm,
    Cold,
}

impl LeadScore {
    /// as_str
    pub fn as_str(&self) -> &'static str {
        match self {
            LeadScore::Hot => "HOT",
            LeadScore::Warm => "WARM",
            LeadScore::Cold => "COLD",
        }
    }
}

impl ToString for LeadScore {
    /// to_string
    fn to_string(&self) -> String {
        self.as_str().to_string()
    }
}

/// calculate_lead_score
pub fn calculate_lead_score(
    scraped_data: &ScrapedData,
    audit_result: Option<&AuditResult>,
) -> LeadScore {
    let has_personal_email = scraped_data.emails.iter().any(|e| !is_generic_email(e));

    let has_phone = !scraped_data.phones.is_empty();

    let has_modern_tech = audit_result
        .map(|a| has_modern_technology(&a.technologies))
        .unwrap_or(false);

    let has_ssl = audit_result.map(|a| a.has_ssl).unwrap_or(false);

    match (has_personal_email, has_phone, has_modern_tech, has_ssl) {
        (true, true, true, true) => LeadScore::Hot,
        (true, true, _, _) => LeadScore::Warm,
        (true, false, _, _) | (false, true, _, _) => LeadScore::Warm,
        _ => LeadScore::Cold,
    }
}

/// has_modern_technology
fn has_modern_technology(technologies: &[crate::audit::Technology]) -> bool {
    const MODERN_FRAMEWORKS: &[&str] = &["React", "Vue.js", "Next.js", "Nuxt.js", "Svelte"];

    technologies
        .iter()
        .any(|t| MODERN_FRAMEWORKS.contains(&t.name.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audit::{AuditResult, Technology};

    #[test]
    /// test_hot_lead_score
    fn test_hot_lead_score() {
        let scraped_data = ScrapedData {
            url: "https://example.com".to_string(),
            html: None,
            emails: vec!["john.doe@company.com".to_string()],
            phones: vec!["+33612345678".to_string()],
            scraped_at: chrono::Utc::now(),
        };

        let audit = AuditResult {
            url: "https://example.com".to_string(),
            technologies: vec![Technology {
                name: "React".to_string(),
                category: "Frontend Framework".to_string(),
                version: None,
            }],
            has_ssl: true,
            page_title: None,
            meta_description: None,
            audited_at: chrono::Utc::now(),
        };

        let score = calculate_lead_score(&scraped_data, Some(&audit));
        assert_eq!(score, LeadScore::Hot);
    }

    #[test]
    /// test_warm_lead_score
    fn test_warm_lead_score() {
        let scraped_data = ScrapedData {
            url: "https://example.com".to_string(),
            html: None,
            emails: vec!["contact@company.com".to_string()],
            phones: vec!["+33612345678".to_string()],
            scraped_at: chrono::Utc::now(),
        };

        let score = calculate_lead_score(&scraped_data, None);
        assert_eq!(score, LeadScore::Warm);
    }

    #[test]
    /// test_cold_lead_score
    fn test_cold_lead_score() {
        let scraped_data = ScrapedData {
            url: "https://example.com".to_string(),
            html: None,
            emails: vec!["info@company.com".to_string()],
            phones: vec![],
            scraped_at: chrono::Utc::now(),
        };

        let score = calculate_lead_score(&scraped_data, None);
        assert_eq!(score, LeadScore::Cold);
    }
}
