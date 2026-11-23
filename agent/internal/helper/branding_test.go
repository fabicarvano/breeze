package helper

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"gopkg.in/yaml.v3"
)

func TestSanitizeBranding(t *testing.T) {
	cases := []struct {
		name, value string
		limit       int
		valid       bool
	}{
		{"unicode boundary", strings.Repeat("🙂", 60), 60, true},
		{"unicode too long", strings.Repeat("🙂", 61), 60, false},
		{"newline", "hello\nthere", 60, false}, {"C1", "a\u0085b", 60, false},
		{"bidi", "a\u202eb", 60, false}, {"invalid UTF8", string([]byte{255}), 60, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := validBrandingText(tc.value, tc.limit); got != tc.valid {
				t.Fatalf("got %v", got)
			}
		})
	}
	b := sanitizeBranding(&Branding{State: "set", ScopeID: "scope", Values: BrandingValues{DisplayName: "valid", WelcomeTitle: "bad\n", PrimaryColor: "#fff", AccentColor: "#Ab09EF"}})
	if b.Values.DisplayName != "valid" || b.Values.WelcomeTitle != "" || b.Values.PrimaryColor != "" || b.Values.AccentColor != "#Ab09EF" {
		t.Fatalf("%+v", b)
	}
}

func persistedBranding(t *testing.T, path string) *Branding {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		t.Fatal(err)
	}
	return cfg.Branding
}

func TestBrandingPersistenceAndScopes(t *testing.T) {
	dir := t.TempDir()
	paths := []string{filepath.Join(dir, "sessions", "1", "helper_config.yaml"), filepath.Join(dir, "sessions", "2", "helper_config.yaml")}
	for _, p := range paths {
		if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("show_tray_icon: true\nportal_url: https://example.test\n"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	m := &Manager{baseDir: dir, sessions: map[string]*sessionState{}}
	set := &Branding{State: "set", ScopeID: "a", Values: BrandingValues{DisplayName: "Acme", WelcomeTitle: "Welcome"}}
	if err := m.applyBrandingLocked(set); err != nil {
		t.Fatal(err)
	}
	// A restart with an older server retains the valid persisted identity.
	m = &Manager{baseDir: dir, sessions: map[string]*sessionState{}}
	if err := m.applyBrandingLocked(nil); err != nil {
		t.Fatal(err)
	}
	if m.branding == nil || m.branding.Values.DisplayName != "Acme" {
		t.Fatal("last known lost")
	}
	// A set replaces, rather than merging with the previous values.
	if err := m.applyBrandingLocked(&Branding{State: "set", ScopeID: "b", Values: BrandingValues{CompanyName: "Next"}}); err != nil {
		t.Fatal(err)
	}
	for _, p := range paths {
		b := persistedBranding(t, p)
		if b.ScopeID != "b" || b.Values.DisplayName != "" {
			t.Fatal("stale tenant value")
		}
	}
	if err := m.applyBrandingLocked(&Branding{State: "cleared", ScopeID: "b"}); err != nil {
		t.Fatal(err)
	}
	for _, p := range paths {
		if persistedBranding(t, p) != nil {
			t.Fatal("clear did not reach every session")
		}
		data, _ := os.ReadFile(p)
		if !strings.Contains(string(data), "portal_url: https://example.test") {
			t.Fatal("operational config lost")
		}
	}
	if err := m.applyBrandingLocked(set); err != nil {
		t.Fatal(err)
	}
	if err := ClearPersistedBranding(dir); err != nil {
		t.Fatal(err)
	}
	if err := m.applyBrandingLocked(nil); err != nil {
		t.Fatal(err)
	}
	if m.branding != nil {
		t.Fatal("live manager resurrected locally cleared branding")
	}
	for _, p := range paths {
		if persistedBranding(t, p) != nil {
			t.Fatal("enrollment reset failed")
		}
	}
}

func TestBrandingManagerConcurrent(t *testing.T) {
	m := &Manager{baseDir: t.TempDir(), sessions: map[string]*sessionState{}}
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			m.mu.Lock()
			defer m.mu.Unlock()
			if err := m.applyBrandingLocked(&Branding{State: "set", ScopeID: "a"}); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
}

func TestBrandingConfigComparison(t *testing.T) {
	s := newSessionState("1", t.TempDir())
	s.lastConfig = &Config{Branding: &Branding{State: "set", ScopeID: "a", Values: BrandingValues{DisplayName: "A"}}}
	if !s.configUnchanged(&Config{Branding: &Branding{State: "set", ScopeID: "a", Values: BrandingValues{DisplayName: "A"}}}) {
		t.Fatal("equal values changed")
	}
	if s.configUnchanged(&Config{Branding: &Branding{State: "set", ScopeID: "a", Values: BrandingValues{DisplayName: "B"}}}) {
		t.Fatal("brand update ignored")
	}
}

func TestBrandingDoesNotFollowConfigSymlinks(t *testing.T) {
	if testing.Short() {
		t.Skip("filesystem symlink test")
	}
	dir := t.TempDir()
	external := filepath.Join(t.TempDir(), "private.yaml")
	original := []byte("private: do-not-copy\n")
	if err := os.WriteFile(external, original, 0600); err != nil {
		t.Fatal(err)
	}
	session := filepath.Join(dir, "sessions", "1")
	if err := os.MkdirAll(session, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(external, filepath.Join(session, "helper_config.yaml")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if err := ClearPersistedBranding(dir); err == nil {
		t.Fatal("symlink accepted")
	}
	data, _ := os.ReadFile(external)
	if string(data) != string(original) {
		t.Fatal("external file changed")
	}
	// Predictable old temporary names cannot redirect the new exclusive writer.
	if err := os.Remove(filepath.Join(session, "helper_config.yaml")); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(session, "helper_config.yaml")
	if err := os.WriteFile(path, []byte("show_tray_icon: true\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(external, path+".branding.tmp"); err != nil {
		t.Fatal(err)
	}
	if err := rewriteBranding(path, &Branding{State: "set", ScopeID: "a"}); err != nil {
		t.Fatal(err)
	}
	data, _ = os.ReadFile(external)
	if string(data) != string(original) {
		t.Fatal("temporary symlink followed")
	}
}

func TestBrandingScopePersistenceFailureStopsLiveHelper(t *testing.T) {
	var calls ownershipCalls
	fixture := newOwnershipFixture(t, true)
	stubMachineSeams(t, &calls, fixture.binaryPath)
	mgr := newOwnershipManager(t, fixture, &calls, WithMachineInstallOwner(true))
	mgr.brandingLoaded = true
	mgr.branding = &Branding{State: "set", ScopeID: "old"}
	state := newSessionState("1", fixture.baseDir)
	state.spawnedPID = 123
	state.lastConfig = &Config{Branding: mgr.branding}
	mgr.sessions["1"] = state
	if err := os.WriteFile(fixture.sessionConfig, []byte("broken: [\n"), 0600); err != nil {
		t.Fatal(err)
	}
	mgr.Apply(&Settings{Enabled: true, Branding: &Branding{State: "set", ScopeID: "new"}})
	if calls.stop == 0 || calls.spawn != 0 || mgr.branding != nil || state.lastConfig != nil {
		t.Fatalf("unsafe state after failed scope clear: stops=%d spawns=%d branding=%v config=%v", calls.stop, calls.spawn, mgr.branding, state.lastConfig)
	}
	mgr.mu.Lock()
	err := mgr.ensureRunningSession(state)
	mgr.mu.Unlock()
	if err == nil || calls.spawn != 0 {
		t.Fatalf("background lifecycle respawned unsafe helper: error=%v spawns=%d", err, calls.spawn)
	}
	if err := os.WriteFile(fixture.sessionConfig, []byte("show_tray_icon: true\n"), 0600); err != nil {
		t.Fatal(err)
	}
	mgr.Apply(&Settings{Enabled: false, Branding: &Branding{State: "set", ScopeID: "new"}})
	if mgr.brandingBlocked {
		t.Fatal("successful safe settings did not unblock helper lifecycle")
	}
}

func TestBrandingEnrollmentGenerationRejectsOldManager(t *testing.T) {
	var calls ownershipCalls
	fixture := newOwnershipFixture(t, true)
	stubMachineSeams(t, &calls, fixture.binaryPath)
	mgr := newOwnershipManager(t, fixture, &calls, WithMachineInstallOwner(true))
	mgr.brandingLoaded = true
	mgr.branding = &Branding{State: "set", ScopeID: "old"}
	state := newSessionState("1", fixture.baseDir)
	state.spawnedPID = 123
	state.lastConfig = &Config{Branding: mgr.branding}
	mgr.sessions["1"] = state
	if err := rewriteBranding(fixture.sessionConfig, mgr.branding); err != nil {
		t.Fatal(err)
	}
	if err := ResetPersistedBranding(fixture.baseDir); err != nil {
		t.Fatal(err)
	}
	mgr.Apply(&Settings{Enabled: true, Branding: &Branding{State: "set", ScopeID: "old"}})
	if calls.stop == 0 || calls.spawn != 0 || mgr.branding != nil {
		t.Fatalf("old manager resumed after reset: %+v", calls)
	}
	mgr.mu.Lock()
	spawnErr := mgr.ensureRunningSession(state)
	mgr.mu.Unlock()
	if spawnErr == nil || calls.spawn != 0 {
		t.Fatalf("old manager background lifecycle resumed after reset: error=%v spawns=%d", spawnErr, calls.spawn)
	}
	data, _, err := readBrandingConfig(fixture.sessionConfig)
	if err != nil {
		t.Fatal(err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		t.Fatal(err)
	}
	if cfg.Branding != nil {
		t.Fatal("old manager restored branding")
	}
	fresh := New(context.Background(), nil, nil, "test", func(m *Manager) { m.baseDir = fixture.baseDir })
	fresh.mu.Lock()
	err = fresh.applyBrandingLocked(&Branding{State: "set", ScopeID: "new"})
	fresh.mu.Unlock()
	if err != nil || fresh.branding == nil || fresh.branding.ScopeID != "new" {
		t.Fatalf("fresh manager rejected new scope: %v", err)
	}
}

func TestBrandingEnrollmentResetFailureIsClosed(t *testing.T) {
	base := t.TempDir()
	path := filepath.Join(base, "helper_config.yaml")
	if err := os.WriteFile(path, []byte("broken: ["), 0600); err != nil {
		t.Fatal(err)
	}
	if err := ResetPersistedBranding(base); err == nil {
		t.Fatal("corrupt reset accepted")
	}
	if generation, err := readBrandingGeneration(base); err != nil || generation == "" {
		t.Fatalf("reset did not invalidate old managers: %q %v", generation, err)
	}
}

type brandingResetEnumerator struct {
	reset    func()
	sessions []SessionInfo
}

func (e *brandingResetEnumerator) ActiveSessions() []SessionInfo {
	if e.reset != nil {
		reset := e.reset
		e.reset = nil
		reset()
	}
	return e.sessions
}

func TestBrandingEnrollmentResetDuringApplyStopsActiveChat(t *testing.T) {
	var calls ownershipCalls
	fixture := newOwnershipFixture(t, true)
	stubMachineSeams(t, &calls, fixture.binaryPath)
	mgr := newOwnershipManager(t, fixture, &calls, WithMachineInstallOwner(true))
	mgr.brandingLoaded = true
	mgr.branding = &Branding{State: "set", ScopeID: "old", Values: BrandingValues{DisplayName: "Old tenant"}}
	state := newSessionState("1", fixture.baseDir)
	state.spawnedPID = 123
	state.lastConfig = &Config{Branding: mgr.branding}
	state.pendingConfigRestart = true
	mgr.sessions["1"] = state
	for _, path := range []string{fixture.sessionConfig, fixture.legacyConfig} {
		if err := rewriteBranding(path, mgr.branding); err != nil {
			t.Fatal(err)
		}
	}
	status, err := yaml.Marshal(Status{ChatActive: true, LastActivity: time.Now()})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(statusPathFrom(state.configPath), status, 0600); err != nil {
		t.Fatal(err)
	}
	if IsIdle(state.configPath) {
		t.Fatal("fixture must exercise active-chat restart deferral")
	}
	mgr.sessionEnumerator = &brandingResetEnumerator{sessions: []SessionInfo{{Key: "1", Username: "alice", UID: 501}}, reset: func() {
		if err := ResetPersistedBranding(fixture.baseDir); err != nil {
			t.Fatal(err)
		}
	}}
	mgr.Apply(&Settings{Enabled: true, ShowTrayIcon: true, Branding: mgr.branding})
	if calls.stop == 0 || calls.spawn != 0 || !mgr.brandingBlocked || mgr.branding != nil || state.lastConfig != nil {
		t.Fatalf("unsafe identity after mid-Apply enrollment: calls=%+v blocked=%v brand=%v config=%v", calls, mgr.brandingBlocked, mgr.branding, state.lastConfig)
	}
	for _, path := range []string{fixture.sessionConfig, fixture.legacyConfig} {
		if persistedBranding(t, path) != nil {
			t.Fatalf("old branding restored after enrollment: %s", path)
		}
	}
	mgr.mu.Lock()
	err = mgr.ensureRunningSession(state)
	mgr.mu.Unlock()
	if err == nil || calls.spawn != 0 {
		t.Fatalf("background resumed invalid manager: %v spawns=%d", err, calls.spawn)
	}
}
