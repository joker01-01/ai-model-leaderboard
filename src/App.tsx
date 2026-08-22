import { useEffect, useMemo, useState } from "react";
import type { Model } from "./data/models";
import { MODELS } from "./data/models";
import type { RankingMode, SortKey } from "./lib/entries";
import { buildEntries, sortEntries } from "./lib/entries";
import type { Preset, Weights } from "./lib/score";
import { compositePartial, DEFAULT_WEIGHTS, DIM_KEYS, OBJECTIVE_DIM_KEYS, PRESETS } from "./lib/score";
import { Champion } from "./components/Champion";
import { Masthead, ModeSwitch } from "./components/Masthead";
import { ObjectivePanel, WeightPanel } from "./components/Panels";
import { Controls } from "./components/Controls";
import { Board } from "./components/Board";
import { Footer } from "./components/Footer";

function loadPref(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function loadMode(): RankingMode {
  const stored = loadPref("almanac.mode", "objective");
  return stored === "editorial" ? "editorial" : "objective";
}

function loadWeights(): Weights {
  try {
    const raw = JSON.parse(localStorage.getItem("almanac.weights") ?? "null") as Partial<Weights> | null;
    if (raw && DIM_KEYS.every((key) => typeof raw[key] === "number" && Number.isFinite(raw[key]) && raw[key] >= 0)) {
      const next = Object.fromEntries(DIM_KEYS.map((key) => [key, Math.min(60, raw[key] as number)])) as Weights;
      if (DIM_KEYS.some((key) => next[key] > 0)) return next;
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_WEIGHTS };
}

export default function App() {
  const [mode, setMode] = useState<RankingMode>(loadMode);
  const [weights, setWeights] = useState<Weights>(loadWeights);
  const [preset, setPreset] = useState<string>(() => loadPref("almanac.preset", "综合（含性价比）"));
  const [sortKey, setSortKey] = useState<SortKey>("composite");
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("全部");
  const [openOnly, setOpenOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { try { localStorage.setItem("almanac.mode", mode); } catch { /* ignore */ } }, [mode]);
  useEffect(() => { try { localStorage.setItem("almanac.weights", JSON.stringify(weights)); } catch { /* ignore */ } }, [weights]);
  useEffect(() => { try { localStorage.setItem("almanac.preset", preset); } catch { /* ignore */ } }, [preset]);

  const entries = useMemo(() => buildEntries(weights), [weights]);

  const editorialChampion = useMemo(
    () => sortEntries(entries, "editorial", "composite").find((entry) => entry.editorialScore !== null) ?? entries[0],
    [entries],
  );
  const objectiveChampion = useMemo(
    () => sortEntries(entries, "objective", "composite").find((entry) => entry.objectiveScore.score !== null) ?? null,
    [entries],
  );
  const pureChampion = useMemo(() => {
    const pure = PRESETS.find((item) => item.name === "只看智能")!;
    return entries
      .map((entry) => ({ model: entry.model, score: compositePartial(entry.editorialDims, pure.weights) }))
      .filter((entry): entry is { model: Model; score: number } => entry.score !== null)
      .sort((a, b) => b.score - a.score)[0];
  }, [entries]);
  const champion = mode === "objective" ? (objectiveChampion ?? editorialChampion) : editorialChampion;

  const countries = useMemo(() => ["全部", ...Array.from(new Set(MODELS.map((model) => model.country)))], []);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const keys = mode === "objective" ? OBJECTIVE_DIM_KEYS : DIM_KEYS;
    const filtered = entries.filter((entry) => {
      if (openOnly && !entry.model.open) return false;
      if (country !== "全部" && entry.model.country !== country) return false;
      if (!needle) return true;
      return [entry.model.name, entry.model.maker, entry.model.makerEn, ...entry.model.badges]
        .join(" ").toLowerCase().includes(needle);
    });
    if (sortKey !== "composite" && !keys.includes(sortKey as never)) return sortEntries(filtered, mode, "composite");
    return sortEntries(filtered, mode, sortKey);
  }, [entries, q, country, openOnly, mode, sortKey]);

  const applyPreset = (next: Preset) => { setPreset(next.name); setWeights({ ...next.weights }); };
  const setDimWeight = (key: keyof Weights, value: number) => {
    setPreset("自定义");
    setWeights((current) => {
      const next = { ...current, [key]: value };
      if (DIM_KEYS.every((item) => next[item] === 0)) next[key] = 1;
      return next;
    });
  };
  const changeMode = (next: RankingMode) => {
    setMode(next);
    setSortKey("composite");
    setExpanded(null);
  };
  const reset = () => applyPreset(PRESETS[0]);
  const altName = mode === "objective" ? editorialChampion.model.name : pureChampion.model.name;
  const onAltSwitch = mode === "objective" ? () => changeMode("editorial") : () => applyPreset(PRESETS.find((item) => item.name === "只看智能")!);

  return (
    <div className="page">
      <Masthead />
      <ModeSwitch mode={mode} onChange={changeMode} />
      <section className="hero">
        <Champion entry={champion} mode={mode} presetLabel={preset} altName={altName} onAltSwitch={onAltSwitch} />
        {mode === "objective"
          ? <ObjectivePanel entries={entries} />
          : <WeightPanel weights={weights} preset={preset} onPreset={applyPreset} onWeight={setDimWeight} onReset={reset} />}
      </section>
      <Controls mode={mode} sortKey={sortKey} setSortKey={setSortKey} q={q} setQ={setQ}
        country={country} setCountry={setCountry} countries={countries} openOnly={openOnly} setOpenOnly={setOpenOnly} />
      <Board mode={mode} entries={visible} sortKey={sortKey} expanded={expanded}
        onToggle={(id) => setExpanded((current) => (current === id ? null : id))} />
      <Footer />
    </div>
  );
}
