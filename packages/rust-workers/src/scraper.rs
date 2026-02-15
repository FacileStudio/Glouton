use anyhow::{Context, Result};
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::page::Page;
use dashmap::DashMap;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::timeout;
use tracing::info;
use url::Url;

use crate::extractors::{extract_emails, extract_phones};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrapedData {
    pub url: String,
    pub emails: Vec<String>,
    pub phones: Vec<String>,
    pub html: Option<String>,
    pub scraped_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Clone)]
pub struct ScraperCache {
    cache: Arc<DashMap<String, ScrapedData>>,
}

impl Default for ScraperCache {
    /// default
    fn default() -> Self {
        Self::new()
    }
}

impl ScraperCache {
    /// new
    pub fn new() -> Self {
        Self {
            cache: Arc::new(DashMap::new()),
        }
    }

    /// get
    pub fn get(&self, url: &str) -> Option<ScrapedData> {
        self.cache.get(url).map(|entry| entry.value().clone())
    }

    /// set
    pub fn set(&self, url: String, data: ScrapedData) {
        self.cache.insert(url, data);
    }
}

pub struct SmartScraper {
    browser: Option<Browser>,
    cache: ScraperCache,
    timeout_ms: u64,
}

impl SmartScraper {
    /// new
    pub async fn new(timeout_ms: u64) -> Result<Self> {
        Ok(Self {
            browser: None,
            cache: ScraperCache::new(),
            timeout_ms,
        })
    }

    /// init_browser
    pub async fn init_browser(&mut self) -> Result<()> {
        if self.browser.is_some() {
            return Ok(());
        }

        let config = BrowserConfig::builder()
            .window_size(1920, 1080)
            .no_sandbox()
            .build()
            .map_err(|e| anyhow::anyhow!("Failed to build browser config: {}", e))?;

        let (browser, mut handler) = Browser::launch(config)
            .await
            .context("Failed to launch browser")?;

        tokio::spawn(async move {
            while let Some(event) = handler.next().await {
                if let Err(e) = event {
                    let error_str = e.to_string();
                    if !error_str.contains("data did not match any variant")
                        && !error_str.contains("ResetWithoutClosingHandshake")
                        && !error_str.contains("Connection reset")
                    {
                        tracing::error!("Browser event error: {}", e);
                    }
                }
            }
        });

        self.browser = Some(browser);
        Ok(())
    }

    /// scrape
    pub async fn scrape(&mut self, url: &str, context: &str) -> Result<ScrapedData> {
        let normalized_url = normalize_url(url)?;

        if let Some(cached) = self.cache.get(&normalized_url) {
            info!("[{}] Using cached data for: {}", context, normalized_url);
            return Ok(cached);
        }

        info!("[{}] Trying fast fetch for: {}", context, normalized_url);
        if let Ok(data) = self.try_fast_fetch(&normalized_url).await {
            if has_enough_data(&data) {
                info!(
                    "[{}] Fast fetch succeeded: {} ({} emails)",
                    context,
                    normalized_url,
                    data.emails.len()
                );
                self.cache.set(normalized_url.clone(), data.clone());
                return Ok(data);
            }
        }

        info!(
            "[{}] Fast fetch insufficient, falling back to browser: {}",
            context, normalized_url
        );
        self.scrape_with_browser(&normalized_url, context).await
    }

    /// try_fast_fetch
    async fn try_fast_fetch(&self, url: &str) -> Result<ScrapedData> {
        let response = timeout(
            Duration::from_millis(self.timeout_ms),
            reqwest::Client::new()
                .get(url)
                .header(
                    "User-Agent",
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                )
                .send(),
        )
        .await
        .context("Request timed out")??;

        if !response.status().is_success() {
            anyhow::bail!("HTTP {}", response.status());
        }

        let html = response.text().await?;
        Ok(parse_html(&html, url))
    }

    /// scrape_with_browser
    async fn scrape_with_browser(&mut self, url: &str, context: &str) -> Result<ScrapedData> {
        self.init_browser().await?;

        let browser = self.browser.as_ref().context("Browser not initialized")?;

        let page = timeout(Duration::from_secs(5), browser.new_page("about:blank"))
            .await
            .context("Timeout creating new page")??;

        let result = self.scrape_page(&page, url, context).await;

        let _ = timeout(Duration::from_secs(2), page.close()).await;

        result
    }

    /// scrape_page
    async fn scrape_page(&self, page: &Page, url: &str, context: &str) -> Result<ScrapedData> {
        info!("[{}] Starting scrape: {}", context, url);

        timeout(Duration::from_millis(self.timeout_ms), page.goto(url))
            .await
            .context("Navigation timeout")??;

        tokio::time::sleep(Duration::from_millis(500)).await;

        let html = timeout(Duration::from_secs(5), page.content())
            .await
            .context("Timeout getting page content")??;

        Ok(parse_html(&html, url))
    }

    /// close
    pub async fn close(&mut self) -> Result<()> {
        if let Some(mut browser) = self.browser.take() {
            timeout(Duration::from_secs(5), browser.close())
                .await
                .context("Timeout closing browser")??;
        }
        Ok(())
    }
}

/// normalize_url
fn normalize_url(url: &str) -> Result<String> {
    let url_str = if !url.starts_with("http://") && !url.starts_with("https://") {
        format!("https://{}", url)
    } else {
        url.to_string()
    };

    let parsed = Url::parse(&url_str).context("Invalid URL")?;
    Ok(parsed.to_string())
}

/// parse_html
fn parse_html(html: &str, url: &str) -> ScrapedData {
    let emails = extract_emails(html);
    let phones = extract_phones(html);

    ScrapedData {
        url: url.to_string(),
        emails,
        phones,
        html: Some(html.to_string()),
        scraped_at: chrono::Utc::now(),
    }
}

/// has_enough_data
fn has_enough_data(data: &ScrapedData) -> bool {
    !data.emails.is_empty() || !data.phones.is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    /// test_normalize_url
    fn test_normalize_url() {
        assert_eq!(
            normalize_url("example.com").unwrap(),
            "https://example.com/"
        );
        assert_eq!(
            normalize_url("https://example.com").unwrap(),
            "https://example.com/"
        );
    }

    #[test]
    /// test_parse_html
    fn test_parse_html() {
        let html = r#"
            <p>Email: contact@example.com</p>
            <p>Phone: 01 23 45 67 89</p>
        "#;
        let data = parse_html(html, "https://example.com");
        assert!(!data.emails.is_empty());
        assert!(!data.phones.is_empty());
    }
}
