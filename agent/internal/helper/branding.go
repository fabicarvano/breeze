package helper

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"gopkg.in/yaml.v3"
)

// Branding is the effective server-resolved identity. Missing is deliberately
// different from cleared, so older servers do not erase offline identity.
type Branding struct {
	State   string         `json:"state" yaml:"state"`
	ScopeID string         `json:"scopeId" yaml:"scopeId"`
	Values  BrandingValues `json:"values,omitempty" yaml:"values,omitempty"`
}

// BrandingValues is a closed text/semantic-colour contract. No markup, URLs,
// native assets or consent wording is accepted here.
type BrandingValues struct {
	DisplayName    string `json:"displayName,omitempty" yaml:"displayName,omitempty"`
	CompanyName    string `json:"companyName,omitempty" yaml:"companyName,omitempty"`
	WelcomeTitle   string `json:"welcomeTitle,omitempty" yaml:"welcomeTitle,omitempty"`
	WelcomeMessage string `json:"welcomeMessage,omitempty" yaml:"welcomeMessage,omitempty"`
	SupportLabel   string `json:"supportLabel,omitempty" yaml:"supportLabel,omitempty"`
	PortalLabel    string `json:"portalLabel,omitempty" yaml:"portalLabel,omitempty"`
	PrimaryColor   string `json:"primaryColor,omitempty" yaml:"primaryColor,omitempty"`
	AccentColor    string `json:"accentColor,omitempty" yaml:"accentColor,omitempty"`
}

var brandingHex = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func validBrandingText(s string, limit int) bool {
	if !utf8.ValidString(s) || utf8.RuneCountInString(s) > limit {
		return false
	}
	for _, r := range s {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) || r == '\u2028' || r == '\u2029' {
			return false
		}
	}
	return true
}

// sanitizeBranding drops invalid individual fields to the localized Breeze
// defaults; it never retains a previous value for an absent field in a set.
func sanitizeBranding(b *Branding) *Branding {
	if b == nil || b.State != "set" || b.ScopeID == "" || !validBrandingText(b.ScopeID, 256) {
		return nil
	}
	copy := *b
	fields := []struct {
		value *string
		limit int
	}{
		{&copy.Values.DisplayName, 60}, {&copy.Values.CompanyName, 60},
		{&copy.Values.WelcomeTitle, 120}, {&copy.Values.WelcomeMessage, 500},
		{&copy.Values.SupportLabel, 40}, {&copy.Values.PortalLabel, 40},
	}
	for _, f := range fields {
		if !validBrandingText(*f.value, f.limit) || strings.TrimSpace(*f.value) == "" {
			*f.value = ""
		}
	}
	for _, v := range []*string{&copy.Values.PrimaryColor, &copy.Values.AccentColor} {
		if *v != "" && !brandingHex.MatchString(*v) {
			*v = ""
		}
	}
	return &copy
}

func brandingConfigPaths(baseDir string) ([]string, error) {
	var paths []string
	sessions := filepath.Join(baseDir, "sessions")
	if info, err := os.Lstat(sessions); err == nil {
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return nil, fmt.Errorf("unsafe helper sessions directory")
		}
		entries, err := os.ReadDir(sessions)
		if err != nil {
			return nil, err
		}
		for _, entry := range entries {
			if entry.Type()&os.ModeSymlink != 0 || !entry.IsDir() {
				continue
			} // Never follow user-supplied directory symlinks.
			path := filepath.Join(sessions, entry.Name(), "helper_config.yaml")
			if info, err := os.Lstat(path); err == nil {
				if !info.Mode().IsRegular() {
					return nil, fmt.Errorf("unsafe helper config file")
				}
				paths = append(paths, path)
			} else if !os.IsNotExist(err) {
				return nil, err
			}
		}
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	legacy := filepath.Join(baseDir, "helper_config.yaml")
	if info, err := os.Lstat(legacy); err == nil {
		if !info.Mode().IsRegular() {
			return nil, fmt.Errorf("unsafe legacy helper config")
		}
		paths = append(paths, legacy)
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	return paths, nil
}

// Pin the file identity before reading; a user replacing it with a symlink
// cannot make the agent copy a privileged file into their session directory.
func readBrandingConfig(path string) ([]byte, os.FileInfo, error) {
	expected, err := os.Lstat(path)
	if err != nil {
		return nil, nil, err
	}
	if !expected.Mode().IsRegular() {
		return nil, nil, fmt.Errorf("unsafe helper config file")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, nil, err
	}
	if !os.SameFile(expected, info) {
		return nil, nil, fmt.Errorf("helper config changed during read")
	}
	const limit = 1024 * 1024
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if len(data) > limit {
		return nil, nil, fmt.Errorf("helper config exceeds size limit")
	}
	return data, info, err
}

// rewriteBranding preserves operational and unknown YAML keys while changing
// only identity. Existing files are never deleted on a normal branding reset.
func rewriteBranding(path string, b *Branding) error {
	data, info, err := readBrandingConfig(path)
	if err != nil {
		return err
	}
	var doc map[string]any
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return fmt.Errorf("decode helper config: %w", err)
	}
	if doc == nil {
		doc = map[string]any{}
	}
	delete(doc, "branding")
	if b != nil {
		doc["branding"] = b
	}
	data, err = yaml.Marshal(doc)
	if err != nil {
		return err
	}
	// Exclusive, unpredictable temporary file: user-controlled .tmp symlinks
	// must never be followed by this privileged writer.
	file, err := os.CreateTemp(filepath.Dir(path), ".helper-branding-*")
	if err != nil {
		return err
	}
	tmp := file.Name()
	defer os.Remove(tmp)
	defer file.Close()
	if err := file.Chmod(info.Mode().Perm()); err != nil {
		return err
	}
	if err := preserveBrandingOwner(file, info); err != nil {
		return err
	}
	if _, err := file.Write(data); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// ClearPersistedBranding is called locally on enrollment, independently of
// control-plane reachability. Fail closed before accepting a new identity.
func ClearPersistedBranding(baseDir string) error {
	paths, err := brandingConfigPaths(baseDir)
	if err != nil {
		return err
	}
	var errs []error
	for _, path := range paths {
		if err := rewriteBranding(path, nil); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// Caller holds m.mu. Every session is updated, including logged-off/RDS users.
func (m *Manager) applyBrandingLocked(incoming *Branding) (result error) {
	if err := m.checkBrandingGeneration(); err != nil {
		return err
	}
	defer func() {
		if err := m.checkBrandingGeneration(); err != nil {
			result = errors.Join(result, err, ClearPersistedBranding(m.baseDir))
		}
	}()
	paths, err := brandingConfigPaths(m.baseDir)
	if err != nil {
		return err
	}
	// A concurrent enrollment command clears the files while this Manager may
	// still be running. On an omitted block, disk remains the source of truth:
	// never resurrect an identity that enrollment removed locally.
	if incoming == nil {
		m.branding = nil
		m.brandingLoaded = false
	}
	if !m.brandingLoaded {
		for _, path := range paths {
			data, _, err := readBrandingConfig(path)
			if err != nil {
				return err
			}
			var cfg Config
			if err := yaml.Unmarshal(data, &cfg); err != nil {
				return err
			}
			b := sanitizeBranding(cfg.Branding)
			if b == nil {
				continue
			}
			if m.branding != nil && m.branding.ScopeID != b.ScopeID {
				if err := ClearPersistedBranding(m.baseDir); err != nil {
					return err
				}
				m.branding = nil
				break
			}
			m.branding = b
		}
		m.brandingLoaded = true
	}
	if incoming == nil {
		for _, state := range m.sessions {
			if state.lastConfig != nil {
				state.lastConfig.Branding = m.branding
			}
		}
		return nil
	}
	if incoming.State != "set" && incoming.State != "cleared" {
		return nil
	}
	if incoming.ScopeID == "" || !validBrandingText(incoming.ScopeID, 256) {
		return nil
	}
	next := sanitizeBranding(incoming)
	// Clear old scope first; a failed replacement can never leave another tenant's identity.
	if incoming.State == "cleared" || (m.branding != nil && incoming.ScopeID != m.branding.ScopeID) {
		if err := ClearPersistedBranding(m.baseDir); err != nil {
			return err
		}
		m.branding = nil
		for _, state := range m.sessions {
			if state.lastConfig != nil {
				state.lastConfig.Branding = nil
			}
		}
	}
	if reflect.DeepEqual(m.branding, next) {
		return nil
	}
	for _, path := range paths {
		if err := rewriteBranding(path, next); err != nil {
			return err
		}
	}
	m.branding = next
	for _, state := range m.sessions {
		if state.lastConfig != nil {
			state.lastConfig.Branding = next
		}
	}
	return nil
}

// Stop every discovered session before returning a persistence failure. A
// corrupt/unwritable file must not leave a prior tenant's Helper running.
func (m *Manager) stopForBrandingFailureLocked() {
	m.brandingBlocked = true
	m.branding = nil
	m.brandingLoaded = false
	if m.sessions == nil {
		m.sessions = make(map[string]*sessionState)
	}
	if m.sessionEnumerator != nil {
		for _, si := range m.sessionEnumerator.ActiveSessions() {
			if m.sessions[si.Key] == nil {
				m.sessions[si.Key] = newSessionState(si.Key, m.baseDir)
			}
		}
	}
	if entries, err := os.ReadDir(filepath.Join(m.baseDir, "sessions")); err == nil {
		for _, entry := range entries {
			if entry.Type()&os.ModeSymlink == 0 && entry.IsDir() && m.sessions[entry.Name()] == nil {
				m.sessions[entry.Name()] = newSessionState(entry.Name(), m.baseDir)
			}
		}
	}
	for _, state := range m.sessions {
		state.lastConfig = nil
		m.stopSessionWatcher(state)
		state.refreshPID()
		if err := m.ensureStoppedSession(state); err != nil {
			log.Error("failed to stop helper with unsafe branding", "session", state.key, "error", err.Error())
		}
	}
}

// Enrollment reset invalidates an already-running Manager without changing
// operational enrollment/service contracts. Scope clears do not change this.
func ResetPersistedBranding(baseDir string) error {
	path := filepath.Join(baseDir, "helper_branding_generation")
	if _, err := readBrandingGeneration(baseDir); err != nil {
		return err
	}
	if err := os.MkdirAll(baseDir, 0700); err != nil {
		return err
	}
	generation := make([]byte, 32)
	if _, err := rand.Read(generation); err != nil {
		return err
	}
	file, err := os.CreateTemp(baseDir, ".helper-branding-generation-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if _, err := file.WriteString(hex.EncodeToString(generation)); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(file.Name(), path); err != nil {
		return err
	}
	return ClearPersistedBranding(baseDir)
}

func readBrandingGeneration(baseDir string) (string, error) {
	path := filepath.Join(baseDir, "helper_branding_generation")
	if _, err := os.Lstat(path); os.IsNotExist(err) {
		return "", nil
	}
	data, _, err := readBrandingConfig(path)
	if err != nil {
		return "", err
	}
	if len(data) != 64 {
		return "", errors.New("invalid helper branding generation")
	}
	if _, err := hex.DecodeString(string(data)); err != nil {
		return "", errors.New("invalid helper branding generation")
	}
	return string(data), nil
}

func (m *Manager) checkBrandingGeneration() error {
	if m.brandingGenerationErr != nil {
		return m.brandingGenerationErr
	}
	generation, err := readBrandingGeneration(m.baseDir)
	if err != nil {
		return err
	}
	if generation != m.brandingGeneration {
		return errors.New("helper branding reset requires agent restart")
	}
	return nil
}

// Caller holds m.mu. Enrollment can invalidate identity during enumeration,
// config writes, installation, or a restart; check again before unlocking.
func (m *Manager) finishBrandingLifecycleLocked() {
	if err := m.checkBrandingGeneration(); err != nil {
		clearErr := ClearPersistedBranding(m.baseDir)
		m.stopForBrandingFailureLocked()
		log.Error("helper identity changed during lifecycle; helper stopped until agent restart", "error", errors.Join(err, clearErr).Error())
	}
}
