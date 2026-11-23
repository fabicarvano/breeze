package agentapp

import (
	"strings"

	"github.com/breeze-rmm/agent/internal/i18n"
	"github.com/spf13/cobra"
)

// Localize display templates without changing command/flag names or English
// defaults. Deriving from Cobra's templates preserves their normal layout.
func localizeCommandHelp(command *cobra.Command, locale string) {
	if i18n.NormalizeLocale(locale) == "en" {
		return
	}
	template := func(value string) string {
		for _, label := range []string{"Usage:", "Aliases:", "Examples:", "Available Commands:", "Global Flags:", "Flags:", "Additional help topics:", "Use \"{{.CommandPath}} [command] --help\" for more information about a command."} {
			value = strings.ReplaceAll(value, label, i18n.ForLocale(locale, label))
		}
		return value
	}
	if command.Short == "Help about any command" {
		command.Short = i18n.ForLocale(locale, "Help about any command")
		command.Long = "Exibe a ajuda de qualquer comando do aplicativo.\nUse " + command.Root().CommandPath() + " help [command] para obter detalhes."
	}
	command.SetUsageTemplate(template(command.UsageTemplate()))
	command.SetHelpTemplate(template(command.HelpTemplate()))
	command.InitDefaultHelpFlag()
	if flag := command.Flags().Lookup("help"); flag != nil {
		flag.Usage = strings.ReplaceAll(i18n.ForLocale(locale, "help for %s"), "%s", command.Name())
	}
	for _, child := range command.Commands() {
		localizeCommandHelp(child, locale)
	}
}
