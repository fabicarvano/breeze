package i18n

import (
	"fmt"
	"regexp"
	"testing"
)

func TestLocaleResolutionAndFallback(t *testing.T) {
	cases := []struct{ input, want string }{{"pt_BR.UTF-8", "pt-BR"}, {"pt-BR", "pt-BR"}, {"pt", "pt-BR"}, {"en_US.UTF-8", "en"}, {"de-DE", "en"}, {"pt-PT", "en"}, {"C", "en"}, {"", "en"}}
	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			if got := NormalizeLocale(tc.input); got != tc.want {
				t.Fatalf("%q", got)
			}
		})
	}
	if got := ForLocale("pt_BR", "Allow"); got != "Permitir" {
		t.Fatal(got)
	}
	if got := ForLocale("fr", "Allow"); got != "Allow" {
		t.Fatal(got)
	}
	if got := ForLocale("pt_BR", "machine_identifier"); got != "machine_identifier" {
		t.Fatal(got)
	}
}

func TestCatalogPreservesFormatPlaceholders(t *testing.T) {
	// Compare ordered verbs: passing translated copy to fmt must never change
	// which typed argument is displayed.
	verbs := regexp.MustCompile(`%[-+# 0]*[0-9]*(?:\.[0-9]+)?[a-zA-Z%]`)
	for english, translated := range ptBR {
		if fmt.Sprint(verbs.FindAllString(english, -1)) != fmt.Sprint(verbs.FindAllString(translated, -1)) {
			t.Errorf("format mismatch for %q", english)
		}
	}
}
