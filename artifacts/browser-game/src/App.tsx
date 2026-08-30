import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock3,
  Crosshair,
  Gauge,
  Gem,
  Keyboard,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';

type GameStatus = 'ready' | 'playing' | 'paused' | 'over';
type Direction = 'up' | 'down' | 'left' | 'right';
type Point = { x: number; y: number };
type Hazard = Point & { vx: number; vy: number };

const GAME_DURATION = 45;
const BEST_SCORE_KEY = 'star-dash-best-score';
const initialStars: Point[] = [
  { x: 18, y: 23 },
  { x: 72, y: 20 },
  { x: 84, y: 67 },
  { x: 35, y: 79 },
  { x: 58, y: 48 },
];
const initialHazards: Hazard[] = [
  { x: 31, y: 37, vx: 12, vy: 8 },
  { x: 67, y: 72, vx: -10, vy: 14 },
  { x: 83, y: 35, vx: -14, vy: -9 },
];
const queryClient = new QueryClient();

function readBestScore() {
  try {
    return Number(window.localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function randomStar(): Point {
  return {
    x: 11 + Math.random() * 78,
    y: 14 + Math.random() * 72,
  };
}

function Game() {
  const [status, setStatus] = useState<GameStatus>('ready');
  const [player, setPlayer] = useState<Point>({ x: 50, y: 72 });
  const [stars, setStars] = useState<Point[]>(initialStars);
  const [hazards, setHazards] = useState<Hazard[]>(initialHazards);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(readBestScore);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [streak, setStreak] = useState(0);
  const [comboVisible, setComboVisible] = useState(false);
  const [lastGain, setLastGain] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const statusRef = useRef<GameStatus>('ready');
  const playerRef = useRef<Point>({ x: 50, y: 72 });
  const starsRef = useRef<Point[]>(initialStars);
  const hazardsRef = useRef<Hazard[]>(initialHazards);
  const scoreRef = useRef(0);
  const timeRef = useRef(GAME_DURATION);
  const streakRef = useRef(0);
  const directionRef = useRef<Record<Direction, boolean>>({ up: false, down: false, left: false, right: false });
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  const setGameStatus = useCallback((next: GameStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const finishGame = useCallback(() => {
    const finalScore = scoreRef.current;
    const previousBest = readBestScore();
    const newRecord = finalScore > previousBest;
    if (newRecord) {
      try {
        window.localStorage.setItem(BEST_SCORE_KEY, String(finalScore));
      } catch {
        // Local persistence is optional when storage is unavailable.
      }
      setBestScore(finalScore);
    }
    setIsNewBest(newRecord);
    setGameStatus('over');
  }, [setGameStatus]);

  const beginGame = useCallback(() => {
    const freshStars = initialStars.map((star) => ({ ...star }));
    const freshHazards = initialHazards.map((hazard) => ({ ...hazard }));
    playerRef.current = { x: 50, y: 72 };
    starsRef.current = freshStars;
    hazardsRef.current = freshHazards;
    scoreRef.current = 0;
    timeRef.current = GAME_DURATION;
    streakRef.current = 0;
    directionRef.current = { up: false, down: false, left: false, right: false };
    setPlayer(playerRef.current);
    setStars(freshStars);
    setHazards(freshHazards);
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setStreak(0);
    setLastGain(0);
    setIsNewBest(false);
    setGameStatus('playing');
  }, [setGameStatus]);

  const togglePause = useCallback(() => {
    if (statusRef.current === 'playing') setGameStatus('paused');
    else if (statusRef.current === 'paused') setGameStatus('playing');
  }, [setGameStatus]);

  const setDirection = useCallback((direction: Direction, pressed: boolean) => {
    directionRef.current[direction] = pressed;
  }, []);

  useEffect(() => {
    const keyMap: Record<string, Direction> = {
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = keyMap[event.key];
      if (direction) {
        event.preventDefault();
        setDirection(direction, true);
      }
      if (event.key === ' ' || event.key === 'Escape') {
        event.preventDefault();
        if (statusRef.current === 'ready' || statusRef.current === 'over') beginGame();
        else togglePause();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const direction = keyMap[event.key];
      if (direction) setDirection(direction, false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [beginGame, setDirection, togglePause]);

  useEffect(() => {
    if (status !== 'playing') {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastFrameRef.current = null;
      return;
    }
    const tick = (now: number) => {
      if (statusRef.current !== 'playing') return;
      const previous = lastFrameRef.current ?? now;
      const delta = Math.min((now - previous) / 1000, 0.05);
      lastFrameRef.current = now;

      const direction = directionRef.current;
      const nextPlayer = { ...playerRef.current };
      const speed = 31;
      if (direction.up) nextPlayer.y -= speed * delta;
      if (direction.down) nextPlayer.y += speed * delta;
      if (direction.left) nextPlayer.x -= speed * delta;
      if (direction.right) nextPlayer.x += speed * delta;
      nextPlayer.x = Math.max(8, Math.min(92, nextPlayer.x));
      nextPlayer.y = Math.max(10, Math.min(90, nextPlayer.y));
      playerRef.current = nextPlayer;
      setPlayer(nextPlayer);

      const nextHazards = hazardsRef.current.map((hazard) => {
        const next = { ...hazard, x: hazard.x + hazard.vx * delta, y: hazard.y + hazard.vy * delta };
        if (next.x < 9 || next.x > 91) { next.vx *= -1; next.x = Math.max(9, Math.min(91, next.x)); }
        if (next.y < 11 || next.y > 89) { next.vy *= -1; next.y = Math.max(11, Math.min(89, next.y)); }
        return next;
      });
      hazardsRef.current = nextHazards;
      setHazards(nextHazards);

      const remainingStars = starsRef.current.map((star) => ({ ...star }));
      let collected = false;
      remainingStars.forEach((star, index) => {
        const distance = Math.hypot(star.x - nextPlayer.x, star.y - nextPlayer.y);
        if (distance < 5.2) {
          const nextStreak = streakRef.current + 1;
          const gain = 100 + Math.min(nextStreak, 8) * 25;
          scoreRef.current += gain;
          streakRef.current = nextStreak;
          setScore(scoreRef.current);
          setStreak(nextStreak);
          setLastGain(gain);
          setComboVisible(true);
          window.setTimeout(() => setComboVisible(false), 500);
          remainingStars[index] = randomStar();
          collected = true;
        }
      });
      if (collected) {
        starsRef.current = remainingStars;
        setStars(remainingStars);
      }

      if (!collected && streakRef.current > 0) {
        streakRef.current = Math.max(0, streakRef.current - delta * 0.35);
        setStreak(Math.floor(streakRef.current));
      }

      timeRef.current = Math.max(0, timeRef.current - delta);
      setTimeLeft(Math.ceil(timeRef.current));
      const hit = nextHazards.some((hazard) => Math.hypot(hazard.x - nextPlayer.x, hazard.y - nextPlayer.y) < 7.2);
      if (hit || timeRef.current <= 0) {
        finishGame();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [finishGame, status]);

  const timerPercent = (timeLeft / GAME_DURATION) * 100;
  const multiplier = 1 + Math.min(Math.floor(streak / 3), 4);
  const statusLabel = status === 'playing' ? 'Run in progress' : status === 'paused' ? 'Run paused' : status === 'over' ? 'Run complete' : 'Ready to launch';

  return (
    <main className="game-shell px-4 pb-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="game-header flex items-center justify-between gap-4 py-5 sm:py-7">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-[hsl(57_100%_68%/.35)] bg-[hsl(57_100%_68%/.10)] text-[hsl(var(--primary))]">
              <Sparkles size={21} strokeWidth={2.2} />
            </div>
            <div>
              <div className="eyebrow text-[10px] text-[hsl(var(--muted-foreground))]">Arcade / 001</div>
              <h1 className="text-2xl font-extrabold tracking-[-.04em] text-[hsl(var(--foreground))] sm:text-3xl">STAR DASH</h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-right sm:flex">
            <div className="eyebrow text-[10px] leading-5 text-[hsl(var(--muted-foreground))]">Best orbit<br /><span className="text-[hsl(var(--primary))]">personal record</span></div>
            <div className="mono text-2xl font-bold text-[hsl(var(--foreground))]" data-testid="text-best-score-header">{String(bestScore).padStart(4, '0')}</div>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px] lg:gap-7">
          <section className="min-w-0">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <div className="eyebrow mb-1 text-[10px] text-[hsl(var(--secondary))]">Sector: Lumen field</div>
                <h2 className="text-xl font-bold tracking-[-.03em] text-[hsl(var(--foreground))] sm:text-2xl">Collect. Chain. Escape.</h2>
              </div>
              <div className="eyebrow hidden text-[10px] text-[hsl(var(--muted-foreground))] sm:block">45 sec sprint</div>
            </div>

            <div className="arena-frame">
              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="hud-pill rounded-xl px-3 py-2 sm:px-4">
                  <div className="eyebrow flex items-center gap-1.5 text-[9px] text-[hsl(var(--muted-foreground))]"><Crosshair size={11} /> Score</div>
                  <div className="mono mt-1 text-xl font-bold tabular-nums text-[hsl(var(--foreground))]" data-testid="text-score">{String(score).padStart(4, '0')}</div>
                </div>
                <div className="hud-pill rounded-xl px-3 py-2 sm:px-4">
                  <div className="eyebrow flex items-center gap-1.5 text-[9px] text-[hsl(var(--muted-foreground))]"><Zap size={11} /> Streak</div>
                  <div className="mono mt-1 text-xl font-bold tabular-nums text-[hsl(var(--primary))]" data-testid="text-streak">{String(Math.floor(streak)).padStart(2, '0')} <span className="text-xs text-[hsl(var(--muted-foreground))]">x{multiplier}</span></div>
                </div>
                <div className="hud-pill rounded-xl px-3 py-2 sm:px-4">
                  <div className="eyebrow flex items-center gap-1.5 text-[9px] text-[hsl(var(--muted-foreground))]"><Clock3 size={11} /> Time</div>
                  <div className={`mono mt-1 text-xl font-bold tabular-nums ${timeLeft <= 10 ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--foreground))]'}`} data-testid="text-time">{String(timeLeft).padStart(2, '0')}<span className="text-xs text-[hsl(var(--muted-foreground))]">s</span></div>
                </div>
              </div>

              <div className="arena" role="application" aria-label="Star Dash game arena">
                <div className="absolute left-4 top-4 z-[3] flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                  <span className={`legend-dot ${status === 'playing' ? 'bg-[hsl(140_69%_62%)]' : 'bg-[hsl(var(--muted-foreground))]'}`} />
                  <span className="eyebrow">{statusLabel}</span>
                </div>
                <div className="absolute right-4 top-4 z-[3] mono text-[10px] text-[hsl(var(--muted-foreground))]">SECTOR 07 / {String(Math.floor(score / 100) + 1).padStart(2, '0')}</div>
                {stars.map((star, index) => (
                  <div className="arena-object star" key={`star-${index}`} style={{ left: `${star.x}%`, top: `${star.y}%` }} aria-label="Collectible star" data-testid={`star-${index}`} />
                ))}
                {hazards.map((hazard, index) => (
                  <div className="arena-object hazard" key={`hazard-${index}`} style={{ left: `${hazard.x}%`, top: `${hazard.y}%` }} aria-label="Moving hazard" data-testid={`hazard-${index}`} />
                ))}
                <div className="arena-object player" style={{ left: `${player.x}%`, top: `${player.y}%` }} aria-label="Your glowing player" data-testid="player" />
                {comboVisible && (
                  <div className="score-pop pointer-events-none absolute z-[4]" style={{ left: `${player.x}%`, top: `${player.y - 8}%` }} data-testid="score-pop">
                    <div className="mono text-xl font-bold text-[hsl(var(--primary))]">+{lastGain}</div>
                    <div className="eyebrow text-[9px] text-[hsl(var(--secondary))]">chain locked</div>
                  </div>
                )}

                {status !== 'playing' && (
                  <div className="screen-overlay">
                    <div className="overlay-card">
                      {status === 'ready' && <><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_0_34px_hsl(57_100%_68%/.25)]"><Gem size={28} /></div><div className="eyebrow mb-2 text-[10px] text-[hsl(var(--secondary))]">A tiny universe. A big score.</div><h3 className="text-3xl font-extrabold tracking-[-.05em] text-[hsl(var(--foreground))]">Ready to orbit?</h3><p className="mx-auto mt-3 max-w-[290px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">Sweep through the field, grab every star, and keep your streak alive. The red rings are not friendly.</p><button className="arcade-button mt-6 w-full" onClick={beginGame} data-testid="button-start"><Play size={15} fill="currentColor" /> Launch run</button><div className="eyebrow mt-4 text-[9px] text-[hsl(var(--muted-foreground))]">Press space to start</div></>}
                      {status === 'paused' && <><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[hsl(var(--secondary)/.15)] text-[hsl(var(--secondary))]"><Pause size={27} /></div><div className="eyebrow mb-2 text-[10px] text-[hsl(var(--secondary))]">Telemetry frozen</div><h3 className="text-3xl font-extrabold tracking-[-.05em]">On pause</h3><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Your position is safe. Take a breath, then find the next star.</p><button className="arcade-button mt-6 w-full" onClick={togglePause} data-testid="button-resume"><Play size={15} fill="currentColor" /> Resume run</button></>}
                      {status === 'over' && <><div className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl ${isNewBest ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--accent)/.16)] text-[hsl(var(--accent))]'}`}><Trophy size={28} /></div><div className="eyebrow mb-2 text-[10px] text-[hsl(var(--accent))]">{isNewBest ? 'New personal record' : 'Signal faded'}</div><h3 className="text-3xl font-extrabold tracking-[-.05em]">{isNewBest ? 'Orbit upgraded.' : 'Run complete.'}</h3><div className="mono mt-4 text-5xl font-bold tracking-[-.08em] text-[hsl(var(--primary))]" data-testid="text-final-score">{String(score).padStart(4, '0')}</div><div className="eyebrow mt-1 text-[9px] text-[hsl(var(--muted-foreground))]">final score</div><button className="arcade-button mt-6 w-full" onClick={beginGame} data-testid="button-restart-overlay"><RotateCcw size={15} /> Run it back</button></>}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[hsl(246_27%_17%)]" aria-label="Countdown progress">
                <div className={`h-full rounded-full transition-[width] duration-300 ${timeLeft <= 10 ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--primary))]'}`} style={{ width: `${timerPercent}%` }} data-testid="progress-time" />
              </div>
            </div>

            <div className="control-panel mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-3">
                <button className="icon-button" onClick={togglePause} disabled={status === 'ready' || status === 'over'} aria-label={status === 'paused' ? 'Resume game' : 'Pause game'} data-testid="button-pause">
                  {status === 'paused' ? <Play size={17} fill="currentColor" /> : <Pause size={17} />}
                </button>
                <button className="icon-button" onClick={beginGame} aria-label="Restart game" data-testid="button-restart"><RotateCcw size={17} /></button>
                <div className="hidden pl-1 sm:block"><div className="eyebrow text-[9px] text-[hsl(var(--muted-foreground))]">Quick controls</div><div className="mt-1 flex items-center gap-2 text-xs text-[hsl(var(--foreground))]"><Keyboard size={13} className="text-[hsl(var(--secondary))]" /> Arrow keys or WASD <span className="text-[hsl(var(--muted-foreground))]">·</span> Space pause</div></div>
              </div>
              <div className="flex items-center gap-2 self-end text-right"><ShieldAlert size={16} className="text-[hsl(var(--accent))]" /><div><div className="eyebrow text-[9px] text-[hsl(var(--accent))]">Watch the hazards</div><div className="text-xs text-[hsl(var(--muted-foreground))]">One touch ends the run</div></div></div>
            </div>
          </section>

          <aside className="side-card flex flex-col gap-4">
            <div className="rounded-2xl border border-[hsl(248_28%_23%)] bg-[hsl(247_39%_12%/.68)] p-5">
              <div className="eyebrow text-[10px] text-[hsl(var(--secondary))]">Mission brief</div>
              <h3 className="mt-2 text-xl font-bold tracking-[-.03em]">Make the field glow.</h3>
              <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Collect stars in rapid succession to build a streak multiplier. Every second is a chance to beat your orbit.</p>
              <div className="my-5 h-px bg-[hsl(248_28%_23%)]" />
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-3"><span className="legend-dot bg-[hsl(var(--secondary))]" /><span className="text-[hsl(var(--muted-foreground))]">Star collected</span><span className="mono ml-auto text-[hsl(var(--secondary))]">+100</span></div>
                <div className="flex items-center gap-3"><span className="legend-dot bg-[hsl(var(--accent))]" /><span className="text-[hsl(var(--muted-foreground))]">Moving hazard</span><span className="mono ml-auto text-[hsl(var(--accent))]">avoid</span></div>
                <div className="flex items-center gap-3"><span className="legend-dot bg-[hsl(var(--primary))]" /><span className="text-[hsl(var(--muted-foreground))]">Streak bonus</span><span className="mono ml-auto text-[hsl(var(--primary))]">x{multiplier}</span></div>
              </div>
            </div>
            <div className="rounded-2xl border border-[hsl(248_28%_23%)] bg-[hsl(247_39%_12%/.68)] p-5">
              <div className="eyebrow flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]"><Trophy size={13} className="text-[hsl(var(--primary))]" /> Personal best</div>
              <div className="mono mt-2 text-4xl font-bold tracking-[-.07em] text-[hsl(var(--foreground))]" data-testid="text-best-score">{String(bestScore).padStart(4, '0')}</div>
              <div className="mt-3 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Gauge size={13} className="text-[hsl(var(--secondary))]" /> Keep your route tight</div>
            </div>
          </aside>
        </div>

        <footer className="mt-7 flex flex-col gap-3 border-t border-[hsl(248_28%_23%)] pt-4 text-[10px] text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between">
          <div className="eyebrow">Star Dash / a quick challenge for bright minds</div>
          <div className="flex items-center gap-2"><span>Built for keyboard + touch</span><span className="h-1 w-1 rounded-full bg-[hsl(var(--secondary))]" /><span>Best score saves locally</span></div>
        </footer>

        <div className="mx-auto mt-5 grid w-[218px] grid-cols-3 gap-2 md:hidden" aria-label="Touch movement controls">
          <div />
          <TouchButton direction="up" icon={<ArrowUp size={20} />} onDirection={setDirection} />
          <div />
          <TouchButton direction="left" icon={<ArrowLeft size={20} />} onDirection={setDirection} />
          <TouchButton direction="down" icon={<ArrowDown size={20} />} onDirection={setDirection} />
          <TouchButton direction="right" icon={<ArrowRight size={20} />} onDirection={setDirection} />
        </div>
      </div>
    </main>
  );
}

function TouchButton({ direction, icon, onDirection }: { direction: Direction; icon: ReactNode; onDirection: (direction: Direction, pressed: boolean) => void }) {
  return (
    <button
      className="dpad-button"
      data-held={false}
      aria-label={`Move ${direction}`}
      data-testid={`button-move-${direction}`}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.held = 'true'; onDirection(direction, true); }}
      onPointerUp={(event) => { event.currentTarget.dataset.held = 'false'; onDirection(direction, false); }}
      onPointerCancel={(event) => { event.currentTarget.dataset.held = 'false'; onDirection(direction, false); }}
      onPointerLeave={(event) => { if (event.currentTarget.dataset.held === 'true') { event.currentTarget.dataset.held = 'false'; onDirection(direction, false); } }}
    >
      {icon}
    </button>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Game} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;