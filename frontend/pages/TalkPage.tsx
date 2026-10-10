"use client";
import { useRef, useState } from "react";

type State = "idle" | "connecting" | "live" | "ended" | "error";

export default function Talk() {
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const note = (t: string) => setLog((l) => [...l.slice(-14), `${new Date().toLocaleTimeString()}  ${t}`]);
  const room = useRef<any>(null);
  const token = useRef<string>("");
  const lastUserSpeech = useRef<number>(0);
  const agentWasSpeaking = useRef<boolean>(false);
  const t0 = useRef<number>(0);

  async function start() {
    setState("connecting"); setMsg(""); setLog([]); t0.current = Date.now(); lastUserSpeech.current = 0; agentWasSpeaking.current = false;
    const since = () => `${((Date.now() - t0.current) / 1000).toFixed(1)}s`;
    try {
      // 1. Microphone FIRST (permission prompt + device start-up), so the caller is ready before the agent greets.
      const { Room, RoomEvent, Track, DisconnectReason, createLocalAudioTrack, ConnectionState } = await import("livekit-client");
      note("asking for microphone…");
      const micTrack = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      note(`microphone ready after ${since()}`);

      // 2. Create the Vaani session and exchange it for room credentials.
      const r = await fetch("/api/talk/session" + (location.search.includes("old") ? "?old=1" : ""), { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not start the call");
      token.current = j.session_token ?? "";
      note(`session created after ${since()}`);

      // 3. Join the room and publish the already-running microphone straight away.
      const rm = new Room();
      room.current = rm;
      rm.on(RoomEvent.TrackSubscribed, (track, _pub, part) => {
        note(`audio from ${part.identity}`);
        if (track.kind === Track.Kind.Audio) { const el = track.attach(); el.style.display = "none"; document.body.appendChild(el); }
      });
      rm.on(RoomEvent.Disconnected, (reason) => { note(`DISCONNECTED: ${reason !== undefined ? DisconnectReason[reason] ?? reason : "unknown"}`); setState("ended"); micTrack.stop(); document.querySelectorAll("audio").forEach((a) => a.remove()); });
      rm.on(RoomEvent.ParticipantConnected, (p) => note(`joined: ${p.identity} (${p.kind})`));
      rm.on(RoomEvent.ParticipantDisconnected, (p) => note(`LEFT: ${p.identity}`));
      rm.on(RoomEvent.ConnectionStateChanged, (st: any) => note(`connection: ${st}`));
      rm.on(RoomEvent.Reconnecting, () => note("reconnecting…"));
      rm.on(RoomEvent.Reconnected, () => note("reconnected"));
      rm.on(RoomEvent.ActiveSpeakersChanged, (sp) => {
        const now = Date.now();
        const user = sp.some((x) => x.identity.startsWith("web-user"));
        const agent = sp.some((x) => x.identity.startsWith("agent"));
        if (user) lastUserSpeech.current = now;
        if (agent && !agentWasSpeaking.current && lastUserSpeech.current && now - lastUserSpeech.current < 30000)
          note(`⏱ agent started answering ${((now - lastUserSpeech.current) / 1000).toFixed(1)}s after you last spoke`);
        agentWasSpeaking.current = agent;
      });
      await rm.connect(j.lk_url, j.lk_token);
      note(`joined room after ${since()}`);
      const t1 = Date.now();
      await rm.localParticipant.publishTrack(micTrack);
      note(`microphone published in ${((Date.now() - t1) / 1000).toFixed(1)}s (total ${since()})`);
      setState("live");
    } catch (e: any) {
      setState("error");
      setMsg(/permission|denied|NotAllowed/i.test(String(e?.message ?? e)) ? "Please allow microphone access in your browser, then try again." : String(e?.message ?? e));
      try { room.current?.disconnect(); } catch {}
    }
  }

  async function end() {
    try { room.current?.disconnect(); } catch {}
    if (token.current) await fetch("/api/talk/end", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_token: token.current }) }).catch(() => {});
    setState("ended");
  }

  return (
    <div className="ds-root ds-talkpage">
      <main className="ds-talk">
        <div className="ds-brand" style={{ justifyContent: "center", marginBottom: 28 }}><span className="ds-logo">A</span><span>Aangan Studio</span></div>
        <div className="ds-talkcard">
          <p className="ds-kicker" style={{ textAlign: "center" }}>Voice assistant</p>
          <h1>Talk to us</h1>
          <p className="ds-talk-sub">Ask about interior design, tell us about your home, and book a free consultation, all by voice. Speak in English, Hindi or Marathi. Calls are recorded.</p>

          {(state === "idle" || state === "ended" || state === "error") && (
            <button className="ds-btn ds-btn-dark" onClick={start}>{state === "idle" ? "🎙  Start call" : "🎙  Start a new call"}</button>
          )}
          {state === "connecting" && <p className="ds-talk-status">Connecting… please allow the microphone.</p>}
          {state === "live" && (<><p className="ds-talk-status live"><i /> Connected. Go ahead and speak.</p><button className="ds-btn ds-btn-red" onClick={end}>End call</button></>)}
          {state === "ended" && <p className="ds-talk-status">Call ended. Thank you!</p>}
          {state === "error" && <p className="ds-talk-status err">{msg}</p>}

          <div className="ds-try">
            <p className="ds-kicker">What to try</p>
            <ul>
              <li>“I want to redo my 3BHK flat in Baner.”</li>
              <li>Give your name, a 10-digit phone number and an email, and agree to book a consultation.</li>
              <li>Pick any day, including weekends, between 9 am and 5 pm.</li>
            </ul>
            <p className="ds-try-note">Test calls create a real lead, so they appear in the studio dashboard and may book a real slot.</p>
          </div>
          {log.length > 0 && (
            <details className="ds-techlog"><summary>Technical log</summary><pre>{log.join("\n")}</pre></details>
          )}
        </div>
      </main>
    </div>
  );
}
