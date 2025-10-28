// components/EmailCapture.tsx (submit handler)
async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  setState("loading");

  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, telegram }),
    });

    let ok = res.ok;
    let json: any = null;
    try { json = await res.json(); } catch {}

    if (ok || json?.success === true) {
      setState("success");           // show green success
      setMessage(json?.message || "Success — welcome aboard!");
    } else {
      setState("error");
      setMessage(json?.message || "Subscription failed. Please try again.");
    }
  } catch {
    setState("error");
    setMessage("Network error. Please try again.");
  }
}
