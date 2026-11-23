package agentapp

import (
	"github.com/breeze-rmm/agent/internal/i18n"
	"github.com/breeze-rmm/agent/internal/remote/tools"
	"github.com/spf13/cobra"
)

var delayedRestartHelperCmd = &cobra.Command{
	Use:    "internal-delayed-restart",
	Short:  i18n.Text("Restart the agent service after a short delay"),
	Hidden: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return tools.RunDelayedRestartHelper()
	},
}

func init() {
	rootCmd.AddCommand(delayedRestartHelperCmd)
}
