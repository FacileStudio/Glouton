use lazy_static::lazy_static;
use regex::Regex;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Technology {
    pub name: String,
    pub category: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditResult {
    pub url: String,
    pub technologies: Vec<Technology>,
    pub has_ssl: bool,
    pub page_title: Option<String>,
    pub meta_description: Option<String>,
    pub audited_at: chrono::DateTime<chrono::Utc>,
}

lazy_static! {
    static ref TECH_PATTERNS: Vec<(String, String, Vec<TechPattern>)> = vec![
        (
            "React".to_string(),
            "Frontend Framework".to_string(),
            vec![
                TechPattern::ScriptContent(
                    Regex::new(r"react(?:-dom)?\.(?:development|production)\.min\.js").unwrap()
                ),
                TechPattern::HtmlContent(Regex::new(r"data-react").unwrap()),
            ]
        ),
        (
            "Vue.js".to_string(),
            "Frontend Framework".to_string(),
            vec![
                TechPattern::ScriptContent(Regex::new(r"vue(?:\.min)?\.js").unwrap()),
                TechPattern::HtmlContent(Regex::new(r"v-bind|v-if|v-for").unwrap()),
            ]
        ),
        (
            "WordPress".to_string(),
            "CMS".to_string(),
            vec![
                TechPattern::HtmlContent(Regex::new(r"/wp-content/|/wp-includes/").unwrap()),
                TechPattern::MetaGenerator(Regex::new(r"WordPress").unwrap()),
            ]
        ),
        (
            "Next.js".to_string(),
            "Frontend Framework".to_string(),
            vec![TechPattern::HtmlContent(
                Regex::new(r"__NEXT_DATA__|_next/static").unwrap()
            ),]
        ),
        (
            "Nuxt.js".to_string(),
            "Frontend Framework".to_string(),
            vec![TechPattern::HtmlContent(
                Regex::new(r"__NUXT__|_nuxt/").unwrap()
            ),]
        ),
        (
            "Angular".to_string(),
            "Frontend Framework".to_string(),
            vec![TechPattern::HtmlContent(
                Regex::new(r"ng-app|ng-controller").unwrap()
            ),]
        ),
        (
            "Svelte".to_string(),
            "Frontend Framework".to_string(),
            vec![TechPattern::HtmlContent(Regex::new(r"svelte").unwrap()),]
        ),
        (
            "Tailwind CSS".to_string(),
            "CSS Framework".to_string(),
            vec![TechPattern::HtmlContent(
                Regex::new(r#"class="[^"]*(?:flex|grid|mx-auto|p-\d+|text-|bg-)"#).unwrap()
            ),]
        ),
        (
            "Bootstrap".to_string(),
            "CSS Framework".to_string(),
            vec![
                TechPattern::ScriptContent(Regex::new(r"bootstrap(?:\.min)?\.js").unwrap()),
                TechPattern::HtmlContent(
                    Regex::new(r#"class="[^"]*(?:col-md|btn-primary|container-fluid)"#).unwrap()
                ),
            ]
        ),
        (
            "jQuery".to_string(),
            "JavaScript Library".to_string(),
            vec![TechPattern::ScriptContent(
                Regex::new(r"jquery(?:-\d+\.\d+\.\d+)?(?:\.min)?\.js").unwrap()
            ),]
        ),
    ];
}

enum TechPattern {
    ScriptContent(Regex),
    HtmlContent(Regex),
    MetaGenerator(Regex),
}

/// detect_technologies
pub fn detect_technologies(html: &str) -> Vec<Technology> {
    let mut technologies = HashSet::new();
    let document = Html::parse_document(html);

    for (name, category, patterns) in TECH_PATTERNS.iter() {
        for pattern in patterns {
            let detected = match pattern {
                TechPattern::ScriptContent(regex) => {
                    let script_selector = Selector::parse("script").unwrap();
                    document.select(&script_selector).any(|el| {
                        if let Some(src) = el.value().attr("src") {
                            regex.is_match(src)
                        } else {
                            regex.is_match(&el.inner_html())
                        }
                    })
                }
                TechPattern::HtmlContent(regex) => regex.is_match(html),
                TechPattern::MetaGenerator(regex) => {
                    let meta_selector = Selector::parse("meta[name='generator']").unwrap();
                    document.select(&meta_selector).any(|el| {
                        if let Some(content) = el.value().attr("content") {
                            regex.is_match(content)
                        } else {
                            false
                        }
                    })
                }
            };

            if detected {
                technologies.insert((name.clone(), category.clone()));
                break;
            }
        }
    }

    technologies
        .into_iter()
        .map(|(name, category)| Technology {
            name,
            category,
            version: None,
        })
        .collect()
}

/// audit_website
pub fn audit_website(html: &str, url: &str) -> AuditResult {
    let document = Html::parse_document(html);

    let technologies = detect_technologies(html);

    let title_selector = Selector::parse("title").unwrap();
    let page_title = document
        .select(&title_selector)
        .next()
        .map(|el| el.inner_html().trim().to_string());

    let meta_desc_selector = Selector::parse("meta[name='description']").unwrap();
    let meta_description = document
        .select(&meta_desc_selector)
        .next()
        .and_then(|el| el.value().attr("content"))
        .map(|s| s.to_string());

    let has_ssl = url.starts_with("https://");

    AuditResult {
        url: url.to_string(),
        technologies,
        has_ssl,
        page_title,
        meta_description,
        audited_at: chrono::Utc::now(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    /// test_detect_react
    fn test_detect_react() {
        let html = r#"<script src="/static/js/react.production.min.js"></script>"#;
        let techs = detect_technologies(html);
        assert!(techs.iter().any(|t| t.name == "React"));
    }

    #[test]
    /// test_detect_wordpress
    fn test_detect_wordpress() {
        let html = r#"<link rel="stylesheet" href="/wp-content/themes/mytheme/style.css">"#;
        let techs = detect_technologies(html);
        assert!(techs.iter().any(|t| t.name == "WordPress"));
    }

    #[test]
    /// test_audit_website
    fn test_audit_website() {
        let html = r#"
            <!DOCTYPE html>
            <html>
            <head>
                <title>Test Site</title>
                <meta name="description" content="A test website">
            </head>
            <body>
                <script src="/wp-content/plugins/test.js"></script>
            </body>
            </html>
        "#;
        let result = audit_website(html, "https://example.com");
        assert_eq!(result.page_title, Some("Test Site".to_string()));
        assert!(result.has_ssl);
        assert!(result.technologies.iter().any(|t| t.name == "WordPress"));
    }
}
