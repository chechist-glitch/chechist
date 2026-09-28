//go:build windows

// Lanzador de Windows para el Cuadrador de carteles.
//
// Lleva dentro cuadrador.html: lo guarda en
// %LOCALAPPDATA%\CuadradorDeCarteles y lo abre en Chrome, o en el navegador
// por defecto si no hay Chrome. No instala nada ni se queda abierto.
package main

import (
	_ "embed"
	"os"
	"path/filepath"
	"syscall"
	"unsafe"
)

//go:embed cuadrador.html
var page []byte

var (
	shell32         = syscall.NewLazyDLL("shell32.dll")
	user32          = syscall.NewLazyDLL("user32.dll")
	shellExecuteExW = shell32.NewProc("ShellExecuteExW")
	messageBoxW     = user32.NewProc("MessageBoxW")
)

const (
	seeMaskFlagNoUI = 0x00000400 // sin cuadros de error si falta el programa
	swShowNormal    = 1
	mbIconError     = 0x00000010
)

// SHELLEXECUTEINFOW
type shellExecuteInfo struct {
	cbSize       uint32
	fMask        uint32
	hwnd         uintptr
	lpVerb       *uint16
	lpFile       *uint16
	lpParameters *uint16
	lpDirectory  *uint16
	nShow        int32
	hInstApp     uintptr
	lpIDList     uintptr
	lpClass      *uint16
	hkeyClass    uintptr
	dwHotKey     uint32
	hIcon        uintptr
	hProcess     uintptr
}

func main() {
	dir, err := os.UserCacheDir()
	if err != nil {
		dir = os.TempDir()
	}
	dir = filepath.Join(dir, "CuadradorDeCarteles")
	path := filepath.Join(dir, "cuadrador.html")
	err = os.MkdirAll(dir, 0o755)
	if err == nil {
		err = os.WriteFile(path, page, 0o644)
	}
	if err != nil {
		alert("No se pudo preparar el Cuadrador de carteles:\n" + err.Error())
		return
	}
	if open("chrome.exe", `"`+path+`"`) || open(path, "") {
		return
	}
	alert("No se pudo abrir el navegador. Abre este archivo con Chrome:\n" + path)
}

func open(file, params string) bool {
	info := shellExecuteInfo{
		fMask:  seeMaskFlagNoUI,
		lpVerb: utf16("open"),
		lpFile: utf16(file),
		nShow:  swShowNormal,
	}
	if params != "" {
		info.lpParameters = utf16(params)
	}
	info.cbSize = uint32(unsafe.Sizeof(info))
	ok, _, _ := shellExecuteExW.Call(uintptr(unsafe.Pointer(&info)))
	return ok != 0
}

func alert(msg string) {
	messageBoxW.Call(0, uintptr(unsafe.Pointer(utf16(msg))), uintptr(unsafe.Pointer(utf16("Cuadrador de carteles"))), mbIconError)
}

func utf16(s string) *uint16 {
	p, err := syscall.UTF16PtrFromString(s)
	if err != nil {
		p, _ = syscall.UTF16PtrFromString("?")
	}
	return p
}
