package i18n

func init() {
	for key, value := range map[string]string{
		"Help about any command": "Ajuda sobre qualquer comando",
		"Usage:":                 "Uso:", "Aliases:": "Atalhos:", "Examples:": "Exemplos:",
		"Available Commands:": "Comandos disponíveis:", "Flags:": "Opções:",
		"Global Flags:": "Opções globais:", "Additional help topics:": "Tópicos adicionais de ajuda:",
		"Use \"{{.CommandPath}} [command] --help\" for more information about a command.": "Use \"{{.CommandPath}} [command] --help\" para mais informações sobre um comando.",
		"help for %s": "ajuda para %s",
	} {
		ptBR[key] = value
	}
}
