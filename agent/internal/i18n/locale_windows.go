//go:build windows

package i18n

import (
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

func osLocale() string {
	// The UI language (not regional number/date preferences) of this user.
	proc := windows.NewLazySystemDLL("kernel32.dll").NewProc("GetUserDefaultUILanguage")
	lang, _, _ := proc.Call()
	if lang == 0 {
		return "en"
	}
	var buf [85]uint16
	name := windows.NewLazySystemDLL("kernel32.dll").NewProc("LCIDToLocaleName")
	n, _, _ := name.Call(lang, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), 0)
	if n == 0 {
		return "en"
	}
	return syscall.UTF16ToString(buf[:])
}
