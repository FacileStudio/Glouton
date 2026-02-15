use anyhow::{Context, Result};
use reqwest::Client;
use serde_json::json;
use tracing::debug;

pub struct BroadcastService {
    client: Client,
    backend_url: String,
}

impl BroadcastService {
    /// new
    pub fn new(backend_url: String) -> Self {
        Self {
            client: Client::new(),
            backend_url,
        }
    }

    /// progress
    pub async fn progress(&self, user_id: &str, lead_id: &str) -> Result<()> {
        let payload = json!({
            "userId": user_id,
            "message": {
                "type": "audit-progress",
                "data": {
                    "leadId": lead_id,
                    "status": "completed"
                }
            }
        });

        self.send(payload).await
    }

    /// completion
    pub async fn completion(
        &self,
        user_id: &str,
        session_id: &str,
        processed: usize,
        total: usize,
    ) -> Result<()> {
        let completion = json!({
            "userId": user_id,
            "message": {
                "type": "audit-complete",
                "data": {
                    "sessionId": session_id,
                    "processedLeads": processed,
                    "totalLeads": total
                }
            }
        });

        self.send(completion).await?;

        let stats_changed = json!({
            "userId": user_id,
            "message": {
                "type": "stats-changed",
                "data": {
                    "reason": "audit-completed",
                    "auditSessionId": session_id,
                },
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }
        });

        self.send(stats_changed).await
    }

    /// send
    async fn send(&self, payload: serde_json::Value) -> Result<()> {
        let url = format!("{}/internal/broadcast", self.backend_url);

        self.client
            .post(&url)
            .json(&payload)
            .send()
            .await
            .context("Failed to send broadcast")?;

        debug!(
            "📡 [BROADCAST] Sent: {:?}",
            payload.get("message").and_then(|m| m.get("type"))
        );
        Ok(())
    }
}
