package i18n

import (
	"regexp"
	"strings"
)

var rebootPostponeAction = regexp.MustCompile(`^Postpone [0-9]+ (seconds?|minutes?|hours?)$`)

// ActionLabel localizes only the Agent-owned reboot offers. Callers must return
// the original action to the daemon; arbitrary server/operator text is verbatim.
func ActionLabel(action string) string {
	if action == "Restart now" {
		return Text(action)
	}
	if rebootPostponeAction.MatchString(action) {
		fields := strings.Fields(action)
		return Text("Postpone ") + fields[1] + " " + Text(fields[2])
	}
	return action
}
