// Zanchin Hub Helper: menu bar status icon.
// Shows whether the helper (zanchin_helper.py) is running and healthy, next to the battery and clock.
// It only READS the helper's status file; the helper does the real work. Quitting this icon does not stop the helper.
//
// Build: swiftc -O -swift-version 5 ZanchinHelperMenu.swift -o ZanchinHelperMenu   (install.sh does this)
import Cocoa

let home = NSHomeDirectory()
let supportDir = home + "/Library/Application Support/Zanchin Hub Helper"
let statusPath = supportDir + "/status.json"
let configPath = supportDir + "/config.json"
let triggerPath = supportDir + "/check-now"
let logPath = home + "/Library/Logs/Zanchin Hub Helper.log"
let helperLabel = "ca.zanchin.hub-helper"

func readJSON(_ path: String) -> [String: Any]? {
    guard let data = FileManager.default.contents(atPath: path) else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
}

func ago(_ t: Double) -> String {
    let s = max(0, Int(Date().timeIntervalSince1970 - t))
    if s < 10 { return "just now" }
    if s < 60 { return "\(s)s ago" }
    if s < 3600 { return "\(s / 60) min ago" }
    if s < 86400 { return "\(s / 3600) h ago" }
    return "\(s / 86400) d ago"
}

enum Level { case good, warn, bad }

final class App: NSObject, NSApplicationDelegate, NSMenuDelegate {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let menu = NSMenu()
    var timer: Timer?

    func applicationDidFinishLaunching(_ n: Notification) {
        menu.delegate = self
        item.menu = menu
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.refresh() }
    }

    func menuWillOpen(_ menu: NSMenu) { refresh() }

    func current() -> (Level, String, [String: Any]) {
        guard let st = readJSON(statusPath) else { return (.bad, "Helper has not started yet", [:]) }
        let checked = st["checked_at"] as? Double ?? 0
        let poll = (readJSON(configPath)?["poll_seconds"] as? Double) ?? 60
        if Date().timeIntervalSince1970 - checked > max(180, poll * 3) { return (.bad, "Helper is not running", st) }
        let msg = st["message"] as? String ?? ""
        switch st["state"] as? String ?? "" {
        case "ok": return (.good, msg.isEmpty ? "Running" : msg, st)
        case "drive_offline", "hub_unreachable": return (.warn, msg, st)
        default: return (.bad, msg.isEmpty ? "Something is wrong" : msg, st)
        }
    }

    func color(_ l: Level) -> NSColor { l == .good ? .systemGreen : (l == .warn ? .systemOrange : .systemRed) }

    func line(_ title: String, dot: NSColor? = nil) -> NSMenuItem {
        let mi = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        mi.isEnabled = false
        if let dot = dot {
            let s = NSMutableAttributedString(string: "● ", attributes: [.foregroundColor: dot])
            s.append(NSAttributedString(string: title, attributes: [.foregroundColor: NSColor.labelColor]))
            mi.attributedTitle = s
        }
        return mi
    }

    func action(_ title: String, _ sel: Selector) -> NSMenuItem {
        let mi = NSMenuItem(title: title, action: sel, keyEquivalent: "")
        mi.target = self
        return mi
    }

    func refresh() {
        let (level, message, st) = current()
        if let b = item.button {
            let img = NSImage(systemSymbolName: "externaldrive.fill", accessibilityDescription: "Zanchin Hub Helper")
            img?.isTemplate = true
            b.image = img
            b.imagePosition = .imageLeft
            b.attributedTitle = NSAttributedString(string: " ●", attributes: [.foregroundColor: color(level), .font: NSFont.systemFont(ofSize: 11)])
            b.toolTip = "Zanchin Hub Helper: " + message
        }
        menu.removeAllItems()
        menu.addItem(line("Zanchin Hub Helper"))
        menu.addItem(line(message, dot: color(level)))
        if let t = st["checked_at"] as? Double, t > 0 { menu.addItem(line("Last check: " + ago(t))) }
        if let n = st["last_number"] as? String, let t = st["last_at"] as? Double {
            menu.addItem(line("Last project built: \(n) · " + ago(t)))
        }
        menu.addItem(.separator())
        menu.addItem(action("Check now", #selector(checkNow)))
        menu.addItem(action("Open Zanchin Hub", #selector(openHub)))
        menu.addItem(action("Show log", #selector(showLog)))
        menu.addItem(action("Restart helper", #selector(restartHelper)))
        menu.addItem(.separator())
        menu.addItem(action("Quit this icon (helper keeps running)", #selector(quit)))
    }

    @objc func checkNow() {
        FileManager.default.createFile(atPath: triggerPath, contents: Data())
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in self?.refresh() }
    }

    @objc func openHub() {
        let url = (readJSON(configPath)?["hub_url"] as? String) ?? ""
        if let u = URL(string: url + "/ops"), !url.isEmpty { NSWorkspace.shared.open(u) }
    }

    @objc func showLog() { NSWorkspace.shared.open(URL(fileURLWithPath: logPath)) }

    @objc func restartHelper() {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        p.arguments = ["kickstart", "-k", "gui/\(getuid())/\(helperLabel)"]
        try? p.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in self?.refresh() }
    }

    @objc func quit() { NSApp.terminate(nil) }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)   // menu bar only, no Dock icon
let delegate = App()
app.delegate = delegate
app.run()
