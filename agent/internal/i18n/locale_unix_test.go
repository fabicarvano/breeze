//go:build !windows && !darwin

package i18n

import "testing"

func TestOSLocalePrecedence(t *testing.T) {
	cases := []struct{ name, all, messages, lang, want string }{
		{"machine LANG", "", "", "pt_BR.UTF-8", "pt-BR"},
		{"message override", "", "en_US.UTF-8", "pt_BR.UTF-8", "en"},
		{"all override", "pt_BR.UTF-8", "en_US.UTF-8", "en_US.UTF-8", "pt-BR"},
		{"unsupported all falls back", "de_DE.UTF-8", "pt_BR.UTF-8", "pt_BR.UTF-8", "en"},
		{"unset falls back", "", "", "", "en"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("LC_ALL", tc.all)
			t.Setenv("LC_MESSAGES", tc.messages)
			t.Setenv("LANG", tc.lang)
			if got := NormalizeLocale(osLocale()); got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}
