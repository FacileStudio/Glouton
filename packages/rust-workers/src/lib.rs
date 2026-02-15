pub mod audit;
pub mod audit_processor;
pub mod broadcast;
pub mod bullmq;
pub mod database;
pub mod extractors;
pub mod filters;
pub mod scoring;
pub mod scraper;
pub mod worker;

pub use audit::{audit_website, detect_technologies, AuditResult, Technology};
pub use database::Lead;
pub use extractors::{extract_emails, extract_phones, is_generic_email};
pub use filters::should_audit_lead;
pub use scoring::{calculate_lead_score, LeadScore};
pub use scraper::{ScrapedData, SmartScraper};
pub use worker::LeadAuditWorker;
