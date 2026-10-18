import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { SecLabel } from "./common";

const OPTIONS = [
  {
    key: "emailNotifications",
    label: "Email alerts",
    detail: "Master switch for every email from the hub.",
  },
  {
    key: "notifyRaceStart",
    label: "Race start",
    detail: "A message about an hour before each Grand Prix starts.",
  },
];

// VAPID public key, inlined at build time. Must be a literal property access for Next to replace it.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function Toggle({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: "none", position: "relative", flexShrink: 0,
        background: checked ? "#E10600" : "#2a2a2a", cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1, transition: "background 0.2s",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: checked ? 23 : 3, width: 18, height: 18, borderRadius: "50%",
        background: "#fff", transition: "left 0.2s",
      }} />
    </button>
  );
}

export function AlertsPage() {
  const { status } = useSession();
  const [prefs, setPrefs] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // Endpoint of this browser's push subscription, or null when this device is not subscribed.
  const [deviceEndpoint, setDeviceEndpoint] = useState(null);
  const [supported] = useState(pushSupported);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    fetch("/api/preferences")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => { if (active) setPrefs(data); })
      .catch(() => { if (active) setError("Could not load your alert settings."); });
    return () => { active = false; };
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" || !supported) return;
    let active = true;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (active) setDeviceEndpoint(sub?.endpoint ?? null); })
      .catch(() => {});
    return () => { active = false; };
  }, [status, supported]);

  async function update(key, value) {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setPrefs(await res.json());
    } catch {
      setPrefs(previous);
      setError("Could not save that change. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function setPush(enabled) {
    setError(null);
    setSaving(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (enabled) {
        if (!VAPID_PUBLIC_KEY) throw new Error("Push is not configured on this server.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setError("Allow notifications in your browser to receive push alerts.");
          return;
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
        if (!res.ok) throw new Error(String(res.status));
        setDeviceEndpoint(sub.endpoint);
        await update("pushNotifications", true);
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setDeviceEndpoint(null);
        await update("pushNotifications", false);
      }
    } catch (err) {
      setError(err?.message && err.message !== "500" ? err.message : "Could not change push alerts. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return <div style={{ color: "#555", fontSize: 13 }}>Loading…</div>;
  }
  if (status !== "authenticated") {
    return (
      <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 24, color: "#aaa", fontSize: 14 }}>
        Sign in to choose which race alerts you receive.
      </div>
    );
  }

  const emailOff = prefs && !prefs.emailNotifications;
  const pushOn = Boolean(prefs?.pushNotifications && deviceEndpoint);
  const pushDisabled = saving || !supported || !VAPID_PUBLIC_KEY;

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 18 }}>
        <SecLabel>Race alerts</SecLabel>
        <p style={{ fontSize: 13, color: "#888", marginTop: 0, lineHeight: 1.6 }}>
          Alerts go out by email to the address on your account, and by push to each device you turn them on for.
          Each race start is sent once per channel, and the hub checks for upcoming races every 15 minutes.
        </p>

        {!prefs && !error && <div style={{ color: "#555", fontSize: 13 }}>Loading your settings…</div>}

        {prefs && OPTIONS.map((option) => {
          const disabled = saving || (option.key !== "emailNotifications" && emailOff);
          return (
            <div key={option.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 0", borderTop: "1px solid #1a1a1a" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{option.label}</div>
                <div style={{ fontSize: 12, color: "#777", marginTop: 3 }}>{option.detail}</div>
              </div>
              <Toggle
                checked={Boolean(prefs[option.key])}
                disabled={disabled}
                label={option.label}
                onChange={(value) => update(option.key, value)}
              />
            </div>
          );
        })}

        {prefs && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 0", borderTop: "1px solid #1a1a1a" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Push on this device</div>
              <div style={{ fontSize: 12, color: "#777", marginTop: 3 }}>
                {!supported
                  ? "This browser does not support push notifications."
                  : !VAPID_PUBLIC_KEY
                    ? "Push is not configured on this server yet."
                    : deviceEndpoint
                      ? "This device receives race-start push alerts."
                      : "Turn on to receive race-start alerts on this device."}
              </div>
            </div>
            <Toggle
              checked={pushOn}
              disabled={pushDisabled}
              label="Push on this device"
              onChange={(value) => setPush(value)}
            />
          </div>
        )}

        {error && <div style={{ marginTop: 10, fontSize: 12, color: "#c66" }}>{error}</div>}
        <div style={{ marginTop: 14, fontSize: 11, color: "#555", lineHeight: 1.6 }}>
          Install the hub from your browser menu to keep it one tap away. Push settings apply per device and browser.
        </div>
      </div>
    </div>
  );
}
