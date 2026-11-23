//go:build darwin

package i18n

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

func osLocale() string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	// AppleLanguages is the display-language order; AppleLocale is regional
	// formatting and can differ from the user's chosen UI language.
	out, err := exec.CommandContext(ctx, "defaults", "read", "-g", "AppleLanguages").Output()
	if err != nil {
		return "en"
	}
	value := strings.TrimSpace(string(out))
	value = strings.TrimPrefix(value, "(")
	first := strings.Split(strings.TrimSpace(value), ",")[0]
	return strings.Trim(first, " \t\r\n\"()")
}
