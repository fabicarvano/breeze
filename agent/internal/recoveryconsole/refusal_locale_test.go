//go:build !windows && !darwin

package recoveryconsole

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestConsoleDiskRefusalPortugueseRendered(t *testing.T) {
	if os.Getenv("BREEZE_TEST_REFUSAL_LOCALE") == "1" {
		io := &fakeIO{Answers: []string{"https://breeze.example", "abc-def-ghj", "", "p"}}
		deps := diskHasWindowsDeps(t)
		c := &Console{IO: io, Deps: deps.build("0.111.1"), Cmdline: "breeze.media=1"}
		if err := c.Run(context.Background()); err != nil {
			t.Fatal(err)
		}
		fmt.Print(io.transcript.String())
		return
	}
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(exe, "-test.run=^TestConsoleDiskRefusalPortugueseRendered$")
	cmd.Env = append(os.Environ(), "BREEZE_TEST_REFUSAL_LOCALE=1", "LC_ALL=pt_BR.UTF-8")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("locale subprocess: %v\n%s", err, out)
	}
	text := string(out)
	for _, want := range []string{"Esta recuperação foi marcada como recusada", "novo código de recuperação", "OVERWRITE"} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %q in rendered console:\n%s", want, text)
		}
	}
	if strings.Contains(text, "This recovery is now marked refused") {
		t.Fatalf("English refusal leaked:\n%s", text)
	}
}
