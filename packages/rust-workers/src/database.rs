use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tokio_postgres::types::Json;
use tokio_postgres::Client as PgClient;
use tracing::info;

use crate::audit::AuditResult;
use crate::scraper::ScrapedData;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lead {
    pub id: String,
    pub domain: String,
    #[serde(rename = "scrappedAt")]
    pub scrapped_at: Option<String>,
    #[serde(rename = "auditedAt")]
    pub audited_at: Option<String>,
    pub email: Option<String>,
    #[serde(rename = "additionalEmails")]
    pub additional_emails: Vec<String>,
    #[serde(rename = "phoneNumbers")]
    pub phone_numbers: Vec<String>,
}

/// fetch_user_id_from_session
pub async fn fetch_user_id_from_session(db: &PgClient, session_id: &str) -> Result<String> {
    let row = db
        .query_one(
            "SELECT \"userId\" FROM \"AuditSession\" WHERE id = $1",
            &[&session_id],
        )
        .await
        .context("Failed to fetch audit session")?;

    Ok(row.get(0))
}

/// fetch_leads_for_user
pub async fn fetch_leads_for_user(db: &PgClient, user_id: &str) -> Result<Vec<Lead>> {
    let rows = db
        .query(
            r#"
            SELECT
                id,
                domain,
                email,
                "additionalEmails",
                "phoneNumbers",
                "scrapedAt",
                "auditedAt"
            FROM "Lead"
            WHERE "userId" = $1 AND domain IS NOT NULL
            "#,
            &[&user_id],
        )
        .await
        .context("Failed to fetch leads from database")?;

    let mut leads = Vec::new();

    for row in rows {
        let id: String = row.get(0);
        let domain: String = row.get(1);
        let email: Option<String> = row.get(2);
        let additional_emails: Vec<String> =
            row.get::<_, Option<Vec<String>>>(3).unwrap_or_default();
        let phone_numbers: Vec<String> = row.get::<_, Option<Vec<String>>>(4).unwrap_or_default();

        let scraped_at: Option<chrono::NaiveDateTime> = row.try_get(5).ok();
        let audited_at: Option<chrono::NaiveDateTime> = row.try_get(6).ok();

        let scraped_at_utc = scraped_at
            .map(|dt| chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(dt, chrono::Utc));
        let audited_at_utc = audited_at
            .map(|dt| chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(dt, chrono::Utc));

        leads.push(Lead {
            id,
            domain,
            scrapped_at: scraped_at_utc.map(|dt| dt.to_rfc3339()),
            audited_at: audited_at_utc.map(|dt| dt.to_rfc3339()),
            email,
            additional_emails,
            phone_numbers,
        });
    }

    info!("📊 [DB] Fetched {} leads from database", leads.len());

    Ok(leads)
}

/// update_lead_with_scraped_data
pub async fn update_lead_with_scraped_data(
    db: &PgClient,
    lead: &Lead,
    scraped_data: &ScrapedData,
    audit_result: Option<&AuditResult>,
) -> Result<()> {
    let new_emails = &scraped_data.emails;
    let new_phones = &scraped_data.phones;

    let mut additional_emails = lead.additional_emails.clone();
    additional_emails.extend(new_emails.iter().cloned());
    additional_emails.sort();
    additional_emails.dedup();

    let email = if lead.email.is_none() && !new_emails.is_empty() {
        Some(new_emails[0].clone())
    } else {
        lead.email.clone()
    };

    if let Some(ref e) = email {
        additional_emails.retain(|x| x != e);
    }

    let mut phone_numbers = lead.phone_numbers.clone();
    phone_numbers.extend(new_phones.iter().cloned());
    phone_numbers.sort();
    phone_numbers.dedup();

    let technologies: Vec<String> = audit_result
        .map(|a| a.technologies.iter().map(|t| t.name.clone()).collect())
        .unwrap_or_default();

    let website_audit_json = audit_result.map(|a| {
        Json(serde_json::json!({
            "technologies": a.technologies.iter().map(|t| serde_json::json!({
                "name": t.name,
                "category": t.category,
                "version": t.version,
            })).collect::<Vec<_>>(),
            "ssl": {
                "hasSSL": a.has_ssl,
            },
        }))
    });

    let now = chrono::Utc::now();

    let result = db
        .execute(
            r#"
        UPDATE "Lead"
        SET
            email = COALESCE($1, email),
            "additionalEmails" = $2,
            "phoneNumbers" = $3,
            technologies = $4,
            "websiteAudit" = COALESCE($5, "websiteAudit"),
            "scrapedAt" = $6,
            "auditedAt" = $7
        WHERE id = $8
        "#,
            &[
                &email,
                &additional_emails,
                &phone_numbers,
                &technologies,
                &website_audit_json,
                &now,
                &now,
                &lead.id,
            ],
        )
        .await;

    if let Err(e) = result {
        tracing::warn!("Failed to update lead {}: {}", lead.id, e);
        return Err(anyhow::anyhow!("Failed to update lead in database: {}", e));
    }

    Ok(())
}
