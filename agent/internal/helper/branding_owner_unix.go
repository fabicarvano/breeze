//go:build !windows

package helper

import (
	"os"
	"syscall"
)

// Atomic branding-only replacement keeps the previous file's user/group.
func preserveBrandingOwner(file *os.File, info os.FileInfo) error {
	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		return file.Chown(int(stat.Uid), int(stat.Gid))
	}
	return nil
}
