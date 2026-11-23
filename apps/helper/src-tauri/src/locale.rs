//! Resolve language in the interactive Helper process, never the machine agent.
pub fn normalize(value: &str) -> &'static str {
    let value = value.to_ascii_lowercase().replace('_', "-");
    if matches!(value.split(['.', '@', ':']).next(), Some("pt-br" | "pt")) {
        "pt-BR"
    } else {
        "en"
    }
}

// LANGID is UI language, independent of regional date/number preferences.
#[cfg(any(target_os = "windows", test))]
fn from_windows_ui_language(language: u16) -> &'static str {
    if language == 0x0416 {
        "pt-BR"
    } else {
        "en"
    }
}

pub fn current() -> &'static str {
    // User UI language is stable for this process. In particular, avoid
    // spawning defaults for every translated string and each refresh tick.
    static LOCALE: std::sync::OnceLock<&'static str> = std::sync::OnceLock::new();
    LOCALE.get_or_init(detect_locale)
}

fn detect_locale() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::RemoteDesktop::ProcessIdToSessionId;
        use windows::Win32::{
            Foundation::{CloseHandle, HANDLE},
            Globalization::GetUserDefaultUILanguage,
            Security::{ImpersonateLoggedOnUser, RevertToSelf},
            System::{RemoteDesktop::WTSQueryUserToken, Threading::GetCurrentProcessId},
        };
        // SYSTEM-launched Helpers must read the interactive user's profile,
        // not SYSTEM's locale. Use this process's session (also correct on RDS).
        struct UserContext {
            token: HANDLE,
            impersonated: bool,
        }
        impl Drop for UserContext {
            fn drop(&mut self) {
                unsafe {
                    // Continuing on a worker thread with the wrong security
                    // context is unsafe. Never let failed cleanup leak it.
                    if self.impersonated && RevertToSelf().is_err() {
                        std::process::abort();
                    }
                    if !self.token.is_invalid() {
                        let _ = CloseHandle(self.token);
                    }
                }
            }
        }
        let mut session = 0;
        let mut token = HANDLE::default();
        let impersonated = unsafe {
            ProcessIdToSessionId(GetCurrentProcessId(), &mut session).is_ok()
                && WTSQueryUserToken(session, &mut token).is_ok()
                && ImpersonateLoggedOnUser(token).is_ok()
        };
        let context = UserContext {
            token,
            impersonated,
        };
        let language = unsafe { GetUserDefaultUILanguage() };
        drop(context);
        return from_windows_ui_language(language);
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(result) = std::process::Command::new("/usr/bin/defaults")
            .args(["read", "-g", "AppleLanguages"])
            .output()
        {
            if result.status.success() {
                let output = String::from_utf8_lossy(&result.stdout);
                let first = output
                    .split(|c: char| c.is_whitespace() || matches!(c, '(' | ')' | ',' | '\"'))
                    .find(|s| !s.is_empty())
                    .unwrap_or("en");
                return normalize(first);
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        for name in ["LC_ALL", "LC_MESSAGES", "LANGUAGE", "LANG"] {
            if let Ok(value) = std::env::var(name) {
                if !value.is_empty() {
                    return normalize(&value);
                }
            }
        }
        "en"
    }
}

pub fn text<'a>(en: &'a str, pt: &'a str) -> &'a str {
    if current() == "pt-BR" {
        pt
    } else {
        en
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_ui_language_uses_brazilian_portuguese_id_only() {
        assert_eq!(from_windows_ui_language(0x0416), "pt-BR");
        assert_eq!(from_windows_ui_language(0x0816), "en");
        assert_eq!(from_windows_ui_language(0x0409), "en");
        assert_eq!(from_windows_ui_language(0), "en");
    }
    #[test]
    fn locale_fallback_is_deterministic() {
        assert_eq!(normalize("pt_BR.UTF-8"), "pt-BR");
        assert_eq!(normalize("pt"), "pt-BR");
        assert_eq!(normalize("pt-BR"), "pt-BR");
        assert_eq!(normalize("pt-PT"), "en");
        assert_eq!(normalize("xx-XX"), "en");
    }
}
