import { ArrowLeft, Eye, EyeOff, Settings2, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { prefetch, useAtlas, useEntry } from "../atlas/context";
import { play, stopAudio } from "../lib/audio";
import { go } from "../lib/router";
import { sceneFor, type ScenePart } from "../lib/scene";
import { rateScene, sceneSession } from "../store/session";
import { formatInterval, preview, Rating, type Grade } from "../store/srs";
import { store, useStore, type ActiveSession } from "../store/store";
import { toast } from "../ui/Toast";
import "../styles/scene.css";

const GRADES: { grade: Grade; label: string; tone: string }[] = [
  { grade: Rating.Again, label: "没印象", tone: "again" },
  { grade: Rating.Hard, label: "有点印象", tone: "hard" },
  { grade: Rating.Good, label: "基本记得", tone: "good" },
  { grade: Rating.Easy, label: "很轻松", tone: "easy" },
];

export function Learn() {
  const atlas = useAtlas();
  const session = useStore((s) => s.progress.session);
  useEffect(() => {
    store.progress((p) => {
      const next = sceneSession(atlas, p, store.get().settings);
      return next === p.session ? p : { ...p, session: next };
    });
  }, [atlas]);
  const step = session?.steps[session.index];
  useEffect(() => {
    if (session) void prefetch(atlas, session.steps.slice(session.index, session.index + 4).map((s) => s.id));
  }, [atlas, session?.id, session?.index]);
  useEffect(() => () => stopAudio(), []);
  // Do not briefly render an old intro screen while upgrading a saved session.
  if (!session || (!session.finished && session.mode !== "scene")) return <div className="learn learn-loading"><span className="spinner" /></div>;
  if (session.finished || !step) return <SceneSummary session={session} />;
  return <SceneCard key={`${session.id}:${session.index}`} session={session} id={step.id} />;
}

function SceneCard({ session, id }: { session: ActiveSession; id: string }) {
  const atlas = useAtlas();
  const { entry, error } = useEntry(id);
  const settings = useStore((s) => s.settings);
  const card = useStore((s) => s.progress.cards[id]);
  const [revealed, setRevealed] = useState(false);
  const [options, setOptions] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const started = useRef(performance.now());
  const locked = useRef(false);
  const speechGeneration = useRef(0);
  const scene = useMemo(() => entry ? sceneFor(entry) : null, [entry]);
  // Keep one reference time per card so interval labels do not jump on reveal.
  const now = useRef(Date.now()).current;
  const intervals = useMemo(() => preview(card, now, settings.retention), [card, now, settings.retention]);
  const isJapanese = scene?.example.lang === "ja" || /[\u3040-\u30ff]/u.test(scene?.example.en ?? "");
  const lang = isJapanese ? "ja" : "en";
  const remaining = session.steps.slice(session.index);
  const reviews = remaining.filter((s) => session.reviewIds.includes(s.id)).length;
  const fresh = remaining.length - reviews;
  const exit = () => { stopAudio(); go({ page: "today" }); };

  useEffect(() => () => { speechGeneration.current++; stopAudio(); }, []);

  const speak = async () => {
    if (!entry || !scene) return;
    const generation = ++speechGeneration.current;
    const kind = scene.index === 0 ? "ex" : scene.index === 1 ? "ex2" : null;
    const result = await play(kind ? atlas.audio(entry, kind) : null, scene.example.en,
      isJapanese ? "ja" : settings.accent);
    if (generation !== speechGeneration.current) return;
    if (result === "unsupported" || result === "failed") toast("当前设备无法朗读，请检查语音设置。", "warn");
  };
  const toggle = () => {
    if (!entry || !scene) return;
    if (revealed) { speechGeneration.current++; stopAudio(); }
    else if (settings.autoplay) void speak();
    setRevealed(!revealed);
  };
  const rate = (grade: Grade) => {
    if (!revealed || locked.current || !entry) return;
    locked.current = true;
    speechGeneration.current++;
    stopAudio();
    store.progress((p) => rateScene(p, session.id, session.index, grade,
      (performance.now() - started.current) / 1000, settings.retention));
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || options) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, input, textarea, select, a, [contenteditable=true]")) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
      if (revealed && /^[1-4]$/.test(e.key)) { e.preventDefault(); rate(GRADES[Number(e.key) - 1].grade); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="learn scene-learn">
      <header className="scene-top">
        <button className="icon-btn" onClick={exit} aria-label="暂停并返回"><X size={21} /></button>
        <div className="scene-heading"><b>场景记忆</b><span>先想一想，再揭晓</span></div>
        <span className="scene-queue">复习 <b>{reviews}</b><i />新卡 <b>{fresh}</b></span>
        <button className="icon-btn" onClick={() => setOptions(!options)} aria-label="学习选项" aria-expanded={options}><Settings2 size={21} /></button>
      </header>
      <div className="scene-progress" role="progressbar" aria-label="本轮学习进度" aria-valuemin={0} aria-valuemax={session.steps.length} aria-valuenow={session.index}>
        <span style={{ width: `${session.index / session.steps.length * 100}%` }} />
      </div>
      {options && <section className="scene-options" aria-label="学习选项">
        <label><input type="checkbox" checked={settings.hideMotherTongue} onChange={(e) => store.settings({ hideMotherTongue: e.target.checked })} />隐藏中文提示<span>揭晓后仍显示翻译和解析</span></label>
        <label><input type="checkbox" checked={settings.autoplay} onChange={(e) => store.settings({ autoplay: e.target.checked })} />揭晓时自动朗读</label>
        <label><input type="checkbox" checked={settings.showFurigana} onChange={(e) => store.settings({ showFurigana: e.target.checked })} />揭晓后显示假名<span>适用于已标注读音的日语例句</span></label>
        <button className="btn btn-ghost" onClick={() => setOptions(false)}>完成设置</button>
      </section>}
      {error ? <div className="scene-error" role="alert"><p>这张卡片加载失败：{error}</p><button className="btn btn-primary" onClick={() => location.reload()}>重新加载</button><button className="btn btn-ghost" onClick={exit}>返回</button></div>
      : !entry || !scene ? <div className="learn-loading" aria-label="正在加载卡片"><span className="spinner" /></div>
      : <>
        <section className="scene-body" aria-label="场景卡片">
          <div className="scene-meta"><span>{session.reviewIds.includes(id) ? "复习卡片" : "新卡片"}</span><span>{session.index + 1} / {session.steps.length}</span></div>
          <button className="scene-image" onClick={toggle} aria-label={revealed ? "收起答案" : "揭晓答案"} aria-expanded={revealed} aria-controls="scene-answer">
            {atlas.img(entry) && !imageFailed
              ? <img src={atlas.img(entry)!} alt="学习场景，点击切换答案" onError={() => setImageFailed(true)} draggable={false} />
              : <span className="scene-image-fallback"><Eye size={40} /><span>想一想，这个场景怎么表达？</span><small>这张卡片暂无场景配图</small></span>}
            <span className="scene-image-caption">{revealed ? <EyeOff size={15} /> : <Eye size={15} />}{revealed ? "点击图片收起答案" : "点击图片揭晓答案"}</span>
          </button>
          <div className="scene-prompt">
            {(!settings.hideMotherTongue || revealed) && <p className="scene-translation">{scene.example.zh}</p>}
            <p className="scene-sentence" lang={lang}>
              {scene.parts.map((part, i) => <SentencePart key={i} part={part} revealed={revealed} furigana={settings.showFurigana} />)}
            </p>
            {!revealed && <p className="scene-instruction">先在心里回想，或试着说出空缺的表达。</p>}
          </div>
          {revealed && <section className="scene-answer" id="scene-answer" aria-label="答案与解析">
            <div className="scene-answer-heading"><h2>{entry.w}</h2><button className="btn btn-ghost" onClick={() => void speak()}><Volume2 size={18} />朗读整句</button></div>
            <p className="scene-voice-note">{isJapanese ? "日语" : settings.accent === "uk" ? "英式" : "美式"}朗读 · 优先使用录音，无录音时使用设备语音</p>
            <div className="scene-meanings">{entry.senses.map((s, i) => <p key={i}><small>{s.pos}</small>{s.zh}</p>)}</div>
            {entry.tip && <div className="scene-explanation"><b>用法解析</b><p>{entry.tip}</p></div>}
            {entry.note && <p className="scene-note">{entry.note}</p>}
            {scene.fallback && <p className="scene-note">此词条暂缺可挖空例句，本卡先练习回想表达。</p>}
          </section>}
        </section>
        <footer className="scene-actions">
          {revealed ? <><p>按刚才回想时的记忆程度评价</p><div className="scene-ratings">{GRADES.map(({ grade, label, tone }, i) => <button key={grade} className={`scene-rating scene-${tone}`} onClick={() => rate(grade)}><small>{formatInterval(intervals[grade])}</small><b>{label}</b><kbd>{i + 1}</kbd></button>)}</div></>
          : <><button className="btn btn-primary scene-reveal" onClick={toggle}><Eye size={19} />显示答案</button><p>点击图片或按空格揭晓 · 揭晓不会提交记录</p></>}
        </footer>
      </>}
    </div>
  );
}

export function SentencePart({ part, revealed, furigana }: { part: ScenePart; revealed: boolean; furigana: boolean }) {
  if (part.blank && !revealed) return <span className="scene-blank" aria-label="空缺">［　　　］</span>;
  const text = revealed && furigana && part.reading
    ? <ruby>{part.text}<rp>（</rp><rt>{part.reading}</rt><rp>）</rp></ruby> : part.text;
  return part.blank ? <mark className="scene-target">{text}</mark> : <>{text}</>;
}

function SceneSummary({ session }: { session: ActiveSession }) {
  const atlas = useAtlas();
  const cards = useStore((s) => s.progress.cards);
  const entries = Object.entries(session.graded);
  const remembered = entries.filter(([, g]) => g !== Rating.Again).length;
  const times = Object.entries(cards).filter(([id]) => atlas.byId.has(id)).map(([, c]) => c.due);
  const next = times.length ? Math.min(...times) : null;
  const now = Date.now();
  const due = times.filter((t) => t <= now).length;
  return <div className="learn scene-learn scene-summary">
    <span className="scene-summary-icon">✓</span><p className="eyebrow">这一轮完成了</p><h1>让记忆休息一下。</h1>
    <p>本轮评价 <b>{entries.length}</b> 个表达，其中 <b>{remembered}</b> 个自评为有印象或记得。</p>
    <p>{due ? `现在还有 ${due} 张卡片到期可复习。` : next ? `下次复习：${new Date(next).toLocaleString("zh-CN")}（约 ${formatInterval(next - now)}后）` : "当前没有需要复习的卡片。"}</p>
    <p className="scene-note">学习进度已记录在本设备。可在“我的”中导出备份。</p>
    <button className="btn btn-primary" onClick={() => { store.progress((p) => ({ ...p, session: null })); go({ page: "today" }); }}><ArrowLeft size={18} />返回今日学习</button>
  </div>;
}
