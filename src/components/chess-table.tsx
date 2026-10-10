"use client";

import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { chooseMove } from "@/lib/engine";
import { narrate, PIECE_LESSONS, pieceName, SETUP_LESSON, type Lesson } from "@/lib/teach";
import { Piece } from "@/components/piece";

type Seat = Color | "both";

type LogEntry = {
  san: string;
  text: string;
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;
const PROMOTIONS = ["q", "r", "b", "n"] as const satisfies readonly PieceSymbol[];

const PROMOTION_NAME: Record<(typeof PROMOTIONS)[number], string> = {
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function stepSquare(square: Square, key: string, orientation: Color): Square {
  let file = square.charCodeAt(0) - 97;
  let rank = Number(square[1]);
  const whiteBottom = orientation === "w";
  if (key === "ArrowRight") file += whiteBottom ? 1 : -1;
  if (key === "ArrowLeft") file += whiteBottom ? -1 : 1;
  if (key === "ArrowUp") rank += whiteBottom ? 1 : -1;
  if (key === "ArrowDown") rank += whiteBottom ? -1 : 1;
  file = Math.max(0, Math.min(7, file));
  rank = Math.max(1, Math.min(8, rank));
  return `${String.fromCharCode(97 + file)}${rank}` as Square;
}

function positionCopy(chess: Chess, seat: Seat) {
  const side = chess.turn() === "w" ? "White" : "Black";
  if (chess.isCheckmate()) {
    const winner = chess.turn() === "w" ? "Black" : "White";
    return {
      title: `${winner} wins by checkmate`,
      detail: `${side}’s king is attacked, and every reply still loses. A king gets out of check by moving away, blocking the attack, or capturing the checking piece. None of those exist here. The king is never captured.`,
      tone: "over" as const,
    };
  }
  if (chess.isStalemate()) {
    return {
      title: "Draw by stalemate",
      detail: `${side} is not in check, but has no legal move. That is a draw. Checkmate requires the king to be attacked.`,
      tone: "over" as const,
    };
  }
  if (chess.isInsufficientMaterial()) {
    return {
      title: "Draw by insufficient material",
      detail:
        "Neither side has enough force to force checkmate. A lone king, or a king with only a knight or only a bishop, cannot force mate against a bare king.",
      tone: "over" as const,
    };
  }
  if (chess.isThreefoldRepetition()) {
    return {
      title: "Draw by repetition",
      detail: "The same position has occurred three times. The game is drawn.",
      tone: "over" as const,
    };
  }
  if (chess.isDrawByFiftyMoves()) {
    return {
      title: "Draw by the fifty-move rule",
      detail: "Fifty moves have passed without a pawn move or a capture, so the game is drawn.",
      tone: "over" as const,
    };
  }
  if (chess.isDraw()) {
    return {
      title: "Draw",
      detail: "The position is drawn. Neither side can win from here under the rules.",
      tone: "over" as const,
    };
  }
  if (chess.isCheck()) {
    return {
      title: `${side} is in check`,
      detail: `The ${side.toLowerCase()} king is attacked. This move has to escape, block, or capture the attacker. Any other move is illegal.`,
      tone: "check" as const,
    };
  }

  const you =
    seat === "both"
      ? `${side} moves one piece.`
      : seat === chess.turn()
        ? `Your turn as ${side}.`
        : `${side} is replying.`;

  return {
    title: `${side} to move`,
    detail: `${you} Click a piece of that color. Dots mark empty squares it can use, and rings mark captures.`,
    tone: "play" as const,
  };
}

export function ChessTable() {
  const [sans, setSans] = useState<string[]>([]);
  const [seat, setSeat] = useState<Seat>("both");
  const [orientation, setOrientation] = useState<Color>("w");
  const [selected, setSelected] = useState<Square | null>(null);
  const [cursor, setCursor] = useState<Square>("e2");
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [reading, setReading] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const queenButton = useRef<HTMLButtonElement>(null);
  const squareButtons = useRef(new Map<Square, HTMLButtonElement>());
  const scoreList = useRef<HTMLOListElement>(null);

  const chess = useMemo(() => {
    const game = new Chess();
    for (const san of sans) game.move(san);
    return game;
  }, [sans]);
  const computerColor: Color | null = seat === "both" ? null : seat === "w" ? "b" : "w";
  const computerToMove = computerColor !== null && chess.turn() === computerColor && !chess.isGameOver();
  const status = positionCopy(chess, seat);
  const history = chess.history({ verbose: true });
  const log: LogEntry[] = history.map((move, index) => ({
    san: move.san,
    text: narrate(move, index > 0 && /[+#]$/.test(history[index - 1]?.san ?? "")),
  }));
  const lastMove = history.at(-1) ?? null;
  const legal = selected ? chess.moves({ square: selected, verbose: true }) : [];
  const selectedPiece = selected ? chess.get(selected) : undefined;
  const lessonPiece = selectedPiece?.type ?? lastMove?.piece;
  const lesson: Lesson = lessonPiece ? PIECE_LESSONS[lessonPiece] : SETUP_LESSON;
  const kingSquare = chess.isCheck()
    ? chess.findPiece({ type: "k", color: chess.turn() })[0]
    : undefined;
  const shownMove = reading !== null ? log[reading] : log.at(-1);
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const ranks = orientation === "w" ? RANKS : [...RANKS].reverse();

  const captured = { w: [] as PieceSymbol[], b: [] as PieceSymbol[] };
  for (const move of history) {
    if (move.captured) captured[move.color === "w" ? "b" : "w"].push(move.captured);
  }

  useEffect(() => {
    if (!computerColor || !computerToMove) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const next = new Chess();
      for (const san of sans) next.move(san);
      if (next.turn() !== computerColor || next.isGameOver()) return;
      const choice = chooseMove(next.fen());
      if (!choice || cancelled) return;
      const played = next.move(choice);
      if (cancelled) return;
      setSans((current) => [...current, played.san]);
      setReading(null);
      setSelected(null);
      setPromotion(null);
      setHint(null);
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [computerColor, computerToMove, sans]);

  useEffect(() => {
    if (promotion) queenButton.current?.focus();
  }, [promotion]);

  useEffect(() => {
    const list = scoreList.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [log.length]);

  function play(from: Square, to: Square, promotionPiece?: PieceSymbol) {
    const next = new Chess();
    for (const san of sans) next.move(san);
    const played = next.move({ from, to, promotion: promotionPiece });
    setSans((current) => [...current, played.san]);
    setReading(null);
    setSelected(null);
    setPromotion(null);
    setHint(null);
  }

  function onSquare(square: Square) {
    setCursor(square);
    if (promotion) return;
    if (chess.isGameOver()) {
      setHint("The game is over. Start a new one, or click a move in the score sheet to reread it.");
      return;
    }
    if (computerToMove) {
      setHint("The other side is choosing a reply. Your pieces move when the turn comes back.");
      return;
    }

    if (selected) {
      const matches = legal.filter((move) => move.to === square);
      if (matches.length > 0) {
        if (matches.some((move) => move.isPromotion())) {
          setPromotion({ from: selected, to: square });
          setHint("A pawn on the last rank has to become another piece. Queens are the usual choice.");
          return;
        }
        play(selected, square);
        return;
      }
    }

    const piece = chess.get(square);
    if (piece && piece.color === chess.turn()) {
      const moves = chess.moves({ square, verbose: true });
      setSelected(square);
      setHint(
        moves.length === 0
          ? `The ${pieceName(piece.type)} has no legal move. It may be blocked, or moving it would leave the king in check.`
          : null,
      );
      return;
    }

    if (piece && piece.color !== chess.turn()) {
      setHint(
        `That is ${piece.color === "w" ? "White" : "Black"}’s ${pieceName(piece.type)}. You move the side named above. You capture by landing on an enemy piece when a ring marks the square.`,
      );
      return;
    }

    if (selected) {
      const name = selectedPiece ? pieceName(selectedPiece.type) : "piece";
      setHint(`The ${name} cannot go to ${square}. Only the marked squares are legal.`);
      return;
    }

    setHint("Choose one of your pieces first. The board will mark where it can go.");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, square: Square) {
    if (event.key === "Escape") {
      setSelected(null);
      setPromotion(null);
      return;
    }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) {
      return;
    }
    event.preventDefault();
    if (event.key === "Enter" || event.key === " ") {
      onSquare(square);
      return;
    }
    const next = stepSquare(square, event.key, orientation);
    setCursor(next);
    requestAnimationFrame(() => squareButtons.current.get(next)?.focus());
  }

  function undo() {
    const steps = seat !== "both" && chess.turn() === seat ? 2 : 1;
    setSans((current) => current.slice(0, Math.max(0, current.length - steps)));
    setReading(null);
    setSelected(null);
    setPromotion(null);
    setHint("Move taken back. Try another idea, or play the same one once you know what it does.");
  }

  function newGame() {
    setSans([]);
    setReading(null);
    setSelected(null);
    setPromotion(null);
    setHint(null);
    setCursor(seat === "b" ? "e7" : "e2");
  }

  function chooseSeat(nextSeat: Seat) {
    setSeat(nextSeat);
    if (nextSeat === "w") setOrientation("w");
    if (nextSeat === "b") setOrientation("b");
    setSelected(null);
    setPromotion(null);
    setHint(null);
  }

  const rows: { number: number; white?: LogEntry & { index: number }; black?: LogEntry & { index: number } }[] = [];
  log.forEach((entry, index) => {
    if (index % 2 === 0) rows.push({ number: rows.length + 1, white: { ...entry, index } });
    else rows[rows.length - 1].black = { ...entry, index };
  });

  const announcement = [status.title, shownMove?.text ?? hint ?? status.detail].filter(Boolean).join(" ");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-semibold tracking-[0.2em] text-moss uppercase">One page</p>
          <h1 className="font-display text-4xl leading-none font-semibold tracking-tight text-ink sm:text-5xl">
            Open Board
          </h1>
          <p className="mt-3 text-lg leading-7 text-ink-soft">
            A legal game on one screen. Pick up a piece, play only where the board allows, and read what that move just did.
          </p>
        </div>
        <p className="max-w-sm text-sm leading-6 text-ink-soft">
          White moves first. Dots are empty squares. Rings are captures. The game ends at checkmate, when the king is attacked and every answer fails.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <section className="flex flex-col gap-4" aria-label="Chessboard">
          <div className="board-frame rounded-xl p-3 sm:p-4">
            <div className="flex">
              <div className="flex w-5 shrink-0 flex-col sm:w-6">
                {ranks.map((rank) => (
                  <span key={rank} className="flex flex-1 items-center justify-center text-xs font-semibold text-gold">
                    {rank}
                  </span>
                ))}
              </div>
              <div className="relative grid aspect-square min-h-0 min-w-0 flex-1 grid-cols-8 grid-rows-8">
                {ranks.map((rank) =>
                  files.map((file) => {
                    const square = `${file}${rank}` as Square;
                    const piece = chess.get(square);
                    const isDark = chess.squareColor(square) === "dark";
                    const isSelected = selected === square;
                    const canMove = legal.some((move) => move.to === square);
                    const canCapture = legal.some((move) => move.to === square && move.isCapture());
                    const isLast = lastMove?.from === square || lastMove?.to === square;
                    const inCheck = kingSquare === square;
                    const label = [
                      `${square}, ${isDark ? "dark" : "light"} square`,
                      piece ? `${piece.color === "w" ? "white" : "black"} ${pieceName(piece.type)}` : "empty",
                      canCapture ? "legal capture" : canMove ? "legal move" : "",
                      isSelected ? "selected" : "",
                      inCheck ? "king in check" : "",
                    ]
                      .filter(Boolean)
                      .join(", ");

                    return (
                      <button
                        key={square}
                        type="button"
                        data-square={square}
                        ref={(node) => {
                          if (node) squareButtons.current.set(square, node);
                          else squareButtons.current.delete(square);
                        }}
                        tabIndex={cursor === square ? 0 : -1}
                        aria-pressed={isSelected}
                        aria-label={label}
                        onClick={() => onSquare(square)}
                        onKeyDown={(event) => onKeyDown(event, square)}
                        className={cx(
                          "square flex h-full w-full items-center justify-center",
                          isDark ? "bg-[#8d6244]" : "bg-[#f3e6cf]",
                        )}
                      >
                        {isLast && <span className="pointer-events-none absolute inset-0 bg-[color:var(--last)]" />}
                        {inCheck && (
                          <span className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_3px_var(--check)]" />
                        )}
                        {isSelected && (
                          <span className="pointer-events-none absolute inset-0 z-[1] shadow-[inset_0_0_0_3px_#f0d78c]" />
                        )}
                        {canMove && !piece && (
                          <span
                            className={cx(
                              "pointer-events-none absolute z-[1] size-[18%] rounded-full",
                              isDark ? "bg-cream" : "bg-moss",
                            )}
                          />
                        )}
                        {canCapture && (
                          <span
                            className={cx(
                              "pointer-events-none absolute z-[1] inset-[8%] rounded-full border-[3px]",
                              isDark ? "border-cream" : "border-moss",
                            )}
                          />
                        )}
                        {piece && (
                          <Piece
                            type={piece.type}
                            color={piece.color}
                            className={cx("piece relative z-[1] h-[82%] w-[82%]", isSelected && "is-selected")}
                          />
                        )}
                      </button>
                    );
                  }),
                )}
                {promotion && (
                  <div
                    role="dialog"
                    aria-label="Choose a promotion piece"
                    className="absolute inset-x-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-3 rounded-lg bg-cream p-3 shadow-lg"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        setPromotion(null);
                      }
                    }}
                  >
                    <p className="text-sm leading-5 text-ink">
                      This pawn must leave the pawn ranks. Choose what it becomes.
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {PROMOTIONS.map((type) => (
                        <button
                          key={type}
                          type="button"
                          ref={type === "q" ? queenButton : undefined}
                          className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-md bg-moss px-2 py-2 text-xs font-semibold text-cream focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#f0d78c]"
                          onClick={() => play(promotion.from, promotion.to, type)}
                        >
                          <Piece type={type} color={chess.turn()} className="h-8 w-8" />
                          {PROMOTION_NAME[type]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-1 grid grid-cols-8 pr-0 pl-5 sm:pl-6">
              {files.map((file) => (
                <span key={file} className="text-center text-xs font-semibold text-gold uppercase">
                  {file}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={newGame} className="min-h-11 rounded-md bg-moss px-4 text-sm font-semibold text-cream hover:bg-[#16362a] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss">
              New game
            </button>
            <button
              type="button"
              onClick={undo}
              disabled={history.length === 0 || computerToMove}
              className="min-h-11 rounded-md border border-[#c9b69a] bg-cream px-4 text-sm font-semibold text-ink hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss"
            >
              Take back
            </button>
            <button
              type="button"
              onClick={() => setOrientation((current) => (current === "w" ? "b" : "w"))}
              className="min-h-11 rounded-md border border-[#c9b69a] bg-cream px-4 text-sm font-semibold text-ink hover:bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss"
            >
              Flip board
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Who moves the pieces">
            {(
              [
                ["both", "Pass and play"],
                ["w", "You play White"],
                ["b", "You play Black"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={seat === value}
                onClick={() => chooseSeat(value)}
                className={cx(
                  "min-h-11 rounded-md px-3 text-sm font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss",
                  seat === value ? "bg-ink text-cream" : "border border-[#c9b69a] bg-cream text-ink hover:bg-white",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto" aria-label="How this position works">
          <section
            className={cx(
              "rounded-xl border bg-cream px-4 py-4",
              status.tone === "check" && "border-check",
              status.tone === "over" && "border-moss",
              status.tone === "play" && "border-[#e2d3ba]",
            )}
          >
            <h2 className="font-display text-2xl font-semibold text-ink">{status.title}</h2>
            <p className="mt-2 text-base leading-6 text-ink-soft">{status.detail}</p>
            {computerToMove && <p className="mt-2 text-sm font-semibold text-moss">Choosing a reply…</p>}
          </section>

          <section className="rounded-xl border border-[#e2d3ba] bg-cream px-4 py-4">
            <h2 className="font-display text-2xl font-semibold text-ink">{lesson.name}</h2>
            <p className="mt-1 text-base leading-6 text-ink">{lesson.summary}</p>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-6 text-ink-soft">
              {lesson.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
            {!selected && lastMove && (
              <p className="mt-3 text-sm leading-6 text-ink-soft">
                These are the rules for the {lesson.name.toLowerCase()}, because that piece just moved. Click any piece to read a different one.
              </p>
            )}
            {selected && (
              <p className="mt-3 text-sm font-semibold text-moss">
                {legal.length === 0
                  ? "No legal square this turn."
                  : `${legal.length} legal ${legal.length === 1 ? "square" : "squares"} this turn.`}
                {legal.some((move) => move.isKingsideCastle() || move.isQueensideCastle())
                  ? " Castling is one of them."
                  : ""}
              </p>
            )}
          </section>

          <section className="rounded-xl border border-[#e2d3ba] bg-cream px-4 py-4">
            <h2 className="font-display text-2xl font-semibold text-ink">
              {shownMove ? "What that move did" : "What a move will tell you"}
            </h2>
            <p className="mt-2 text-base leading-6 text-ink-soft">
              {shownMove?.text ??
                hint ??
                "After each move, this panel says which piece moved, whether it captured, and whether the king is in check."}
            </p>
            {hint && shownMove && <p className="mt-2 text-sm leading-6 text-ink">{hint}</p>}
          </section>

          <section className="rounded-xl border border-[#e2d3ba] bg-cream px-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold text-ink">Score sheet</h2>
              <p className="text-xs tracking-wide text-ink-soft uppercase">Click a move to reread it</p>
            </div>
            <Captured label="White took" pieces={captured.b} color="b" />
            <Captured label="Black took" pieces={captured.w} color="w" />
            {rows.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-ink-soft">No moves yet. White starts, often with a pawn toward the center.</p>
            ) : (
              <ol ref={scoreList} className="mt-3 flex max-h-72 flex-col gap-1 overflow-auto overscroll-contain pr-1">
                {rows.map((row) => (
                  <li key={row.number} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-1">
                    <span className="text-sm text-ink-soft">{row.number}.</span>
                    <ScoreMove
                      entry={row.white}
                      active={(reading ?? log.length - 1) === row.white?.index}
                      onRead={setReading}
                    />
                    <ScoreMove
                      entry={row.black}
                      active={(reading ?? log.length - 1) === row.black?.index}
                      onRead={setReading}
                    />
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-xs leading-5 text-ink-soft">
              A pawn move is just the square, like e4. N, B, R, Q, and K name the other pieces. x is a capture, + is check, # is checkmate. O-O is kingside castling, and O-O-O is queenside.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Captured({ label, pieces, color }: { label: string; pieces: PieceSymbol[]; color: Color }) {
  if (pieces.length === 0) return null;
  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{label}</span>
      <span className="flex items-center">
        {pieces.map((type, index) => (
          <Piece key={`${type}-${index}`} type={type} color={color} className="piece -ml-1 h-7 w-7 first:ml-0" />
        ))}
      </span>
    </div>
  );
}

function ScoreMove({
  entry,
  active,
  onRead,
}: {
  entry?: LogEntry & { index: number };
  active: boolean;
  onRead: (index: number) => void;
}) {
  if (!entry) return <span />;
  return (
    <button
      type="button"
      onClick={() => onRead(entry.index)}
      className={cx(
        "min-h-11 rounded-md px-2 text-left text-sm font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss",
        active ? "bg-moss text-cream" : "text-ink hover:bg-[#efe4d2]",
      )}
    >
      {entry.san}
    </button>
  );
}
