// Package i18n localizes display-facing copy only. API paths, service names,
// IPC values, action IDs, diagnostics and server-provided text remain stable.
package i18n

import (
	"fmt"
	"strings"
	"sync"
)

var localeOnce sync.Once
var currentLocale string

// NormalizeLocale accepts OS forms (pt_BR.UTF-8, pt-BR, pt) and deterministically
// falls back to English for unavailable catalogs.
func NormalizeLocale(locale string) string {
	locale = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(locale), "_", "-"))
	locale = strings.Split(strings.Split(locale, ".")[0], "@")[0]
	if locale == "pt" || locale == "pt-br" {
		return "pt-BR"
	}
	return "en"
}

// Locale is determined in this process's OS/user context, never by a remote
// payload. Helper processes consequently resolve their own interactive user.
func Locale() string {
	localeOnce.Do(func() { currentLocale = NormalizeLocale(osLocale()) })
	return currentLocale
}

// Text uses the English source as the catalog key; missing translations retain
// that exact English source. This avoids changing existing diagnostic identity.
func Text(english string) string { return ForLocale(Locale(), english) }
func ForLocale(locale, english string) string {
	if NormalizeLocale(locale) == "pt-BR" {
		if value, ok := ptBR[english]; ok {
			return value
		}
	}
	return english
}
func Format(english string, args ...any) string { return fmt.Sprintf(Text(english), args...) }
