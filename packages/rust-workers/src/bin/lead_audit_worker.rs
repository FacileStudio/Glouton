use anyhow::Result;
use rust_workers::LeadAuditWorker;
use std::env;
use tracing::{error, info};

#[tokio::main]
/// main
async fn main() -> Result<()> {
    if let Err(e) = dotenvy::from_filename("../../apps/backend/.env") {
        info!(
            "⚠️  Could not load .env file: {} (will use system environment)",
            e
        );
    } else {
        info!("✅ Loaded environment from ../../apps/backend/.env");
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    info!("🦀 Rust Lead Audit Worker starting...");

    let redis_host = env::var("REDIS_HOST").unwrap_or_else(|_| "localhost".to_string());
    let redis_port = env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
    let redis_password = env::var("REDIS_PASSWORD").ok();
    let redis_db = env::var("REDIS_DB").unwrap_or_else(|_| "0".to_string());

    let redis_url = if let Some(password) = redis_password {
        format!(
            "redis://:{}@{}:{}/{}",
            password, redis_host, redis_port, redis_db
        )
    } else {
        format!("redis://{}:{}/{}", redis_host, redis_port, redis_db)
    };

    let backend_url =
        env::var("BACKEND_URL").unwrap_or_else(|_| "http://localhost:3001".to_string());
    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
        info!("⚠️  DATABASE_URL not set - database operations will be stubbed");
        "postgresql://localhost:5432/stub".to_string()
    });

    info!("📡 Connecting to Redis at {}", redis_url);
    info!("🔗 Backend URL: {}", backend_url);

    let worker = LeadAuditWorker::new(backend_url, database_url, &redis_url).await?;

    info!("✅ Worker initialized, waiting for jobs from 'leads' queue...");

    if let Err(e) = worker.start("leads").await {
        error!("❌ Worker error: {}", e);
        return Err(e);
    }

    Ok(())
}
