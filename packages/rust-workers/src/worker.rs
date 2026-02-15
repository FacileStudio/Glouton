use anyhow::Result;
use redis::aio::ConnectionManager;
use redis::Client;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
use tokio_postgres::{Client as PgClient, NoTls};
use tracing::{error, info};

use crate::audit_processor::AuditProcessor;
use crate::broadcast::BroadcastService;
use crate::bullmq::{acknowledge_job, fetch_next_job, requeue_job, BullMQJob};
use crate::scraper::SmartScraper;

pub struct LeadAuditWorker {
    scraper: Arc<Mutex<SmartScraper>>,
    db_client: Arc<Mutex<PgClient>>,
    redis_conn: Arc<Mutex<ConnectionManager>>,
    broadcast: Arc<BroadcastService>,
}

impl LeadAuditWorker {
    /// new
    pub async fn new(backend_url: String, database_url: String, redis_url: &str) -> Result<Self> {
        let scraper = SmartScraper::new(30000).await?;
        let redis_client = Client::open(redis_url)?;
        let redis_conn = ConnectionManager::new(redis_client).await?;

        let (db_client, connection) = tokio_postgres::connect(&database_url, NoTls).await?;

        tokio::spawn(async move {
            if let Err(e) = connection.await {
                error!("Database connection error: {}", e);
            }
        });

        Ok(Self {
            scraper: Arc::new(Mutex::new(scraper)),
            db_client: Arc::new(Mutex::new(db_client)),
            redis_conn: Arc::new(Mutex::new(redis_conn)),
            broadcast: Arc::new(BroadcastService::new(backend_url)),
        })
    }

    /// start
    pub async fn start(&self, queue_name: &str) -> Result<()> {
        info!(
            "🦀 [RUST] Lead audit worker started (queue: {})",
            queue_name
        );

        loop {
            let mut conn = self.redis_conn.lock().await;

            match fetch_next_job(&mut conn, queue_name).await {
                Ok(Some(job)) => {
                    drop(conn);
                    info!("📋 [RUST] Received job: {} ({})", job.name, job.id);

                    if job.name != "lead-audit" {
                        info!(
                            "⏭️  [RUST] Skipping job '{}' - not a lead-audit job",
                            job.name
                        );
                        let mut conn = self.redis_conn.lock().await;
                        requeue_job(&mut conn, &job.id, queue_name).await?;
                        continue;
                    }

                    if let Err(e) = self.process_job(job, queue_name).await {
                        error!("❌ [RUST] Job processing error: {}", e);
                    }
                }
                Ok(None) => {
                    drop(conn);
                    sleep(Duration::from_millis(500)).await;
                }
                Err(e) => {
                    drop(conn);
                    error!("❌ [RUST] Failed to fetch job: {}", e);
                    sleep(Duration::from_secs(5)).await;
                }
            }
        }
    }

    /// process_job
    async fn process_job(&self, job: BullMQJob, queue_name: &str) -> Result<()> {
        info!(
            "📋 [RUST] Processing audit session: {} for user: {}",
            job.data.audit_session_id, job.data.user_id
        );

        let mut scraper = self.scraper.lock().await;
        let db = self.db_client.lock().await;

        let mut processor = AuditProcessor::new(&mut scraper, &db, &self.broadcast);
        let leads = processor.fetch_leads(&job.data.audit_session_id).await?;

        info!("🔍 [RUST] Found {} leads to audit", leads.len());

        let mut processed = 0;
        let total = leads.len();

        for lead in leads {
            match processor.audit_lead(&lead, &job.data.user_id).await {
                Ok(_) => {
                    processed += 1;
                    if processed % 10 == 0 {
                        info!(
                            "⏳ [RUST] Progress: {}/{} leads processed",
                            processed, total
                        );
                    }
                }
                Err(e) => {
                    error!("❌ [RUST] Failed to audit lead {}: {}", lead.id, e);
                }
            }
        }

        info!(
            "✅ [RUST] Audit session {} completed: {}/{} leads processed",
            job.data.audit_session_id, processed, total
        );

        self.broadcast
            .completion(
                &job.data.user_id,
                &job.data.audit_session_id,
                processed,
                total,
            )
            .await?;

        let mut conn = self.redis_conn.lock().await;
        acknowledge_job(&mut conn, &job.id, queue_name).await?;

        Ok(())
    }
}
