use anyhow::{Context, Result};
use redis::aio::ConnectionManager;
use redis::{AsyncCommands, Script};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeadAuditJobData {
    #[serde(rename = "auditSessionId")]
    pub audit_session_id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
}

#[derive(Debug, Clone)]
pub struct BullMQJob {
    pub id: String,
    pub name: String,
    pub data: LeadAuditJobData,
}

/// fetch_next_job
pub async fn fetch_next_job(
    conn: &mut ConnectionManager,
    queue_name: &str,
) -> Result<Option<BullMQJob>> {
    let marker_key = format!("bull:{}:marker", queue_name);
    let result: Option<Vec<String>> = redis::cmd("BZPOPMIN")
        .arg(&marker_key)
        .arg(5)
        .query_async(conn)
        .await
        .ok();

    if result.is_none() {
        return Ok(None);
    }

    let job_id = move_to_active(conn, queue_name).await?;

    if let Some(job_id) = job_id {
        let job_key = format!("bull:{}:{}", queue_name, job_id);
        let job_hash: HashMap<String, String> = conn
            .hgetall(&job_key)
            .await
            .context("Failed to fetch job hash")?;

        if job_hash.is_empty() {
            return Ok(None);
        }

        let name = job_hash
            .get("name")
            .ok_or_else(|| anyhow::anyhow!("Missing 'name' field in job hash"))?
            .clone();

        let data_json = job_hash
            .get("data")
            .ok_or_else(|| anyhow::anyhow!("Missing 'data' field in job hash"))?;

        let data: LeadAuditJobData =
            serde_json::from_str(data_json).context("Failed to parse job data JSON")?;

        info!("✅ [RUST] Successfully parsed job: {} ({})", name, job_id);

        return Ok(Some(BullMQJob {
            id: job_id,
            name,
            data,
        }));
    }

    Ok(None)
}

/// move_to_active
async fn move_to_active(conn: &mut ConnectionManager, queue_name: &str) -> Result<Option<String>> {
    let wait_key = format!("bull:{}:wait", queue_name);
    let priority_key = format!("bull:{}:priority", queue_name);
    let active_key = format!("bull:{}:active", queue_name);
    let paused_key = format!("bull:{}:paused", queue_name);

    let move_script = Script::new(
        r#"
        local rcall = redis.call
        local queueKey = KEYS[1]
        local priorityKey = KEYS[2]
        local activeKey = KEYS[3]
        local pausedKey = KEYS[4]

        local isPaused = rcall("EXISTS", pausedKey) == 1
        if isPaused then
            return nil
        end

        local jobId = rcall("RPOPLPUSH", queueKey, activeKey)
        if not jobId then
            jobId = rcall("ZPOPMIN", priorityKey, 1)[1]
            if jobId then
                rcall("LPUSH", activeKey, jobId)
            end
        end

        return jobId
        "#,
    );

    move_script
        .key(&wait_key)
        .key(&priority_key)
        .key(&active_key)
        .key(&paused_key)
        .invoke_async(conn)
        .await
        .context("Failed to execute moveToActive script")
}

/// acknowledge_job
pub async fn acknowledge_job(
    conn: &mut ConnectionManager,
    job_id: &str,
    queue_name: &str,
) -> Result<()> {
    let active_key = format!("bull:{}:active", queue_name);
    let completed_key = format!("bull:{}:completed", queue_name);
    let job_key = format!("bull:{}:{}", queue_name, job_id);
    let timestamp = chrono::Utc::now().timestamp_millis();

    let _: () = conn.lrem(&active_key, 1, job_id).await?;
    let _: () = conn.zadd(&completed_key, job_id, timestamp).await?;
    let _: () = conn.hset(&job_key, "finishedOn", timestamp).await?;

    info!("✅ [RUST] Job {} marked as completed", job_id);
    Ok(())
}

/// requeue_job
pub async fn requeue_job(
    conn: &mut ConnectionManager,
    job_id: &str,
    queue_name: &str,
) -> Result<()> {
    let active_key = format!("bull:{}:active", queue_name);
    let wait_key = format!("bull:{}:wait", queue_name);
    let marker_key = format!("bull:{}:marker", queue_name);

    let _: () = conn.lrem(&active_key, 1, job_id).await?;
    let _: () = conn.lpush(&wait_key, job_id).await?;

    let timestamp = chrono::Utc::now().timestamp_millis();
    let _: () = conn.zadd(&marker_key, "0", timestamp).await?;

    info!("🔁 [RUST] Job {} requeued to wait list", job_id);
    Ok(())
}
