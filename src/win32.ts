// Thin wrapper over the few user32/kernel32 calls the plugin needs: send key presses, and find
// and focus OrcaSlicer's window. Windows only; every function throws elsewhere.
import koffi from "koffi";

import type { KeyStroke } from "./keys";

const INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const MAPVK_VK_TO_VSC = 0;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const GW_OWNER = 4;
const SW_RESTORE = 9;
const VK_MENU = 0x12;

// sizeof(INPUT) on 64-bit Windows (x64 and arm64): DWORD type, 4 bytes padding, then the union,
// whose largest member (MOUSEINPUT) is 32 bytes. KEYBDINPUT sits at offset 8:
//   +8 WORD wVk, +10 WORD wScan, +12 DWORD dwFlags, +16 DWORD time, +24 ULONG_PTR dwExtraInfo
const INPUT_SIZE = 40;

// Keys Windows reports with the extended-key flag; without it, arrows and friends can arrive as
// their number-pad twins when Num Lock is off.
const EXTENDED_KEYS = new Set([
	0x21, 0x22, 0x23, 0x24, // PgUp, PgDn, End, Home
	0x25, 0x26, 0x27, 0x28, // arrows
	0x2d, 0x2e, // Insert, Delete
	0x6f, // numpad divide
	0xa3, 0xa5, // right Ctrl, right Alt
]);

type Api = ReturnType<typeof load>;
let api: Api | undefined;
let loadError: unknown;

function load() {
	if (process.platform !== "win32") throw new Error("This plugin only runs on Windows.");
	if (process.arch !== "x64" && process.arch !== "arm64") throw new Error(`Unsupported CPU: ${process.arch}`);

	const user32 = koffi.load("user32.dll");
	const kernel32 = koffi.load("kernel32.dll");
	const HANDLE = koffi.pointer("HANDLE", koffi.opaque());
	koffi.alias("HWND", HANDLE);

	return {
		SendInput: user32.func("uint32_t __stdcall SendInput(uint32_t cInputs, const uint8_t *pInputs, int cbSize)"),
		MapVirtualKeyW: user32.func("uint32_t __stdcall MapVirtualKeyW(uint32_t uCode, uint32_t uMapType)"),
		VkKeyScanW: user32.func("int16_t __stdcall VkKeyScanW(uint16_t ch)"),
		GetForegroundWindow: user32.func("HWND __stdcall GetForegroundWindow()"),
		SetForegroundWindow: user32.func("int __stdcall SetForegroundWindow(HWND hWnd)"),
		GetLastActivePopup: user32.func("HWND __stdcall GetLastActivePopup(HWND hWnd)"),
		FindWindowExW: user32.func("HWND __stdcall FindWindowExW(HWND hWndParent, HWND hWndChildAfter, const char16_t *lpszClass, const char16_t *lpszWindow)"),
		GetWindowThreadProcessId: user32.func("uint32_t __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ uint32_t *lpdwProcessId)"),
		GetWindow: user32.func("HWND __stdcall GetWindow(HWND hWnd, uint32_t uCmd)"),
		IsWindowVisible: user32.func("int __stdcall IsWindowVisible(HWND hWnd)"),
		IsIconic: user32.func("int __stdcall IsIconic(HWND hWnd)"),
		ShowWindow: user32.func("int __stdcall ShowWindow(HWND hWnd, int nCmdShow)"),
		OpenProcess: kernel32.func("HANDLE __stdcall OpenProcess(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwProcessId)"),
		QueryFullProcessImageNameW: kernel32.func("int __stdcall QueryFullProcessImageNameW(HANDLE hProcess, uint32_t dwFlags, _Out_ uint8_t *lpExeName, _Inout_ uint32_t *lpdwSize)"),
		CloseHandle: kernel32.func("int __stdcall CloseHandle(HANDLE hObject)"),
	};
}

function win(): Api {
	if (api) return api;
	if (loadError) throw loadError; // a second load() would only fail with "duplicate type"
	try {
		return (api = load());
	} catch (err) {
		loadError = err;
		throw err;
	}
}

/** Virtual-key code and the modifiers needed to type `ch` on the current keyboard layout. */
export function scanChar(ch: string): { vk: number; shift: boolean; ctrl: boolean; alt: boolean } | undefined {
	const result = win().VkKeyScanW(ch.charCodeAt(0)) as number;
	if (result === -1) return undefined;
	const state = (result >> 8) & 0xff;
	return { vk: result & 0xff, shift: (state & 1) !== 0, ctrl: (state & 2) !== 0, alt: (state & 4) !== 0 };
}

function writeKey(buf: Buffer, index: number, vk: number, up: boolean): void {
	const at = index * INPUT_SIZE;
	const scan = win().MapVirtualKeyW(vk, MAPVK_VK_TO_VSC) as number;
	let flags = up ? KEYEVENTF_KEYUP : 0;
	if (EXTENDED_KEYS.has(vk)) flags |= KEYEVENTF_EXTENDEDKEY;
	buf.writeUInt32LE(INPUT_KEYBOARD, at);
	buf.writeUInt16LE(vk, at + 8);
	buf.writeUInt16LE(scan & 0xffff, at + 10);
	buf.writeUInt32LE(flags, at + 12);
}

/** Presses the modifiers, taps the key, and releases the modifiers, all in one SendInput call. */
export function sendKeyStroke(stroke: KeyStroke): void {
	const down = [...stroke.modifiers, stroke.key];
	const up = [...down].reverse();
	const buf = Buffer.alloc(INPUT_SIZE * (down.length + up.length));
	let i = 0;
	for (const vk of down) writeKey(buf, i++, vk, false);
	for (const vk of up) writeKey(buf, i++, vk, true);
	const sent = win().SendInput(i, buf, INPUT_SIZE) as number;
	if (sent !== i) throw new Error(`Windows accepted ${sent} of ${i} key events (another app may be blocking input).`);
}

function processPath(hwnd: unknown): string | undefined {
	const w = win();
	const pid = [0];
	if (!w.GetWindowThreadProcessId(hwnd, pid) || !pid[0]) return undefined;
	const handle = w.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0]);
	if (!handle) return undefined;
	try {
		const buf = Buffer.alloc(1024 * 2);
		const size = [1024];
		if (w.QueryFullProcessImageNameW(handle, 0, buf, size) === 0) return undefined;
		return buf.toString("utf16le", 0, size[0] * 2);
	} finally {
		w.CloseHandle(handle);
	}
}

/** True for OrcaSlicer's executable, including nightly and portable builds (orca-slicer.exe, OrcaSlicer.exe). */
export function isOrcaExecutable(path: string | undefined): boolean {
	if (!path) return false;
	const exe = path.split(/[\\/]/).pop() ?? "";
	return /^orca[-_ ]?slicer.*\.exe$/i.test(exe);
}

/** True when OrcaSlicer owns the window in front. */
export function orcaIsForeground(): boolean {
	const hwnd = win().GetForegroundWindow();
	return !!hwnd && isOrcaExecutable(processPath(hwnd));
}

/** OrcaSlicer's top-most visible window (main window or one of its dialogs), if it is running. */
function findOrcaWindow(): unknown {
	const w = win();
	for (let hwnd: unknown = null; ; ) {
		hwnd = w.FindWindowExW(null, hwnd, null, null);
		if (!hwnd) return undefined;
		if (w.IsWindowVisible(hwnd) !== 0 && !w.GetWindow(hwnd, GW_OWNER) && isOrcaExecutable(processPath(hwnd))) return hwnd;
	}
}

/**
 * Brings OrcaSlicer to the front. Windows only lets the process that last sent input change the
 * foreground window, so a tap of Alt is sent first (the usual workaround).
 * @returns `false` when OrcaSlicer isn't running.
 */
export function focusOrca(): boolean {
	const w = win();
	const main = findOrcaWindow();
	if (!main) return false;
	if (w.IsIconic(main) !== 0) w.ShowWindow(main, SW_RESTORE);
	// If a dialog is open, focus that rather than the (disabled) main window behind it.
	const target = w.GetLastActivePopup(main) || main;
	sendKeyStroke({ modifiers: [], key: VK_MENU });
	w.SetForegroundWindow(target);
	return true;
}
