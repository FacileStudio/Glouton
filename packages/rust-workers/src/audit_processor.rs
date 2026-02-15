use anyhow::{Context, Result};
use tokio_postgres::Client as PgClient;
use tracing::info;

use crate::audit::audit_website;
use crate::broadcast::BroadcastService;
use crate::database::{
    fetch_leads_for_user, fetch_user_id_from_session, update_lead_with_scraped_data, Lead,
};
use crate::filters::should_audit_lead;
use crate::scoring::calculate_lead_score;
use crate::scraper::SmartScraper;

pub struct AuditProcessor<'a> {
    scraper: &'a mut SmartScraper,
    db_client: &'a PgClient,
    broadcast: &'a BroadcastService,
}

impl<'a> AuditProcessor<'a> {
    /// new
    pub fn new(
        scraper: &'a mut SmartScraper,
        db_client: &'a PgClient,
        broadcast: &'a BroadcastService,
    ) -> Self {
        Self {
            scraper,
            db_client,
            broadcast,
        }
    }

    /// fetch_leads
    pub async fn fetch_leads(&self, session_id: &str) -> Result<Vec<Lead>> {
        let user_id = fetch_user_id_from_session(self.db_client, session_id).await?;
        let all_leads = fetch_leads_for_user(self.db_client, &user_id).await?;
        let total = all_leads.len();

        let leads: Vec<Lead> = all_leads
            .into_iter()
            .filter(should_audit_lead)
            .collect();

        info!(
            "🔍 [RUST] Filtered {} leads needing audit (from {} total)",
            leads.len(),
            total
        );
        Ok(leads)
    }

    /// audit_lead
    pub async fn audit_lead(&mut self, lead: &Lead, user_id: &str) -> Result<()> {
        let url = if lead.domain.starts_with("http") {
            lead.domain.clone()
        } else {
            format!("https://{}", lead.domain)
        };

        let scraped_data = self.scraper.scrape(&url, "RUST-AUDIT").await?;

        let audit_result = scraped_data.html.as_ref().map(|html| audit_website(html, &url));

        let _score = calculate_lead_score(&scraped_data, audit_result.as_ref());

        update_lead_with_scraped_data(self.db_client, lead, &scraped_data, audit_result.as_ref())
            .await
            .context("Failed to update lead")?;

        self.broadcast.progress(user_id, &lead.id).await?;

        Ok(())
    }
}
