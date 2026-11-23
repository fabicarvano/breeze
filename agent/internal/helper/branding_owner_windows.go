//go:build windows

package helper

import "os"

// Config remains in the same session directory and inherits its protected ACL,
// matching the existing per-session configuration writer.
func preserveBrandingOwner(_ *os.File, _ os.FileInfo) error { return nil }
