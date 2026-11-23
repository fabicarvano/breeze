package agentapp

import (
	"bytes"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func TestCommandHelpLocale(t *testing.T) {
	for _, locale := range []string{"en", "pt-BR", "de-DE"} {
		t.Run(locale, func(t *testing.T) {
			command := &cobra.Command{Use: "breeze-agent", Run: func(*cobra.Command, []string) {}}
			command.Flags().String("server", "", "Server URL")
			command.InitDefaultHelpFlag()
			localizeCommandHelp(command, locale)
			var out bytes.Buffer
			command.SetOut(&out)
			if err := command.Help(); err != nil {
				t.Fatal(err)
			}
			text := out.String()
			for _, token := range []string{"breeze-agent", "--server", "--help"} {
				if !strings.Contains(text, token) {
					t.Fatalf("missing command token %q: %s", token, text)
				}
			}
			usage, flags, help := "Usage:", "Flags:", "help for breeze-agent"
			if locale == "pt-BR" {
				usage, flags, help = "Uso:", "Opções:", "ajuda para breeze-agent"
			}
			for _, label := range []string{usage, flags, help} {
				if !strings.Contains(text, label) {
					t.Fatalf("missing localized copy %q: %s", label, text)
				}
			}
		})
	}
}
