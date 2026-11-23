//! Closed runtime display contract. No credentials or consent prose belong here.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrandingValues {
    pub display_name: Option<String>,
    pub company_name: Option<String>,
    pub welcome_title: Option<String>,
    pub welcome_message: Option<String>,
    pub support_label: Option<String>,
    pub portal_label: Option<String>,
    pub primary_color: Option<String>,
    pub accent_color: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branding {
    pub state: String,
    pub scope_id: String,
    #[serde(default)]
    pub values: BrandingValues,
}

// Unicode Cc/Cf and line/paragraph separators. Rust strings cannot contain Cs.
fn unsafe_text_character(c: char) -> bool {
    c.is_control()
        || matches!(c as u32,
        0x00AD | 0x0600..=0x0605 | 0x061C | 0x06DD | 0x070F |
        0x0890..=0x0891 | 0x08E2 | 0x180E | 0x200B..=0x200F |
        0x2028..=0x202E | 0x2060..=0x2064 | 0x2066..=0x206F |
        0xFEFF | 0xFFF9..=0xFFFB | 0x110BD | 0x110CD |
        0x13430..=0x1343F | 0x1BCA0..=0x1BCA3 | 0x1D173..=0x1D17A |
        0xE0001 | 0xE0020..=0xE007F)
}

pub fn validate(input: Option<Branding>) -> Option<Branding> {
    let mut branding = input?;
    if branding.state != "set"
        || branding.scope_id.is_empty()
        || branding.scope_id.chars().count() > 256
        || branding.scope_id.chars().any(unsafe_text_character)
    {
        return None;
    }
    let v = &mut branding.values;
    for (field, max) in [
        (&mut v.display_name, 60),
        (&mut v.company_name, 60),
        (&mut v.welcome_title, 120),
        (&mut v.welcome_message, 500),
        (&mut v.support_label, 40),
        (&mut v.portal_label, 40),
    ] {
        if field.as_ref().is_some_and(|s| {
            s.trim().is_empty() || s.chars().count() > max || s.chars().any(unsafe_text_character)
        }) {
            *field = None;
        }
    }
    for field in [&mut v.primary_color, &mut v.accent_color] {
        if field.as_ref().is_some_and(|s| {
            s.len() != 7
                || !s.starts_with('#')
                || !s.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
        }) {
            *field = None;
        }
    }
    Some(branding)
}

pub fn display_name(branding: Option<&Branding>) -> &str {
    branding
        .and_then(|b| b.values.display_name.as_deref())
        .unwrap_or("Breeze Helper")
}

#[cfg(test)]
mod tests {
    use super::*;
    fn branding(values: BrandingValues) -> Branding {
        Branding {
            state: "set".into(),
            scope_id: "scope".into(),
            values,
        }
    }
    #[test]
    fn validates_fields_independently_and_counts_codepoints() {
        let result = validate(Some(branding(BrandingValues {
            display_name: Some("é".repeat(60)),
            company_name: Some("é".repeat(61)),
            welcome_message: Some("hello\nworld".into()),
            primary_color: Some("#12abEF".into()),
            accent_color: Some("rgb(1,2,3)".into()),
            ..Default::default()
        })))
        .unwrap();
        assert!(result.values.display_name.is_some());
        assert!(result.values.company_name.is_none());
        assert!(result.values.welcome_message.is_none());
        assert_eq!(result.values.primary_color.as_deref(), Some("#12abEF"));
        assert!(result.values.accent_color.is_none());
    }
    #[test]
    fn typed_invalid_field_does_not_discard_valid_neighbors() {
        let yaml: serde_yaml::Value = serde_yaml::from_str("state: set\nscopeId: scope\nvalues:\n  displayName: Example\n  supportLabel: 123\n  customCss: unsafe\n").unwrap();
        let result = from_yaml(Some(&yaml)).unwrap();
        assert_eq!(result.values.display_name.as_deref(), Some("Example"));
        assert!(result.values.support_label.is_none());
        assert!(!serde_json::to_string(&result)
            .unwrap()
            .contains("customCss"));
    }
    #[test]
    fn exact_color_shape_and_controls_are_required() {
        for invalid in ["#fff", "#12345678", "#12345g", "red", "#12345é"] {
            let result = validate(Some(branding(BrandingValues {
                primary_color: Some(invalid.into()),
                ..Default::default()
            })))
            .unwrap();
            assert!(result.values.primary_color.is_none());
        }
        for invalid in [
            "\u{0000}", "\u{007f}", "\u{0085}", "\u{2028}", "\u{2029}", "\u{202e}", "\u{200b}",
        ] {
            let result = validate(Some(branding(BrandingValues {
                support_label: Some(invalid.into()),
                ..Default::default()
            })))
            .unwrap();
            assert!(result.values.support_label.is_none());
        }
    }
    #[test]
    fn defaults_for_missing_cleared_or_invalid_scope() {
        assert!(validate(None).is_none());
        let mut b = branding(Default::default());
        b.state = "cleared".into();
        assert!(validate(Some(b)).is_none());
        assert_eq!(display_name(None), "Breeze Helper");
    }
}

pub fn from_yaml(input: Option<&serde_yaml::Value>) -> Option<Branding> {
    let b = input?;
    let values = b.get("values")?;
    let text = |key| {
        values
            .get(key)
            .and_then(serde_yaml::Value::as_str)
            .map(str::to_owned)
    };
    validate(Some(Branding {
        state: b.get("state")?.as_str()?.into(),
        scope_id: b.get("scopeId")?.as_str()?.into(),
        values: BrandingValues {
            display_name: text("displayName"),
            company_name: text("companyName"),
            welcome_title: text("welcomeTitle"),
            welcome_message: text("welcomeMessage"),
            support_label: text("supportLabel"),
            portal_label: text("portalLabel"),
            primary_color: text("primaryColor"),
            accent_color: text("accentColor"),
        },
    }))
}

/// Cache only validated display values, never enrollment credentials. Failed
/// reads during atomic replacement or an outage retain the last good snapshot.
#[derive(Default)]
struct BrandingReader {
    path: Option<std::path::PathBuf>,
    branding: Option<Branding>,
}

impl BrandingReader {
    fn read(&mut self, path: &std::path::Path) -> Option<Branding> {
        if self.path.as_deref() != Some(path) {
            self.path = Some(path.to_owned());
            self.branding = None;
        }
        if let Ok(contents) = std::fs::read_to_string(path) {
            if let Ok(yaml) = serde_yaml::from_str::<serde_yaml::Value>(&contents) {
                // A successful read without branding is an authoritative clear.
                self.branding = from_yaml(yaml.get("branding"));
            }
        }
        self.branding.clone()
    }
}

pub fn read(path: &std::path::Path) -> Option<Branding> {
    static READER: std::sync::OnceLock<std::sync::Mutex<BrandingReader>> =
        std::sync::OnceLock::new();
    READER
        .get_or_init(|| std::sync::Mutex::new(BrandingReader::default()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .read(path)
}

#[cfg(test)]
mod reader_tests {
    use super::*;
    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            static ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!(
                "helper-branding-reader-{}-{}",
                std::process::id(),
                ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        fn path(&self) -> std::path::PathBuf {
            self.0.join("helper_config.yaml")
        }
        fn write(&self, text: &str) {
            std::fs::write(self.path(), text).unwrap();
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    const SET: &str =
        "branding:\n  state: set\n  scopeId: scope-a\n  values:\n    displayName: Example\n";
    #[test]
    fn read_failures_retain_last_good_and_successful_absence_clears() {
        let fixture = Fixture::new();
        let mut reader = BrandingReader::default();
        assert!(reader.read(&fixture.path()).is_none());
        fixture.write(SET);
        let initial = reader.read(&fixture.path()).unwrap();
        fixture.write("branding: [invalid");
        assert_eq!(reader.read(&fixture.path()), Some(initial.clone()));
        std::fs::remove_file(fixture.path()).unwrap();
        assert_eq!(reader.read(&fixture.path()), Some(initial));
        fixture.write("show_tray_icon: true\n");
        assert!(reader.read(&fixture.path()).is_none());
        std::fs::remove_file(fixture.path()).unwrap();
        assert!(reader.read(&fixture.path()).is_none());
    }
    #[test]
    fn explicit_clear_and_path_switch_never_reuse_other_sessions_brand() {
        let fixture = Fixture::new();
        let other = Fixture::new();
        let mut reader = BrandingReader::default();
        fixture.write(SET);
        assert!(reader.read(&fixture.path()).is_some());
        assert!(reader.read(&other.path()).is_none());
        assert!(reader.read(&fixture.path()).is_some());
        fixture.write("branding:\n  state: cleared\n  scopeId: scope-a\n");
        assert!(reader.read(&fixture.path()).is_none());
    }
    #[test]
    fn unreadable_config_retains_but_valid_yaml_invalid_brand_clears() {
        let fixture = Fixture::new();
        let mut reader = BrandingReader::default();
        fixture.write(SET);
        let initial = reader.read(&fixture.path());
        std::fs::remove_file(fixture.path()).unwrap();
        std::fs::create_dir(fixture.path()).unwrap();
        assert_eq!(reader.read(&fixture.path()), initial);
        std::fs::remove_dir(fixture.path()).unwrap();
        fixture.write("branding:\n  state: set\n  values: {}\n");
        assert!(reader.read(&fixture.path()).is_none());
    }
}
