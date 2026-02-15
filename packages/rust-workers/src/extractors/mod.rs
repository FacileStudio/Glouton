pub mod email;
pub mod phone;

pub use email::{extract_emails, is_generic_email};
pub use phone::extract_phones;
