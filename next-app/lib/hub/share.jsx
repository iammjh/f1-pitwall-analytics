import { useState } from "react";

/** Shares a public card URL: the native share sheet where available, otherwise copies the link. */
export function ShareButton({ path, label = "Share card", accent = "#E10600" }) {
  const [state, setState] = useState("idle");

  async function share() {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: label });
        return;
      }
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      // The user cancelled the share sheet, or the clipboard is blocked: nothing else to do.
      setState("idle");
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      style={{
        padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
        border: `1px solid ${accent}55`, background: `${accent}14`, color: "#fff",
      }}
    >
      {state === "copied" ? "Link copied" : label}
    </button>
  );
}
